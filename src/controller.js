import {rooms, sources} from '../config/mock.js';
import {roomState} from './mock-device.js';
export class Controller {
  constructor(device, {timeoutMs=1500}={}) {
    this.device=device; this.timeoutMs=timeoutMs; this.status='disconnected';
    this.revision=0; this.epoch=0; this.snapshot=null; this.error=null; this.busy=false;
  }
  state() {
    return {mode:'mock', status:this.status, error:this.error, revision:this.revision, busy:this.busy,
      stateKind:this.status==='ready'?'simulated':'stale simulated', updatedAt:this.updatedAt??null,
      sources:sources.map(({id,name})=>({id,name})),
      rooms:this.snapshot?rooms.map(r=>roomState(this.snapshot,r)):[]};
  }
  disconnect() {
    this.epoch++; this.abort?.abort(); this.status='disconnected'; this.busy=false; this.revision++;
  }
  async operation(fn) {
    if (this.busy) throw new Error('Another operation is pending; retry after refresh');
    const epoch=this.epoch;
    this.busy=true; this.abort=new AbortController();
    const signal=this.abort.signal;
    const timer=setTimeout(()=>this.abort.abort(new Error('Device timeout')),this.timeoutMs);
    try {
      const snapshot=await fn(signal);
      if (epoch!==this.epoch) throw new Error('Connection changed; request discarded');
      this.snapshot=snapshot; this.status='ready'; this.error=null;
      this.updatedAt=new Date().toISOString(); this.revision++;
    } catch (caught) {
      const error=signal.aborted && signal.reason instanceof Error ? signal.reason : caught;
      if (epoch===this.epoch) { this.status='error'; this.error=error.message; this.revision++; }
      throw error;
    } finally { clearTimeout(timer); if (epoch===this.epoch) this.busy=false; }
  }
  async connect() {
    if (this.busy) throw new Error('Operation pending');
    this.status='connecting';
    await this.operation(signal=>this.device.snapshot(signal)); // No startup writes or replay.
  }
  async update(id, patch, revision) {
    if (this.status!=='ready') throw new Error('Device is not ready; reconnect and refresh');
    if (revision!==this.revision) throw new Error('State changed; refresh before retrying');
    const room=rooms.find(r=>r.id===id);
    if (!room) throw new Error('Unknown room');
    if (!patch || typeof patch!=='object' || Array.isArray(patch) || Object.keys(patch).length!==1) throw new Error('Change one setting at a time');
    const key=Object.keys(patch)[0];
    if (!['gainDb','muted','sourceId'].includes(key)) throw new Error('Unknown setting');
    if (key==='gainDb' && (!Number.isFinite(patch.gainDb)||patch.gainDb<room.minDb||patch.gainDb>room.maxDb)) throw new Error('Gain exceeds room limits');
    if (key==='muted' && typeof patch.muted!=='boolean') throw new Error('Mute must be boolean');
    if (key==='sourceId' && !sources.some(s=>s.id===patch.sourceId)) throw new Error('Unknown source');
    await this.operation(async signal=>{
      await this.device.write(room,patch,signal);
      const snapshot=await this.device.snapshot(signal);
      const actual=roomState(snapshot,room);
      if (actual[key]!==patch[key]) throw new Error('Readback did not confirm requested value');
      return snapshot;
    });
  }
}
