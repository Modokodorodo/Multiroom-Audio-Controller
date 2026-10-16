import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {ClearOneTelnet} from './clearone-telnet.js';
// Live controller: polls the device and applies one whitelisted, validated change at a time, each verified by readback.
const liveConfig = JSON.parse(readFileSync(new URL('../config/live-rooms.json', import.meta.url)));
const CAPS_FILE = new URL('../config/caps.local.json', import.meta.url);
const HARD_MAX_DB = 0; // App-level ceiling for any room cap (device range is -65..+20).
function loadCaps() { try { return JSON.parse(readFileSync(CAPS_FILE)); } catch { return {}; } }
const INPUT_RANGE = liveConfig.inputGainRangeDb ?? {min: -40, max: 15};
const defaultRooms = liveConfig.rooms.map(r => ({...r, maxDb: loadCaps()[r.id] ?? r.maxDb})), defaultSources = liveConfig.sources;
const range = n => Array.from({length: n}, (_, i) => i + 1);
const inputs = [...range(8).map(c => ({channel: c, group: 'M'})), ...[9, 10, 11, 12].map(c => ({channel: c, group: 'L'}))];
export class LiveController {
  constructor({host, id = '0', user, pass, pollMs = 15000, presenceMs = 3000, timeoutMs = 3000, roomConfig = defaultRooms, sourceConfig = defaultSources}) {
    Object.assign(this, {host, id, user, pass, pollMs, presenceMs, timeoutMs, roomConfig, sourceConfig});
    this.busy = false;
    this.status = 'disconnected'; this.error = null; this.revision = 0; this.rooms = []; this.sources = []; this.updatedAt = null; this.device = null;
  }
  // ADPRESENT first field = input bitmap, input 1 in the lsb (M1-M8 = 1-8, L9-L12 = 9-12).
  present(sourceId) {
    if (this.presenceBits === undefined || this.status !== 'ready') return null;
    const src = this.sourceConfig.find(x => x.id === sourceId);
    return !!src && src.inputs.some(i => (this.presenceBits >> (i.channel - 1)) & 1);
  }
  async pollPresence() {
    if (!this.device || this.status !== 'ready' || this.busy) return;
    const reply = await this.device.query(`#D${this.id} ADPRESENT`);
    const bits = Number(reply.split(' ')[0]);
    if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) throw new Error('Unparseable audio presence');
    this.presenceBits = bits; this.presenceAt = new Date().toISOString();
  }
  state() {
    return {mode: 'live', readOnly: false, sourceSwitching: true, status: this.status, error: this.error, revision: this.revision, busy: this.writing === true,
      stateKind: this.status === 'ready' ? 'hardware readback' : 'stale hardware readback', updatedAt: this.updatedAt, nextRetryAt: this.nextRetryAt ?? null,
      device: {host: this.host, id: this.id, firmware: this.firmware ?? null}, inputRange: INPUT_RANGE, presenceAt: this.presenceAt ?? null, inputs: (this.inputs ?? []).map(i => ({...i, present: this.present(i.id)})), sources: this.sourceConfig.map(({id, name}) => ({id, name})), rooms: this.rooms.filter(r => this.roomConfig.some(c => c.output === r.outputs[0])).map(r => ({...r, ...this.roomConfig.find(c => c.output === r.outputs[0]), name: this.roomConfig.find(c => c.output === r.outputs[0]).name, deviceLabel: r.name,
        // Inferred, not measured at the output: a source is "playing" in a room when it is routed there, has signal at its input, and the room is unmuted.
        mix: r.mix.map(m => ({...m, present: this.present(m.id)})),
        playing: r.muted ? [] : r.mix.filter(m => m.on && this.present(m.id)).map(m => m.name)}))};
  }
  async connect() {
    if (this.status === 'connecting') throw new Error('Connection already in progress');
    this.manualStop = false; this.disconnect(); this.status = 'connecting'; this.revision++;
    try {
      this.device = new ClearOneTelnet({host: this.host, timeoutMs: this.timeoutMs});
      await this.device.connect(this.user, this.pass);
      await this.refresh();
      this.timer = setInterval(() => this.refresh().catch(() => {}), this.pollMs);
      this.presenceTimer = setInterval(() => this.pollPresence().catch(() => {}), this.presenceMs); // one light query
    } catch (e) { this.fail(e); throw e; }
  }
  fail(e) {
    console.error(new Date().toISOString(), 'device error:', e.message);
    this.status = 'error'; this.error = e.message; this.revision++; clearInterval(this.timer); clearInterval(this.presenceTimer); this.device?.close();
    // Reconnect with a fresh read only; pending writes are never replayed.
    clearTimeout(this.retry);
    if (!this.manualStop) {
      this.retryDelay = Math.min((this.retryDelay ?? 2500) * 2, 30000); // 5 s, 10 s, ... capped at 30 s
      this.nextRetryAt = new Date(Date.now() + this.retryDelay).toISOString();
      this.retry = setTimeout(() => { if (this.status === 'error') this.connect().catch(() => {}); }, this.retryDelay);
    }
  }
  disconnect() { clearInterval(this.timer); clearInterval(this.presenceTimer); clearTimeout(this.retry); this.device?.close(); this.device = null; this.status = 'disconnected'; this.revision++; }
  async refresh() {
    if (!this.device) throw new Error('Not connected');
    if (this.busy) return;
    this.busy = true; let done; this.refreshing = new Promise(r => done = r);
    const d = this.device, q = c => d.query(`#D${this.id} ${c}`);
    try {
      // Sequential reads; not atomic. Heartbeat (VER) is part of every refresh.
      this.firmware = await q('VER');
      const pres = Number((await q('ADPRESENT')).split(' ')[0]);
      if (!Number.isInteger(pres) || pres < 0 || pres > 0xffff) throw new Error('Unparseable audio presence');
      this.presenceBits = pres; this.presenceAt = new Date().toISOString();
      const inLabels = {};
      for (const i of inputs) inLabels[`${i.group}${i.channel}`] = await q(`LABEL ${i.channel} ${i.group} 0`);
      const rooms = [];
      for (const ch of range(12)) {
        const name = await q(`LABEL ${ch} O 0`);
        const gain = /^(-?\d+(?:\.\d+)?) A$/.exec(await q(`GAIN ${ch} O`));
        const mute = await q(`MUTE ${ch} O`);
        if (!gain || !['0', '1'].includes(mute)) throw new Error(`Unparseable gain/mute for output ${ch}`);
        const active = [];
        for (const i of inputs) {
          const m = await q(`MTRX ${i.channel} ${i.group} ${ch} O`);
          if (!/^[0-6]$/.test(m)) throw new Error('Unparseable matrix reply');
          if (m !== '0') active.push({input: `${i.group}${i.channel}`, label: inLabels[`${i.group}${i.channel}`], mode: Number(m)});
        }
        const mix = [];
        if (this.roomConfig.some(c => c.output === ch)) for (const src of this.sourceConfig) {
          const m = await q(`MTRX ${src.channel} ${src.group} ${ch} O`);
          if (!/^[0-6]$/.test(m)) throw new Error('Unparseable matrix reply');
          mix.push({id: src.id, name: src.name, on: m !== '0', mode: Number(m)});
        }
        rooms.push({id: `o${ch}`, name, outputs: [ch], gainDb: Number(gain[1]), muted: mute === '1', activeSources: active, mix});
      }
      const inputGains = [];
      for (const src of this.sourceConfig) {
        const channels = [];
        for (const i of src.inputs) {
          const g = /^(-?\d+(?:\.\d+)?) A$/.exec(await q(`GAIN ${i.channel} ${i.group}`));
          if (!g) throw new Error(`Unparseable input gain for ${i.group}${i.channel}`);
          const agc = await q(`AGC ${i.channel} ${i.group}`);
          const set = /^(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/.exec(await q(`AGCSET ${i.channel} ${i.group}`));
          if (!['0', '1'].includes(agc) || !set) throw new Error(`Unparseable AGC for ${i.group}${i.channel}`);
          channels.push({channel: i.channel, group: i.group, gainDb: Number(g[1]), agc: agc === '1',
            agcSettings: {thresholdDb: Number(set[1]), targetDb: Number(set[2]), responseS: Number(set[3]), maxGainDb: Number(set[4])}});
        }
        inputGains.push({id: src.id, name: src.name, channels, gainDb: channels.every(c => c.gainDb === channels[0].gainDb) ? channels[0].gainDb : null,
          agc: channels.every(c => c.agc === channels[0].agc) ? channels[0].agc : null});
      }
      this.inputs = inputGains;
      this.rooms = rooms; this.sources = inputs.map(i => ({id: `${i.group}${i.channel}`, name: inLabels[`${i.group}${i.channel}`]}));
      this.retryDelay = undefined; this.nextRetryAt = null;
      this.status = 'ready'; this.error = null; this.updatedAt = new Date().toISOString(); this.revision++;
    } catch (e) { this.fail(e); throw e; } finally { this.busy = false; done(); }
  }
  // App-side limit only: never writes to the device, and never changes the current volume.
  setCap(id, maxDb) {
    const room = this.roomConfig.find(r => r.id === id);
    if (!room) throw new Error('Unknown room');
    if (!Number.isFinite(maxDb) || maxDb < room.minDb + 5 || maxDb > HARD_MAX_DB) throw new Error(`Cap must be between ${room.minDb + 5} and ${HARD_MAX_DB} dB`);
    room.maxDb = Math.round(maxDb * 2) / 2;
    const caps = loadCaps(); caps[id] = room.maxDb;
    writeFileSync(new URL('../config/caps.local.json.tmp', import.meta.url), JSON.stringify(caps, null, 2));
    renameSync(new URL('../config/caps.local.json.tmp', import.meta.url), CAPS_FILE);
    this.revision++;
  }
  // Input gain of one source (affects every room using it). Absolute writes, each verified by readback.
  async setInputGain(id, gainDb) {
    const src = this.sourceConfig.find(x => x.id === id);
    if (!src) throw new Error('Unknown source');
    if (typeof gainDb !== 'number' || !Number.isFinite(gainDb) || gainDb < INPUT_RANGE.min || gainDb > INPUT_RANGE.max) throw new Error(`Input gain must be ${INPUT_RANGE.min} to ${INPUT_RANGE.max} dB`);
    if (this.busy) await this.refreshing;
    if (this.status !== 'ready' || this.busy) throw new Error('Device is not ready; retry shortly');
    const text = (Math.round(gainDb * 2) / 2).toFixed(1);
    this.busy = true; this.writing = true;
    try {
      for (const i of src.inputs) {
        await this.device.write(`#D${this.id} GAIN ${i.channel} ${i.group} ${text} A`);
        const back = /^(-?\d+(?:\.\d+)?) A$/.exec(await this.device.query(`#D${this.id} GAIN ${i.channel} ${i.group}`));
        if (!back || Number(back[1]) !== Number(text)) throw new Error('Readback did not confirm requested value');
      }
    } catch (e) { this.busy = false; this.writing = false; this.fail(e); throw e; }
    this.busy = false; this.writing = false;
    await this.refresh();
  }
  // AGC on/off for one source (all its channels). Explicit 0/1 only, each verified by readback; AGC settings are never written.
  async setInputAgc(id, on) {
    const src = this.sourceConfig.find(x => x.id === id);
    if (!src) throw new Error('Unknown source');
    if (typeof on !== 'boolean') throw new Error('AGC on/off must be boolean');
    if (this.busy) await this.refreshing;
    if (this.status !== 'ready' || this.busy) throw new Error('Device is not ready; retry shortly');
    this.busy = true; this.writing = true;
    try {
      for (const i of src.inputs) {
        await this.device.write(`#D${this.id} AGC ${i.channel} ${i.group} ${Number(on)}`);
        if (await this.device.query(`#D${this.id} AGC ${i.channel} ${i.group}`) !== String(Number(on))) throw new Error('Readback did not confirm requested value');
      }
    } catch (e) { this.busy = false; this.writing = false; this.fail(e); throw e; }
    this.busy = false; this.writing = false;
    await this.refresh();
  }
  // AGC settings for one source, all four values at once (the command takes all of them); applied to each of its channels, verified by readback.
  async setInputAgcSettings(id, v) {
    const src = this.sourceConfig.find(x => x.id === id);
    if (!src) throw new Error('Unknown source');
    const int = (x, lo, hi, name) => { if (typeof x !== 'number' || !Number.isInteger(x) || x < lo || x > hi) throw new Error(`${name} must be a whole number from ${lo} to ${hi} dB`); return x; };
    const flt = (x, lo, hi, name, unit) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi) throw new Error(`${name} must be ${lo} to ${hi} ${unit}`); return (Math.round(x * 100) / 100).toFixed(2); };
    v = v ?? {};
    const thr = int(v.thresholdDb, -50, 0, 'Threshold'), tgt = int(v.targetDb, -30, 20, 'Target');
    const resp = flt(v.responseS, 0.1, 10, 'Response time', 's'), max = flt(v.maxGainDb, 0, 18, 'Maximum gain', 'dB');
    if (this.busy) await this.refreshing;
    if (this.status !== 'ready' || this.busy) throw new Error('Device is not ready; retry shortly');
    this.busy = true; this.writing = true;
    try {
      for (const i of src.inputs) {
        await this.device.write(`#D${this.id} AGCSET ${i.channel} ${i.group} ${thr} ${tgt} ${resp} ${max}`);
        const back = (await this.device.query(`#D${this.id} AGCSET ${i.channel} ${i.group}`)).split(' ').map(Number);
        if (back.length !== 4 || back[0] !== thr || back[1] !== tgt || back[2] !== Number(resp) || back[3] !== Number(max)) throw new Error('Readback did not confirm requested value');
      }
    } catch (e) { this.busy = false; this.writing = false; this.fail(e); throw e; }
    this.busy = false; this.writing = false;
    await this.refresh();
  }
  async update(id, patch, revision) {
    if (this.status !== 'ready') throw new Error('Device is not ready; reconnect and refresh');
    // Absolute, capped, readback-verified writes: a background refresh in progress is waited for, not an error.
    if (this.busy) await this.refreshing;
    if (this.status !== 'ready' || this.busy) throw new Error('Device is not ready; retry shortly');
    const room = this.roomConfig.find(r => r.id === id);
    if (!room) throw new Error('Unknown room');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length !== 1) throw new Error('Change one setting at a time');
    const key = Object.keys(patch)[0], ch = room.output, q = c => this.device.query(`#D${this.id} ${c}`);
    let command, check;
    if (key === 'gainDb') {
      const v = patch.gainDb;
      if (!Number.isFinite(v) || v < room.minDb || v > room.maxDb) throw new Error('Gain exceeds room limits');
      const text = (Math.round(v * 2) / 2).toFixed(1);
      command = `GAIN ${ch} O ${text} A`; check = async () => Number((/^(-?\d+(?:\.\d+)?) A$/.exec(await q(`GAIN ${ch} O`)) ?? [])[1]) === Number(text);
    } else if (key === 'muted') {
      if (typeof patch.muted !== 'boolean') throw new Error('Mute must be boolean');
      command = `MUTE ${ch} O ${Number(patch.muted)}`; check = async () => (await q(`MUTE ${ch} O`)) === String(Number(patch.muted));
    } else if (key === 'source') {
      const {id: sid, on} = patch.source ?? {}, src = this.sourceConfig.find(x => x.id === sid);
      if (!src) throw new Error('Unknown source');
      if (typeof on !== 'boolean') throw new Error('Source on/off must be boolean');
      const value = on ? src.onMode : 0; // Only this one crosspoint changes; its level and all other routes are untouched.
      command = `MTRX ${src.channel} ${src.group} ${ch} O ${value}`;
      check = async () => (await q(`MTRX ${src.channel} ${src.group} ${ch} O`)) === String(value);
    } else throw new Error('Unknown setting');
    this.busy = true; this.writing = true;
    try {
      await this.device.write(`#D${this.id} ${command}`);
      if (!await check()) throw new Error('Readback did not confirm requested value');
    } catch (e) { this.busy = false; this.writing = false; this.fail(e); throw e; }
    this.busy = false; this.writing = false;
    await this.refresh();
  }
}
