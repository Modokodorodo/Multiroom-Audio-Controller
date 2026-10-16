import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Controller} from './controller.js';
import {MockDevice} from './mock-device.js';
import {LiveController} from './live-controller.js';
export function createServer(controller) {
  const assets = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
  return http.createServer(async (req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    // Reject DNS rebinding and cross-origin browser mutations.
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host??'')) return send(403,{error:'Loopback host required'});
    if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return send(403,{error:'Same-origin access required'});
    try {
      if(req.method==='GET' && assets[req.url]) {
        const [file,type]=assets[req.url];const data=await readFile(new URL(`../public/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(data);
      }
      if(req.method==='GET' && req.url==='/api/state') return send(200,controller.state());
      if(req.method!=='POST') return send(404,{error:'Not found'});
      if(req.headers['content-type']!=='application/json') return send(415,{error:'JSON required'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,{error:'Request too large'});}
      const data=JSON.parse(body||'{}');
      if(req.url==='/api/disconnect') { controller.manualStop=true; controller.disconnect(); }
      else if(req.url==='/api/connect') await controller.connect();
      else if(/^\/api\/inputs\/[a-z0-9-]+\/agcset$/.test(req.url)) { if(!controller.setInputAgcSettings) throw new Error('AGC settings are only available in live mode'); await controller.setInputAgcSettings(req.url.split('/')[3],data.settings); }
      else if(/^\/api\/inputs\/[a-z0-9-]+\/agc$/.test(req.url)) { if(!controller.setInputAgc) throw new Error('AGC is only available in live mode'); await controller.setInputAgc(req.url.split('/')[3],data.on); }
      else if(/^\/api\/inputs\/[a-z0-9-]+$/.test(req.url)) { if(!controller.setInputGain) throw new Error('Input gain is only available in live mode'); await controller.setInputGain(req.url.split('/').pop(),data.gainDb); }
      else if(/^\/api\/rooms\/[a-z0-9-]+\/cap$/.test(req.url)) { if(!controller.setCap) throw new Error('Caps are only editable in live mode'); controller.setCap(req.url.split('/')[3],data.maxDb); }
      else if(/^\/api\/rooms\/[a-z0-9-]+$/.test(req.url)) await controller.update(req.url.split('/').pop(),data.patch,data.revision);
      else return send(404,{error:'Not found'});
      send(200,controller.state());
    }catch(error){send(409,{error:error.message,state:controller.state()});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const mode=process.env.DEVICE_MODE??'mock';
  if(!['mock','live'].includes(mode)) throw new Error('DEVICE_MODE must be mock or live');
  let controller;
  if(mode==='mock') controller=new Controller(new MockDevice());
  else {
    const {CLEARONE_HOST:host,CLEARONE_USER:user,CLEARONE_PASS:pass,CLEARONE_ID:id='0'}=process.env;
    if(!host||!user||!pass) throw new Error('Set CLEARONE_HOST, CLEARONE_USER and CLEARONE_PASS in the environment (never in files)');
    controller=new LiveController({host,user,pass,id});
  }
  // Live: start serving at once; the controller connects (and retries) in the background.
  if(mode==='mock') await controller.connect();
  else controller.connect().catch(e=>console.error('Initial connect failed:',e.message));
  const port=Number(process.env.PORT??8787);
  const server=createServer(controller);
  server.listen(port,'127.0.0.1',()=>console.log(`${mode==='mock'?'MOCK ONLY':'LIVE'} — http://127.0.0.1:${server.address().port}`));
}
