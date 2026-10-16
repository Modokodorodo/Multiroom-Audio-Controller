// Deliberately scoped to 880T output control and explicit mic/line crosspoints.
// Helpers only: no TCP/Telnet transport is implemented.
function address(id) {
  if (typeof id !== 'string' || !/^[0-9AB]$/.test(id)) throw new Error('880T ID must be 0–9, A or B; wildcards forbidden');
  return `#D${id}`;
}
function output(ch) {
  if (!Number.isInteger(ch) || ch < 1 || ch > 12) throw new Error('Output must be 1–12');
  return `${ch} O`;
}
export function gain(id, ch, value) {
  if (value !== undefined && (!Number.isFinite(value) || value < -65 || value > 20)) throw new Error('Gain outside internal range');
  return `${address(id)} GAIN ${output(ch)}${value === undefined ? '' : ` ${value.toFixed(1)} A`}\r`;
}
export function mute(id, ch, value) {
  if (value !== undefined && typeof value !== 'boolean') throw new Error('Mute requires a boolean');
  return `${address(id)} MUTE ${output(ch)}${value === undefined ? '' : ` ${Number(value)}`}\r`;
}
export function route(id, source, ch, value) {
  const { channel, group } = source;
  if (!Number.isInteger(channel) || !((group === 'M' && channel >= 1 && channel <= 8) || (group === 'L' && channel >= 9 && channel <= 12))) throw new Error('Explicit 880T mic/line source required');
  const allowed = group === 'M' ? [0, 3, 4, 5] : [0, 1];
  if (value !== undefined && !allowed.includes(value)) throw new Error('Invalid mode for source type; toggles/prohibited routes not writable');
  return `${address(id)} MTRX ${channel} ${group} ${output(ch)}${value === undefined ? '' : ` ${value}`}\r`;
}
// Conservative parser: unknown banners/errors/commands are never successful replies.
export function parseReply(line) {
  line = line.trim().replace(/^OK>\s*/, '');
  let m = /^#D([0-9AB]) (GAIN|MUTE) ([1-9]|1[0-2]) O (-?\d+(?:\.\d+)?)(?: (A|R))?$/.exec(line.trim());
  if (m) {
    const value = Number(m[4]);
    if (m[2] === 'MUTE' && (![0, 1].includes(value) || m[5])) return null;
    if (m[2] === 'GAIN' && (value < -65 || value > 20 || m[5] === 'R')) return null;
    return { id:m[1], command:m[2], channel:Number(m[3]), group:'O', value };
  }
  m = /^#D([0-9AB]) MTRX (\d+) ([ML]) ([1-9]|1[0-2]) O ([0-6])$/.exec(line.trim());
  if (!m) return null;
  const source = {channel:Number(m[2]), group:m[3]}, value = Number(m[5]);
  // Readback may report prohibited (6), unlike supported writes.
  try { route(m[1], source, Number(m[4]), value === 6 ? undefined : value); } catch { return null; }
  return {id:m[1], command:'MTRX', source, channel:Number(m[4]), group:'O', value};
}
export class LineDecoder {
  buffer = '';
  push(chunk) {
    this.buffer += chunk.toString('ascii');
    if (this.buffer.length > 8192) { this.buffer = ''; throw new Error('Reply buffer overflow'); }
    const lines = this.buffer.split(/[\r\n]+/);
    this.buffer = lines.pop();
    return lines.filter(Boolean);
  }
}
