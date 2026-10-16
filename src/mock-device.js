import {setTimeout as delay} from 'node:timers/promises';
import {sources, rooms} from '../config/mock.js';
import {gain, mute, route} from './protocol.js';
export class MockDevice {
  constructor({latency=100}={}) {
    this.latency = latency;
    this.outputs = Object.fromEntries(rooms.flatMap(r=>r.outputs.map(ch=>[ch,{gainDb:-35,muted:true}])));
    this.matrix = {'P:A>O:1':1}; // Unmanaged DSP route: always preserved.
  }
  async snapshot(signal) {
    await delay(this.latency, undefined, {signal});
    return structuredClone({outputs:this.outputs, matrix:this.matrix});
  }
  async write(room, patch, signal) {
    await delay(this.latency, undefined, {signal});
    const commands = [];
    // Synchronous commit after abortable latency; a stereo update is atomic only in this mock.
    for (const ch of room.outputs) {
      if ('gainDb' in patch) { commands.push(gain('0',ch,patch.gainDb)); this.outputs[ch].gainDb=patch.gainDb; }
      if ('muted' in patch) { commands.push(mute('0',ch,patch.muted)); this.outputs[ch].muted=patch.muted; }
    }
    if ('sourceId' in patch) {
      const chosen = sources.find(s=>s.id===patch.sourceId);
      // Modify only configured source pairs, retaining every unrelated crosspoint/level/DSP setting.
      for (const source of sources) {
        for (let i=0;i<room.outputs.length;i++) {
          const input=source.inputs[Math.min(i,source.inputs.length-1)], ch=room.outputs[i];
          const value=source===chosen ? (input.mode ?? 1) : 0;
          commands.push(route('0',input,ch,value));
          this.matrix[`${input.group}:${input.channel}>O:${ch}`]=value;
        }
      }
    }
    return commands;
  }
}
export function roomState(snapshot, room) {
  const outputs=room.outputs.map(ch=>snapshot.outputs[ch]);
  const active=sources.filter(s=>room.outputs.some((ch,i)=>{
    const input=s.inputs[Math.min(i,s.inputs.length-1)];
    return [1,3,4,5].includes(snapshot.matrix[`${input.group}:${input.channel}>O:${ch}`]);
  }));
  return {...room, gainDb:outputs.every(o=>o.gainDb===outputs[0].gainDb)?outputs[0].gainDb:null,
    muted:outputs.every(o=>o.muted===outputs[0].muted)?outputs[0].muted:null,
    sourceId:active.length===1?active[0].id:null};
}
