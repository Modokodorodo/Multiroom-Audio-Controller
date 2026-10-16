import test from 'node:test';
import net from 'node:net';
import assert from 'node:assert/strict';
import {ClearOneTelnet} from '../src/clearone-telnet.js';
import {LiveController} from '../src/live-controller.js';
// Fake ClearOne (SIMULATED): IAC negotiation, login, fragmented replies. Records everything received.
function fake(received) {
  return net.createServer(s => {
    s.write(Buffer.concat([Buffer.from([255, 253, 1]), Buffer.from('Converge\r\nuser: ')]));
    let stage = 0, buf = '';
    s.on('data', d => {
      for (const b of d) { if (b === 255) continue; buf += String.fromCharCode(b); }
      while (buf.includes('\r')) {
        const line = buf.slice(0, buf.indexOf('\r')); buf = buf.slice(buf.indexOf('\r') + 1);
        if (line.length === 0) continue;
        received.push(line);
        if (stage === 0) { stage = 1; s.write('\r\npass: '); }
        else if (stage === 1) { stage = 2; s.write('\r\nAuthenticated.\r\n'); }
        else {
          const g = /^#D0 GAIN (\d+) [OML]$/.exec(line);
          const reply = g ? `${line} -35.00 A` : line.replace(/^(#D0 LABEL .*)$/, '$1 Name').replace(/^(#D0 AGCSET .*)$/, '$1 -25 0 2.00 18.00').replace(/^(#D0 AGC [^S].*)$/, '$1 1').replace(/^(#D0 MUTE .*)$/, '$1 0').replace(/^(#D0 MTRX .*)$/, '$1 0').replace(/^(#D0 VER)$/, '$1 4.4.0.31').replace(/^(#D0 ADPRESENT)$/, '$1 5 0 0 0 0');
          s.write('\r\nOK> ' + reply.slice(0, 6)); setTimeout(() => s.write(reply.slice(6) + '\r\nOK> '), 5);
        }
      }
    });
  });
}
const listen = async received => { const srv = fake(received); await new Promise(r => srv.listen(0, '127.0.0.1', r)); return srv; };
test('client refuses non-whitelisted commands and never transmits them', async () => {
  const rx = [], srv = await listen(rx);
  const t = new ClearOneTelnet({host: '127.0.0.1', port: srv.address().port, timeoutMs: 500});
  await t.connect('u', 'p');
  for (const bad of ['#D0 GAIN 1 O -30.0 A', '#D0 MUTE 1 O 1', '#D0 MTRX 1 M 1 O 3', '#D0 MTRX 1 M 1 O', '#D0 LABEL 1 O 0 X', '#D* VER', '#D0 VER\r#D0 MUTE 1 O 1', '#D0 PRESET 1', '#D0 GAIN 13 O'])
    if (bad !== '#D0 MTRX 1 M 1 O') await assert.rejects(t.query(bad), /Refused/);
  assert.equal(await t.query('#D0 VER'), '4.4.0.31');
  assert.equal(await t.query('#D0 GAIN 3 O'), '-35.00 A'); // reply split mid-line
  assert.deepEqual(rx.slice(2), ['#D0 VER', '#D0 GAIN 3 O']);
  t.close(); srv.close();
});
test('live controller reads state, validates changes and detects unconfirmed writes', async () => {
  const rx = [], srv = await listen(rx);
  const c = new LiveController({host: '127.0.0.1', user: 'u', pass: 'p', timeoutMs: 800});
  c.device = null;
  const orig = c.connect.bind(c);
  // Point the controller at the fake port.
  const {ClearOneTelnet: R} = await import('../src/clearone-telnet.js');
  const port = srv.address().port;
  c.connect = async function () { this.device = new R({host: '127.0.0.1', port, timeoutMs: 800}); await this.device.connect('u', 'p'); await this.refresh(); };
  await c.connect();
  const s = c.state();
  assert.equal(s.status, 'ready'); assert.equal(s.rooms.length, 3); assert.deepEqual(s.rooms.map(r => r.name), ['Toilet', 'Kitchen extension', 'Laundry room']);
  assert.equal(s.rooms[0].gainDb, -35); assert.equal(s.rooms[0].muted, false);
  await assert.rejects(c.update('toilet', {gainDb: -10}, s.revision), /room limits/);
  await assert.rejects(c.update('toilet', {sourceId: 'x'}, s.revision), /Unknown setting/);
  await assert.rejects(c.update('toilet', {source: {id: 'nope', on: true}}, s.revision), /Unknown source/);
  await assert.rejects(c.update('toilet', {source: {id: 'alexa', on: 1}}, s.revision), /boolean/);
  for (const bad of [16, -41, '-10', NaN]) await assert.rejects(c.setInputGain('birds', bad), /Input gain must be/);
  await assert.rejects(c.setInputGain('nope', -5), /Unknown source/);
  await assert.rejects(c.setInputAgc('nope', true), /Unknown source/);
  const okv = {thresholdDb: -25, targetDb: 0, responseS: 2, maxGainDb: 18};
  await assert.rejects(c.setInputAgcSettings('nope', okv), /Unknown source/);
  for (const bad of [{thresholdDb: 1}, {thresholdDb: -51}, {thresholdDb: -25.5}, {targetDb: 21}, {targetDb: -31}, {responseS: 0.05}, {responseS: 11}, {maxGainDb: 19}, {maxGainDb: -1}, {maxGainDb: '18'}])
    await assert.rejects(c.setInputAgcSettings('birds', {...okv, ...bad}), /must be/);
  await assert.rejects(c.setInputAgcSettings('birds', undefined), /must be/);
  await assert.rejects(c.setInputAgc('birds', 1), /boolean/);
  assert.deepEqual(s.inputs.map(i => i.present), [true, true, false]); // bits 1 and 3: M1 (Arylic) and M3 (Birds)
  assert.deepEqual(s.rooms[0].playing, []); // nothing routed in the fake device
  assert.equal(s.inputs[0].agc, true); assert.equal(s.inputs[0].channels[0].agcSettings.maxGainDb, 18);
  assert.deepEqual(s.inputs.map(i => [i.id, i.channels.length, i.gainDb]), [['arylic', 2, -35], ['birds', 1, -35], ['alexa', 1, -35]]);
  assert.deepEqual(s.rooms[0].mix.map(m => [m.id, m.on]), [['arylic', false], ['birds', false], ['alexa', false]]);
  await assert.rejects(c.update('o5', {muted: true}, s.revision), /Unknown room/);
  assert.ok(rx.slice(2).every(l => /^#D0 (VER|ADPRESENT|LABEL|GAIN|MUTE|MTRX|AGC|AGCSET)( |$)/.test(l))); // nothing written so far
  // The fake device ignores writes, so readback must NOT confirm.
  await assert.rejects(c.update('toilet', {gainDb: -40}, c.state().revision), /Readback did not confirm/);
  assert.ok(rx.includes('#D0 GAIN 1 O -40.0 A'));
  assert.equal(c.state().status, 'error');
  c.disconnect(); assert.equal(c.state().status, 'disconnected'); srv.close();
});
test('write whitelist: only the documented settings for rooms 1-3 and inputs 1-4', async () => {
  const rx = [], srv = await listen(rx);
  const t = new ClearOneTelnet({host: '127.0.0.1', port: srv.address().port, timeoutMs: 500});
  await t.connect('u', 'p');
  for (const bad of ['#D0 GAIN 1 O -30.0', '#D0 GAIN 1 O -30.0 R', '#D0 GAIN 4 O -30.0 A', '#D0 MUTE 1 O 2', '#D0 MUTE 13 O 1', '#D0 MTRX 1 M 1 O 0', '#D0 GAIN 1 O -30.0 A\r#D0 MUTE 2 O 1', '#D* MUTE 1 O 1', '#D0 GAIN 1 O 999.0 A', '#D0 MTRX 4 M 1 O 1', '#D0 MTRX 3 M 1 O 4', '#D0 MTRX 1 M 1 O 3', '#D0 MTRX B P 1 O 1', '#D0 MTRX A P 4 O 1', '#D0 MTRX A P 1 O 2', '#D0 MTRXLVL 3 M 1 O -10.0 A', '#D0 GAIN 5 M -10.0 A', '#D0 GAIN 1 L -10.0 A', '#D0 GAIN 1 M -10.0 R', '#D0 GAIN 1 M -10.0', '#D0 AGC 1 M 2', '#D0 AGC 5 M 1', '#D0 AGC 1 L 1', '#D0 AGC 1 M', '#D0 AGCSET 1 M -25 0 2 18', '#D0 AGCSET 1 M', '#D0 AGCSET 5 M -25 0 2.00 18.00', '#D0 AGCSET 1 L -25 0 2.00 18.00', '#D0 AGCSET 1 M -25 0 2.00'])
    await assert.rejects(t.write(bad), /Refused write/);
  await t.write('#D0 MUTE 2 O 1'); await t.write('#D0 MTRX A P 2 O 1'); await t.write('#D0 MTRX 4 M 3 O 3'); await t.write('#D0 MTRX 3 M 1 O 0'); await t.write('#D0 GAIN 1 M -12.5 A'); await t.write('#D0 AGC 2 M 0'); await t.write('#D0 AGCSET 3 M -25 0 2.00 6.00');
  assert.deepEqual(rx.slice(2), ['#D0 MUTE 2 O 1', '#D0 MTRX A P 2 O 1', '#D0 MTRX 4 M 3 O 3', '#D0 MTRX 3 M 1 O 0', '#D0 GAIN 1 M -12.5 A', '#D0 AGC 2 M 0', '#D0 AGCSET 3 M -25 0 2.00 6.00']);
  t.close(); srv.close();
});
test('cap editing validates before anything is saved', () => {
  const c = new LiveController({host: '127.0.0.1', user: 'u', pass: 'p'});
  for (const bad of [1, 21, NaN, '-20', -58, Infinity]) assert.throws(() => c.setCap('toilet', bad), /Cap must be/);
  assert.throws(() => c.setCap('nope', -20), /Unknown room/);
});
test('timeout and closed connection surface as errors, not success', async () => {
  const srv = net.createServer(s => s.write('user: ')); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const t = new ClearOneTelnet({host: '127.0.0.1', port: srv.address().port, timeoutMs: 150});
  await assert.rejects(t.connect('u', 'p'), /timeout/i);
  t.close(); srv.close();
});
