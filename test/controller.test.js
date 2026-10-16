import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {Controller} from '../src/controller.js';
import {MockDevice} from '../src/mock-device.js';
import {gain,mute,route,parseReply,LineDecoder} from '../src/protocol.js';
import {createServer} from '../src/server.js';
test('format exact addressed commands, omit query values, and reject unsafe addressing',()=>{
  assert.equal(gain('A',2,-32),'#DA GAIN 2 O -32.0 A\r');
  assert.equal(gain('A',2),'#DA GAIN 2 O\r');
  assert.equal(mute('1',3,false),'#D1 MUTE 3 O 0\r');
  assert.equal(mute('1',3),'#D1 MUTE 3 O\r');
  for(const id of ['*','C','0\r#D0 MUTE 1 O 0'])assert.throws(()=>gain(id,1,-30));
  for(const v of [-66,21,NaN,Infinity])assert.throws(()=>gain('0',1,v));
  assert.throws(()=>gain('0',13,-30)); // Integrated amplifier deliberately unsupported.
});
test('routing enforces mic vs line modes, channel ranges, and no toggles',()=>{
  assert.equal(route('0',{channel:1,group:'M'},2,3),'#D0 MTRX 1 M 2 O 3\r');
  assert.equal(route('B',{channel:9,group:'L'},2,1),'#DB MTRX 9 L 2 O 1\r');
  for(const [s,v] of [[{channel:1,group:'M'},1],[{channel:9,group:'L'},3],[{channel:9,group:'L'},2],[{channel:1,group:'I'},1],[{channel:8,group:'L'},1]])assert.throws(()=>route('0',s,1,v));
});
test('fragmented/coalesced replies, overflow, errors and malformed values',()=>{
  const decoder=new LineDecoder();assert.deepEqual(decoder.push(Buffer.from('#D0 GA')),[]);
  assert.deepEqual(decoder.push(Buffer.from('IN 2 O -30.0\r\n#D0 MUTE 2 O 1\r')),['#D0 GAIN 2 O -30.0','#D0 MUTE 2 O 1']);
  assert.equal(parseReply('#D0 GAIN 2 O -30.0').value,-30);
  assert.equal(parseReply('OK> #D0 GAIN 1 O -35.00 A').value,-35);
  assert.equal(parseReply('#D0 MTRX 1 M 2 O 6').value,6);
  for(const s of ['ERROR 1','#D0 GAIN 2 O','#D0 MUTE 2 O 2','#D0 GAIN 2 O 99','#D0 GAIN 2 O -3 R','#D0 MTRX 1 M 2 O 1'])assert.equal(parseReply(s),null);
  assert.throws(()=>decoder.push(Buffer.alloc(8193,65)));
});
test('readback gates state, stereo controls stay paired and unrelated routes survive',async()=>{
  const device=new MockDevice({latency:2}), controller=new Controller(device);
  await controller.connect();const initial=controller.state();
  const writing=controller.update('living',{gainDb:-40},initial.revision);
  assert.equal(controller.state().rooms[0].gainDb,-35);assert.equal(controller.state().busy,true);
  await writing;assert.equal(device.outputs[1].gainDb,-40);assert.equal(device.outputs[2].gainDb,-40);
  await controller.update('living',{sourceId:'birds'},controller.revision);
  assert.equal(device.matrix['M:1>O:1'],3);assert.equal(device.matrix['M:1>O:2'],3);
  await controller.update('living',{sourceId:'music'},controller.revision);
  assert.equal(device.matrix['M:1>O:1'],0);assert.equal(device.matrix['L:11>O:1'],1);assert.equal(device.matrix['L:12>O:2'],1);
  assert.equal(device.matrix['P:A>O:1'],1);assert.equal(device.outputs[3].gainDb,-35);
  await assert.rejects(controller.update('toilet',{gainDb:-10},controller.revision),/limits/);
  await assert.rejects(controller.update('living',{muted:false},initial.revision),/State changed/);
});
test('disconnect cancels queued/inflight writes; reconnect reads without replay',async()=>{
  const device=new MockDevice({latency:15}),c=new Controller(device);await c.connect();
  const writing=c.update('living',{muted:false},c.revision);
  await assert.rejects(c.update('kitchen',{muted:false},c.revision),/pending/);
  c.disconnect();await assert.rejects(writing);
  await c.connect();assert.equal(c.state().rooms[0].muted,true);
});
test('timeout requires recovery and snapshot mismatch is never confirmation',async()=>{
  const device=new MockDevice({latency:20}),c=new Controller(device,{timeoutMs:5});
  await assert.rejects(c.connect(),/timeout/);assert.equal(c.status,'error');
  device.latency=0;await c.connect();
  device.write=async()=>[];
  await assert.rejects(c.update('living',{gainDb:-50},c.revision),/Readback/);
  assert.equal(c.state().rooms[0].gainDb,-35);assert.equal(c.status,'error');
});
test('HTTP API serves mock, validates mutations, rejects foreign origin and host',async t=>{
  const c=new Controller(new MockDevice({latency:0}));await c.connect();
  const server=createServer(c);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url)).status,200);
  assert.equal((await (await fetch(url+'/api/state')).json()).mode,'mock');
  const post=(body,headers={})=>fetch(url+'/api/rooms/living',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post({patch:{muted:false},revision:c.revision})).status,200);
  assert.equal((await post({patch:{gainDb:0},revision:c.revision})).status,409);
  assert.equal((await post({}, {Origin:'https://foreign.example'})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(url,{headers:{Host:'foreign.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(hostStatus,403);
  assert.equal((await fetch(url+'/../package.json')).status,404);
});
