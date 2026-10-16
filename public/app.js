const $=s=>document.querySelector(s);
let state, pending=false, pendingId=null, error='', tab='rooms';
try{tab=localStorage.getItem('tab')||'rooms';}catch{}
async function api(path, data) {
  const response=await fetch(path,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const value=await response.json();
  if(!response.ok){if(value.state)state=value.state;throw new Error(value.error);}
  return value;
}
function showError(message){error=message;$('#error').textContent=message;$('#error').hidden=!message;}
const unreachable=m=>/ETIMEDOUT|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|ENETUNREACH|timeout|closed/i.test(m||'');
function liveStatus(){
  if(state.status==='ready')return {text:`ClearOne ${state.device.host} · connected`,detail:''};
  const since=state.updatedAt?` Showing last known values from ${new Date(state.updatedAt).toLocaleTimeString()}.`:'';
  if(state.status==='connecting'||state.status==='error')
    return {text:`ClearOne ${state.device.host} · ${unreachable(state.error)||state.status==='connecting'?'not reachable':'error'}`,
      detail:`${unreachable(state.error)||!state.error?'Cannot reach the ClearOne. Is it powered on and on the network? Retrying automatically.':state.error}${since} Controls are disabled until it is back.`};
  return {text:`ClearOne ${state.device.host} · disconnected`,detail:`Disconnected.${since}`};
}
// Only a focused slider/number field counts as an edit in progress; a clicked button must not block refreshes.
const editing=()=>{const a=document.activeElement;return !!a&&a.tagName==='INPUT'&&['range','number'].includes(a.type)&&!!a.closest('#rooms,#inputs');};
function render() { try{renderInputs();fillAgc();}catch(e){console.error(e);}
  renderMain();
}
function renderMain() {
  if(!state)return;
  const live=state.mode==='live';
  const ready=state.status==='ready', globalOff=!ready;
  $('#pill-text').textContent=live?(ready?'Connected':state.status==='disconnected'?'Disconnected':'Not reachable'):(ready?'Mock device':'Mock · '+state.status);
  $('#pill-dot').classList.toggle('offline',!ready);$('#pill').classList.toggle('warn',!ready);
  $('#offline').hidden=ready;
  $('#offline').textContent=ready?'':live?(state.status==='disconnected'?'Disconnected from the ClearOne. Controls are disabled. Reconnect at the bottom of the page.':'Cannot reach the ClearOne. Retrying automatically; controls are disabled until it is back.'):'Mock device not connected.';
  $('#foot-note').textContent=live?'Values are read back from the device.':'Mock mode: demo values only, reset on restart.';
  const ls=live?liveStatus():null;
  $('#status').textContent=live?(pending?ls.text+' · change pending':ls.text):`Mock device · ${pending?'change pending':state.status}`;
  $('#dot').classList.toggle('offline',!ready);
  $('#detail').textContent=live&&ls.detail?ls.detail:`${state.stateKind}. ${state.updatedAt?'Last read '+new Date(state.updatedAt).toLocaleTimeString()+'. ':''}${live?'Firmware '+(state.device.firmware??'?')+'. ':'Demo wiring only.'}`;
  $('#connection').textContent=ready?'Disconnect':'Reconnect';
  $('#connection').disabled=pending||state.busy;
  $('#refresh').disabled=pending||state.busy;
  $('#count').textContent=state.rooms.length;
  $('#rooms').replaceChildren();
  state.rooms.forEach((room,index)=>{
    const disabled=globalOff||(pending&&pendingId===room.id);
    const card=document.createElement('article');card.className='card';
    // Names originate from trusted bundled mock configuration, never device response HTML.
    card.innerHTML=`<div class="card-head"><span class="icon">${['⌂','☷','❋'][index]}</span><span>${room.outputs.length===2?'STEREO':'MONO'} DEMO</span></div><h3></h3><p class="channels"></p><label>Source</label><select aria-label="Source"></select><div class="volume-head"><label>Volume</label><output></output></div><input type="range" step="1" aria-label="Volume"><div class="limits"><span></span><span></span></div><button class="mute"></button><p class="readback"></p>`;
    card.querySelector('h3').textContent=room.name;
    card.querySelector('.channels').textContent='Simulated output '+room.outputs.join(' + ');
    if(live){
      const head=card.querySelector('.card-head span:last-child');head.textContent='';
      const pl=document.createElement('span');pl.className='playing'+(room.playing.length?' on':'');
      pl.textContent=!ready?'Unknown':room.playing.length?'Playing':room.muted?'Muted':'Quiet';
      pl.title=room.playing.length?'Signal on: '+room.playing.join(', '):'No routed source has signal';head.append(pl);
    }
    const select=card.querySelector('select'); select.setAttribute('aria-label',`${room.name} source`);
    const blank=new Option(room.sourceId?'Select source':'No single source selected','');blank.disabled=true;select.add(blank);
    if(live){
      select.hidden=true;card.querySelector('label').textContent='Sources';
      const box=document.createElement('div');box.className='sources';
      room.mix.forEach(src=>{const b=document.createElement('button');b.type='button';b.className='src'+(src.on?' active':'');b.textContent=src.name;if(src.present){const d=document.createElement('span');d.className='sig';d.title='Signal present';b.prepend(d);}
        b.setAttribute('aria-pressed',String(src.on));b.setAttribute('aria-label',`${room.name}: ${src.name} ${src.on?'on':'off'}${src.present?', signal present':''}`);b.disabled=disabled;
        b.onclick=()=>change(room.id,{source:{id:src.id,on:!src.on}});box.append(b);});
      select.after(box);
      card.querySelector('.channels').textContent=room.playing.length?'Now: '+room.playing.join(' + '):'Mix: sources can play together';
    }
    else{state.sources.forEach(s=>select.add(new Option(s.name,s.id)));select.value=room.sourceId??'';select.disabled=disabled;}
    const slider=card.querySelector('input'),output=card.querySelector('output'),note=card.querySelector('.readback');
    slider.min=room.minDb;slider.max=room.maxDb;slider.value=room.gainDb??room.minDb;slider.disabled=disabled;
    slider.setAttribute('aria-label',`${room.name} volume in dB`);
    output.textContent=room.gainDb===null?'Mixed':`${room.gainDb} dB`;
    card.querySelector('.limits span').textContent=`${room.minDb} dB`;
    card.querySelector('.limits span:last-child').textContent=`Cap ${room.maxDb} dB`;
    if(live){
      const over=room.gainDb!==null&&room.gainDb>room.maxDb;
      card.querySelector('.limits span:last-child').textContent=`Cap ${room.maxDb} dB`+(over?' · current volume is above the cap':'');
    }
    const mute=card.querySelector('.mute');mute.textContent=room.muted===null?'Mixed mute · mute room':room.muted?'Muted · click to unmute':'Playing · click to mute';
    mute.classList.toggle('active',room.muted===true);mute.disabled=disabled;mute.setAttribute('aria-pressed',String(room.muted===true));
    mute.setAttribute('aria-label',`${room.name}: ${mute.textContent}`);
    note.textContent=live?((pending&&pendingId===room.id)?'Change pending · showing last hardware readback':ready?'Hardware readback':'Stale readback · device not connected'):pending?'Change pending · showing last simulated readback':ready?'Simulated readback · no hardware connected':'Stale simulation · controls unavailable';note.classList.toggle('pending',pending);
    slider.oninput=()=>{output.textContent=`${slider.value} dB requested`;note.textContent=`Last simulated readback: ${room.gainDb} dB. Release to apply.`;note.classList.add('pending');};
    slider.onchange=()=>{slider.blur();change(room.id,{gainDb:Number(slider.value)});};
    select.onchange=()=>change(room.id,{sourceId:select.value});
    mute.onclick=()=>change(room.id,{muted:room.muted!==true});
    $('#rooms').append(card);
  });
}
async function change(id,patch){
  if(pending)return;pending=true;pendingId=id;showError('');render();
  try{state=await api(`/api/rooms/${id}`,{patch,revision:state.revision});}
  catch(e){showError(e.message);}
  finally{pending=false;pendingId=null;render();}
}
async function refresh(){
  try{state=await api('/api/state');render();}
  catch(e){if(state){state.status='unreachable';render();}showError('Local service unavailable. Start or restart the service, then refresh.');}
}
$('#refresh').onclick=()=>{showError('');refresh();};
$('#connection').onclick=async()=>{
  const action=state.status==='ready'?'disconnect':'connect';pending=true;render();showError('');
  try{state=await api('/api/'+action,{});}catch(e){showError(e.message);}finally{pending=false;render();}
};
await refresh();
// Poll only when controls are idle so a draft slider value is never replaced during interaction.
setInterval(()=>{if(!pending&&!editing())refresh();},3000);

// Settings dialog: built on open so the 3 s refresh never wipes what is being typed.
const dlg=$('#settings');
$('#open-settings').onclick=()=>{
  if(!state||state.mode!=='live'){showError('Settings are only available in live mode.');return;}
  const list=$('#caps');list.replaceChildren();$('#settings-error').textContent='';
  state.rooms.forEach(room=>{
    const row=document.createElement('div');row.className='caprow';
    const label=document.createElement('label');label.textContent=room.name;
    const input=document.createElement('input');input.type='number';input.step='0.5';input.min=room.minDb+5;input.max=0;input.value=room.maxDb;
    input.setAttribute('aria-label',`${room.name} volume cap in dB`);
    const unit=document.createElement('span');unit.textContent='dB';
    const save=document.createElement('button');save.type='button';save.textContent='Save';
    const msg=document.createElement('span');msg.className='capmsg';msg.setAttribute('role','status');
    save.onclick=async()=>{try{state=await api(`/api/rooms/${room.id}/cap`,{maxDb:Number(input.value)});msg.textContent='Saved';render();}catch(e){msg.textContent=e.message;}};
    row.append(label,input,unit,save,msg);list.append(row);
  });
  dlg.showModal();
};
$('#close-settings').onclick=()=>dlg.close();

// Tabs and the Inputs view (live mode only).
function showTab(name){
  tab=name;try{localStorage.setItem('tab',name);}catch{}
  const live=state?.mode==='live';if(!live)tab='rooms';
  $('#view-rooms').hidden=tab!=='rooms';$('#view-inputs').hidden=tab!=='inputs';
  $('#tab-inputs').hidden=!live;
  $('#tab-rooms').setAttribute('aria-selected',String(tab==='rooms'));$('#tab-inputs').setAttribute('aria-selected',String(tab==='inputs'));
}
$('#tab-rooms').onclick=()=>showTab('rooms');$('#tab-inputs').onclick=()=>showTab('inputs');
let agcId=null;
function fillAgc(){
  const inp=state?.inputs?.find(i=>i.id===agcId);if(!inp)return;
  $('#agc-title').textContent=`${inp.name} · Automatic gain (AGC)`;
  const on=inp.agc===true,ready=state.status==='ready';
  $('#agc-status').textContent=inp.agc===null?'Channels differ':on?'AGC is on':'AGC is off';
  const sw=$('#agc-switch');sw.textContent=on?'Turn off':'Turn on';sw.setAttribute('aria-checked',String(on));sw.classList.toggle('active',on);
  sw.disabled=!ready||pending;
  $('#agc-save').disabled=!ready||pending;
}
function fillAgcForm(){
  const inp=state?.inputs?.find(i=>i.id===agcId);if(!inp)return;
  const st=inp.channels[0].agcSettings;
  $('#agc-thr').value=st.thresholdDb;$('#agc-tgt').value=st.targetDb;$('#agc-resp').value=st.responseS.toFixed(2);$('#agc-max').value=st.maxGainDb.toFixed(2);
  const same=inp.channels.every(c=>JSON.stringify(c.agcSettings)===JSON.stringify(st));
  $('#agc-inputs-note').textContent=inp.channels.length>1?`Saved to ${inp.channels.map(c=>c.group+c.channel).join(' and ')} together.`+(same?'':' They currently differ; showing the first. Saving makes them identical.'):`Saved to ${inp.channels[0].group+inp.channels[0].channel}.`;
  $('#agc-saved').textContent='';
}
$('#agc-form').onsubmit=async e=>{
  e.preventDefault();const inp=state.inputs.find(i=>i.id===agcId);if(!inp||pending)return;
  const settings={thresholdDb:Number($('#agc-thr').value),targetDb:Number($('#agc-tgt').value),responseS:Number($('#agc-resp').value),maxGainDb:Number($('#agc-max').value)};
  pending=true;pendingId='input:'+inp.id;$('#agc-error').textContent='';$('#agc-saved').textContent='';fillAgc();
  try{state=await api(`/api/inputs/${inp.id}/agcset`,{settings});$('#agc-saved').textContent='Saved and confirmed by the device.';}catch(err){$('#agc-error').textContent=err.message;}
  finally{pending=false;pendingId=null;render();fillAgc();}
};
$('#agc-close').onclick=()=>$('#agc-dialog').close();
$('#agc-switch').onclick=async()=>{
  const inp=state.inputs.find(i=>i.id===agcId);if(!inp||pending)return;
  pending=true;pendingId='input:'+inp.id;$('#agc-error').textContent='';fillAgc();
  try{state=await api(`/api/inputs/${inp.id}/agc`,{on:inp.agc!==true});}catch(e){$('#agc-error').textContent=e.message;}
  finally{pending=false;pendingId=null;render();fillAgc();}
};
function renderInputs(){
  const live=state?.mode==='live';showTab(tab);
  if(!live||editing())return;
  $('#inputs').replaceChildren();
  state.inputs.forEach(inp=>{
    const card=document.createElement('article');card.className='card';
    card.innerHTML='<div class="card-head"><span class="icon">♪</span><span class="chs"></span></div><h3></h3><div class="volume-head"><label>Input gain</label><output></output></div><input type="range" step="0.5"><div class="limits"><span></span><span></span></div><button type="button" class="agc-open"></button><p class="readback"></p>';
    card.querySelector('h3').textContent=inp.name;
    card.querySelector('.chs').textContent=inp.channels.map(c=>c.group+c.channel).join(' + ')+(inp.channels.length>1?' · written together':'');
    const ps=document.createElement('span');ps.className='playing'+(inp.present?' on':'');ps.textContent=inp.present===null?'Unknown':inp.present?'Signal':'No signal';card.querySelector('.card-head').append(ps);
    const slider=card.querySelector('input'),out=card.querySelector('output'),note=card.querySelector('.readback');
    slider.min=state.inputRange.min;slider.max=state.inputRange.max;slider.value=inp.gainDb??state.inputRange.min;
    slider.disabled=state.status!=='ready'||(pending&&pendingId==='input:'+inp.id);
    slider.setAttribute('aria-label',`${inp.name} input gain in dB`);
    out.textContent=inp.gainDb===null?'Channels differ':`${inp.gainDb} dB`;
    card.querySelector('.limits span').textContent=`${state.inputRange.min} dB`;card.querySelector('.limits span:last-child').textContent=`Max ${state.inputRange.max} dB`;
    const ob=card.querySelector('.agc-open');
    ob.textContent=`Automatic gain (AGC) · ${inp.agc===null?'mixed':inp.agc?'On':'Off'}  ›`;
    ob.classList.toggle('active',inp.agc===true);ob.setAttribute('aria-haspopup','dialog');
    ob.onclick=()=>{agcId=inp.id;fillAgc();fillAgcForm();$('#agc-error').textContent='';$('#agc-dialog').showModal();};
    note.textContent=state.status==='ready'?'Hardware readback · affects every room playing this source':'Stale readback · device not connected';
    slider.oninput=()=>{out.textContent=`${slider.value} dB requested`;note.classList.add('pending');};
    slider.onchange=async()=>{
      slider.blur();
      if(pending)return;pending=true;pendingId='input:'+inp.id;showError('');
      try{state=await api(`/api/inputs/${inp.id}`,{gainDb:Number(slider.value)});}catch(e){showError(e.message);}
      finally{pending=false;pendingId=null;render();}
    };
    $('#inputs').append(card);
  });
}

// Close a dialog when the click (press and release) lands on the backdrop, outside the card.
document.querySelectorAll('dialog').forEach(d=>{
  const outside=e=>{const r=d.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  let downOutside=false;
  d.addEventListener('mousedown',e=>{downOutside=e.target===d&&outside(e);});
  d.addEventListener('click',e=>{if(e.target===d&&downOutside&&outside(e))d.close();downOutside=false;});
});
