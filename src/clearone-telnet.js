import net from 'node:net';
// ClearOne CONVERGE Pro Telnet client. Every outgoing command must match an explicit whitelist:
// QUERY for reads, WRITE for the few settings the app may change. Only the login lines bypass this.
const QUERY = /^#D([0-9AB]) (?:VER|DID|ADPRESENT|(?:GAIN|MUTE) (?:[1-9]|1[0-2]) O|GAIN (?:[1-9]|1[0-2]) [ML]|(?:AGC|AGCSET) (?:[1-9]|1[0-2]) [ML]|MTRX (?:[1-9]|1[0-2]) [ML] (?:[1-9]|1[0-2]) O|MTRX [A-H] P (?:[1-9]|1[0-2]) O|LABEL (?:[1-9]|1[0-2]) [OML] 0)$/;
const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;
// The ONLY writes this client can send: absolute gain, explicit mute, and explicit on/off of the Arylic (P A), Birds (M3) and Alexa (M4) crosspoints to outputs 1-3, absolute gain, explicit AGC on/off and AGC settings of mic inputs 1-4 (Arylic M1+M2, Birds M3, Alexa M4).
const WRITE = /^#D([0-9AB]) (?:GAIN [1-3] O -?\d{1,2}\.\d A|MUTE [1-3] O [01]|MTRX A P [1-3] O [01]|MTRX [34] M [1-3] O [03]|GAIN [1-4] M -?\d{1,2}\.\d A|AGC [1-4] M [01]|AGCSET [1-4] M -?\d{1,2} -?\d{1,2} \d{1,2}\.\d{2} \d{1,2}\.\d{2})$/;
export class ClearOneTelnet {
  constructor({host, port = 23, timeoutMs = 3000}) {
    Object.assign(this, {host, port, timeoutMs});
    this.text = ''; this.iac = []; this.waiter = null; this.socket = null; this.queue = Promise.resolve();
  }
  connect(user, pass) {
    return new Promise((resolve, reject) => {
      const socket = this.socket = net.connect({host: this.host, port: this.port});
      this.closed = false; this.text = ''; this.iac = [];
      const fail = e => { this.closed = true; this.waiter?.reject(e); reject(e); };
      const connectTimer = setTimeout(() => socket.destroy(new Error('connect timeout')), this.timeoutMs * 2);
      socket.once('connect', () => clearTimeout(connectTimer));
      socket.once('error', e => { clearTimeout(connectTimer); fail(e); });
      socket.on('close', () => { this.closed = true; this.waiter?.reject(new Error('Connection closed')); });
      socket.on('data', d => { this.feed(d); this.check(); });
      socket.once('connect', async () => {
        try {
          await this.expect(/user:\s*$/i); this.raw(user + '\r');
          await this.expect(/pass:\s*$/i); this.raw(pass + '\r');
          await this.expect(/Authenticated\./i); resolve();
        } catch (e) { socket.destroy(); reject(e); }
      });
    });
  }
  raw(s) { this.socket.write(Buffer.from(s, 'ascii')); }
  // Strip Telnet negotiation; refuse every option offered (DO->WONT, WILL->DONT).
  feed(buf) {
    for (const b of buf) {
      const s = this.iac;
      if (s.length === 0) { if (b === IAC) s.push(b); else this.text += String.fromCharCode(b); }
      else if (s[1] === SB) { s.push(b); if (b === SE && s[s.length - 2] === IAC) this.iac = []; }
      else if (s.length === 1) { if (b === IAC) { this.text += String.fromCharCode(255); this.iac = []; } else if (b === SB || (b >= WILL && b <= DONT)) s.push(b); else this.iac = []; }
      else { // option byte
        if (s[1] === DO) this.socket.write(Buffer.from([IAC, WONT, b]));
        else if (s[1] === WILL) this.socket.write(Buffer.from([IAC, DONT, b]));
        this.iac = [];
      }
    }
    if (this.text.length > 16384) { this.text = ''; this.socket.destroy(new Error('Reply buffer overflow')); }
  }
  check() { if (this.waiter && this.waiter.test(this)) { const w = this.waiter; this.waiter = null; clearTimeout(w.timer); w.resolve(w.value); } }
  wait(test, value) {
    if (this.closed) return Promise.reject(new Error('Connection closed'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiter = null; reject(new Error('Device timeout')); }, this.timeoutMs);
      this.waiter = {test, resolve, reject: e => { clearTimeout(timer); reject(e); }, timer, value};
      this.check();
    });
  }
  expect(re) { return this.wait(self => re.test(self.text)); }
  // Serialized: one outstanding query. Reply must echo the exact query (device, command, channel/group).
  query(command) {
    if (!QUERY.test(command)) return Promise.reject(new Error(`Refused non-query command: ${command.slice(0, 40)}`));
    const run = async () => {
      this.text = '';
      this.raw(command + '\r');
      const prefix = command + ' ';
      let result;
      await this.wait(self => {
        const lines = self.text.split(/[\r\n]+/);
        if (!/OK>\s*$/.test(self.text) || lines.length < 2) return false;
        const hit = lines.map(l => l.replace(/^(?:OK>\s*)+/, '').trim()).find(l => l.startsWith(prefix));
        if (!hit) return false;
        result = hit.slice(prefix.length); return true;
      });
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  // Queued, narrowly whitelisted write. Callers must verify by independent readback.
  write(command) {
    if (!WRITE.test(command)) return Promise.reject(new Error(`Refused write: ${command.slice(0, 40)}`));
    const run = async () => { this.text = ''; this.raw(command + '\r'); await new Promise(r => setTimeout(r, 400)); };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  close() { this.closed = true; this.socket?.destroy(); }
}
