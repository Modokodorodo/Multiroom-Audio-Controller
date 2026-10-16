// Sidebar panel for ClearOne Multiroom. Plain web component; state is pushed over the
// Home Assistant WebSocket (clearone_multiroom/subscribe), changes go through callWS.
const DOMAIN = 'clearone_multiroom';

const CSS = `
:host{display:block;min-height:100%;background:var(--primary-background-color);color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif)}
*{box-sizing:border-box}
[hidden]{display:none!important}
.toolbar{display:flex;align-items:center;gap:8px;height:var(--header-height,56px);padding:0 12px;border-bottom:1px solid var(--divider-color);background:var(--app-header-background-color,var(--primary-background-color));color:var(--app-header-text-color,var(--primary-text-color))}
.toolbar .title{font-size:20px;flex:1;margin-left:4px}
main{max-width:1180px;margin:auto;padding:16px}
button{font:inherit;color:inherit;cursor:pointer}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid var(--divider-color);background:var(--card-background-color);font-size:13px;font-weight:500;text-decoration:none;color:inherit}
.pill.warn{border-color:var(--warning-color);color:var(--warning-color)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--success-color,#43a047)}.dot.off{background:var(--warning-color,#ffa600)}
.btn{padding:6px 14px;border-radius:999px;border:1px solid var(--divider-color);background:var(--card-background-color)}
.btn.primary{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}
.btn:disabled{opacity:.5;cursor:default}
.banner{border:1px solid var(--warning-color);border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:14px}
.banner.error{border-color:var(--error-color);color:var(--error-color)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--divider-color);margin-bottom:16px}
.tabs button{border:none;background:none;padding:10px 16px;color:var(--secondary-text-color);border-bottom:3px solid transparent;margin-bottom:-1px}
.tabs button:focus{outline:none}.tabs button:focus-visible{outline:2px solid var(--primary-color);outline-offset:-2px;border-radius:6px}
.tabs button[aria-selected=true]{color:var(--primary-text-color);border-bottom-color:var(--primary-color);font-weight:500}
.hint{font-size:13px;color:var(--secondary-text-color);margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:var(--card-background-color,#fff);border-radius:var(--ha-card-border-radius,12px);box-shadow:var(--ha-card-box-shadow,none);border:1px solid var(--ha-card-border-color,var(--divider-color));padding:16px 18px}
.card-head{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--secondary-text-color)}
h2{font-size:20px;font-weight:500;margin:10px 0 2px}
.sub{font-size:13px;color:var(--secondary-text-color);margin:0 0 12px;min-height:1em}
.label{font-size:12px;color:var(--secondary-text-color);margin:12px 0 6px;display:flex;justify-content:space-between;align-items:baseline}
.label output{font-size:18px;color:var(--primary-text-color);font-weight:500}
input[type=range]{width:100%;accent-color:var(--primary-color)}
.limits{display:flex;justify-content:space-between;font-size:11px;color:var(--secondary-text-color)}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{padding:7px 14px;border-radius:999px;border:1px solid var(--divider-color);background:transparent}
.chip.on{background:var(--primary-color);border-color:var(--primary-color);color:var(--text-primary-color,#fff)}
.chip:disabled,.wide:disabled{opacity:.5;cursor:default}
.sig{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--success-color,#43a047);margin-right:7px;vertical-align:middle}.chip.on .sig{background:currentColor}
.wide{width:100%;margin-top:14px;padding:10px;border-radius:10px;border:1px solid var(--divider-color);background:transparent;text-align:left}
.wide.on{border-color:var(--primary-color);color:var(--primary-color)}
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--secondary-background-color);font-size:11px;font-weight:500}
.badge::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--disabled-text-color,#999)}
.badge.on{color:var(--success-color,#43a047)}.badge.on::before{background:var(--success-color,#43a047);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}@media (prefers-reduced-motion:reduce){.badge.on::before{animation:none}}
.conn{margin-top:32px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 18px;border-radius:12px;border:1px solid var(--divider-color);font-size:13px}
.conn p{margin:4px 0 0;color:var(--secondary-text-color)}
dialog{border:none;border-radius:16px;padding:22px 24px;max-width:520px;width:calc(100% - 32px);background:var(--card-background-color,#fff);color:var(--primary-text-color);box-shadow:0 20px 60px rgba(0,0,0,.35)}
dialog::backdrop{background:rgba(0,0,0,.45)}
dialog h3{margin:0 0 8px;font-size:20px;font-weight:500}
.state{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;background:var(--secondary-background-color);margin:12px 0}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}
.fields label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500}
.fields span{font-weight:400;font-size:11px;color:var(--secondary-text-color)}
.fields input,.caprow input{padding:7px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;background:var(--card-background-color);color:inherit}
.caprow{display:flex;align-items:center;gap:8px;margin:10px 0;flex-wrap:wrap}.caprow label{flex:1;min-width:130px}.caprow input{width:84px}
.msg{font-size:12px;color:var(--secondary-text-color);flex-basis:100%;min-height:1em}
.err{color:var(--error-color);font-size:13px;min-height:1em}
.actions{display:flex;gap:8px;align-items:center;margin-top:14px}
@media (max-width:600px){main{padding:12px}.fields{grid-template-columns:1fr}}
`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

class ClearOneMultiroomPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._tab = 'rooms';
    try { this._tab = localStorage.getItem('clearone-multiroom-tab') || 'rooms'; } catch { /* storage unavailable */ }
    this._pending = null;
    this._error = '';
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._menu) this._menu.hass = hass;
    if (first) { this._build(); this._subscribe(); }
  }
  set narrow(narrow) { this._narrow = narrow; if (this._menu) this._menu.narrow = narrow; }
  set panel(_panel) {}

  connectedCallback() { if (this._hass && !this._unsub) this._subscribe(); }
  disconnectedCallback() { this._unsub?.then(u => u()).catch(() => {}); this._unsub = null; clearTimeout(this._retry); }

  _subscribe() {
    this._unsub = this._hass.connection.subscribeMessage(state => { this._state = state; this._render(); }, {type: `${DOMAIN}/subscribe`});
    this._unsub.catch(err => {
      this._unsub = null; this._state = null;
      this._error = `Integration not available: ${err.message || err.code || err}. Retrying…`; this._render();
      this._retry = setTimeout(() => this._subscribe(), 5000);
    });
  }

  async _call(type, data, key) {
    if (this._pending) return false;
    this._pending = key; this._error = ''; this._render();
    try { await this._hass.callWS({type: `${DOMAIN}/${type}`, ...data}); return true; }
    catch (err) { this._error = err.message || String(err); return false; }
    finally { this._pending = null; this._render(); }
  }

  _build() {
    const r = this.shadowRoot;
    r.innerHTML = `<style>${CSS}</style>
      <div class="toolbar"><span id="menu"></span><span class="title">Multiroom</span>
        <a class="pill" id="pill" href="#conn"><span class="dot" id="pill-dot"></span><span id="pill-text">Loading…</span></a>
        <button class="btn" id="open-settings">Settings</button></div>
      <main>
        <div id="banner" class="banner" hidden></div><div id="error" class="banner error" role="alert" hidden></div>
        <nav class="tabs" role="tablist"><button role="tab" id="tab-rooms">Rooms</button><button role="tab" id="tab-inputs">Inputs</button></nav>
        <section id="rooms" class="grid" aria-label="Rooms"></section>
        <section id="inputs-view" hidden><p class="hint">Input gain sets how loud a source is at its input, in every room. AGC is a back-end setting; you rarely need this tab.</p><div id="inputs" class="grid" aria-label="Inputs"></div></section>
        <section class="conn" id="conn" aria-label="Connection"><div><strong id="c-status"></strong><p id="c-detail"></p></div></section>
      </main>
      <dialog id="settings" aria-labelledby="s-title"><h3 id="s-title">Settings</h3><p class="hint"><strong>Maximum volume per room.</strong> Sliders cannot go above this. Changing a cap never changes the device or the current volume.</p><div id="caps"></div><div class="actions"><button class="btn" data-close>Close</button></div></dialog>
      <dialog id="agc" aria-labelledby="a-title"><h3 id="a-title"></h3>
        <p class="hint">Automatic gain control raises quiet signals on its own, up to the maximum gain. It applies to this source in every room.</p>
        <div class="state"><span id="a-status"></span><button class="btn primary" id="a-switch" role="switch"></button></div>
        <form id="a-form"><div class="fields">
          <label>Threshold<span>-50 to 0 dB, whole numbers</span><input type="number" name="thresholdDb" step="1" min="-50" max="0" required></label>
          <label>Target<span>-30 to 20 dB, whole numbers</span><input type="number" name="targetDb" step="1" min="-30" max="20" required></label>
          <label>Response time<span>0.10 to 10.00 s</span><input type="number" name="responseS" step="0.01" min="0.1" max="10" required></label>
          <label>Maximum gain<span>0 to 18 dB</span><input type="number" name="maxGainDb" step="0.01" min="0" max="18" required></label>
        </div><p class="hint" id="a-note"></p>
        <div class="actions"><button class="btn primary" type="submit" id="a-save">Save settings</button><span class="msg" id="a-saved" role="status"></span></div></form>
        <p class="err" id="a-err" role="alert"></p><div class="actions"><button class="btn" data-close>Close</button></div></dialog>`;
    this._menu = document.createElement('ha-menu-button');
    this._menu.hass = this._hass; this._menu.narrow = this._narrow;
    r.getElementById('menu').append(this._menu);
    r.getElementById('tab-rooms').onclick = () => this._showTab('rooms');
    r.getElementById('tab-inputs').onclick = () => this._showTab('inputs');
    r.getElementById('pill').onclick = e => { e.preventDefault(); r.getElementById('conn').scrollIntoView({behavior: 'smooth'}); };
    r.getElementById('open-settings').onclick = () => this._openSettings();
    r.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
    r.querySelectorAll('dialog').forEach(d => {
      // Close when pressed and released on the backdrop, outside the card.
      const outside = e => { const b = d.getBoundingClientRect(); return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom; };
      let down = false;
      d.addEventListener('mousedown', e => { down = e.target === d && outside(e); });
      d.addEventListener('click', e => { if (e.target === d && down && outside(e)) d.close(); down = false; });
    });
    r.getElementById('a-switch').onclick = () => {
      const inp = this._input(this._agcId); if (!inp) return;
      this._call('input', {source_id: inp.id, agc: inp.agc !== true}, 'agc').then(() => this._fillAgc());
    };
    r.getElementById('a-form').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), settings = {};
      for (const k of ['thresholdDb', 'targetDb', 'responseS', 'maxGainDb']) settings[k] = Number(f.get(k));
      r.getElementById('a-saved').textContent = '';
      if (await this._call('input', {source_id: this._agcId, agc_settings: settings}, 'agc')) r.getElementById('a-saved').textContent = 'Saved and confirmed by the device.';
      this._fillAgc();
    };
    this._showTab(this._tab);
  }

  _showTab(tab) {
    this._tab = tab;
    try { localStorage.setItem('clearone-multiroom-tab', tab); } catch { /* ignore */ }
    const r = this.shadowRoot;
    r.getElementById('rooms').hidden = tab !== 'rooms';
    r.getElementById('inputs-view').hidden = tab !== 'inputs';
    r.getElementById('tab-rooms').setAttribute('aria-selected', String(tab === 'rooms'));
    r.getElementById('tab-inputs').setAttribute('aria-selected', String(tab === 'inputs'));
  }

  _input(id) { return this._state?.inputs.find(i => i.id === id); }

  // A focused slider or number field is an edit in progress; don't rebuild under the user's hand.
  _editing() {
    const a = this.shadowRoot.activeElement;
    return !!a && a.tagName === 'INPUT' && ['range', 'number'].includes(a.type) && !a.closest('dialog');
  }

  _render() {
    if (!this.shadowRoot.getElementById('rooms')) return;
    const r = this.shadowRoot, s = this._state, ready = s?.status === 'ready';
    const err = r.getElementById('error'); err.hidden = !this._error; err.textContent = this._error;
    const pillText = !s ? 'Loading…' : ready ? 'Connected' : s.status === 'connecting' ? 'Connecting…' : 'Not reachable';
    r.getElementById('pill-text').textContent = pillText;
    r.getElementById('pill-dot').classList.toggle('off', !ready);
    r.getElementById('pill').classList.toggle('warn', !!s && !ready);
    const banner = r.getElementById('banner');
    banner.hidden = !s || ready;
    banner.textContent = s && !ready ? 'Cannot reach the ClearOne. Retrying automatically; controls are disabled until it is back.' : '';
    if (s) {
      const last = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : 'never';
      r.getElementById('c-status').textContent = `ClearOne ${s.device.host} · ${ready ? 'connected' : s.status}`;
      r.getElementById('c-detail').textContent = ready
        ? `Firmware ${s.device.firmware ?? '?'}. Last full read ${last}. Values are read back from the device.`
        : `${s.error ?? ''} Showing last known values from ${last}.`;
    }
    if (!s || this._editing()) return;
    this._renderRooms(s, ready);
    this._renderInputs(s, ready);
    if (r.getElementById('agc').open) this._fillAgc(false);
  }

  _renderRooms(s, ready) {
    const box = this.shadowRoot.getElementById('rooms');
    box.replaceChildren(...s.rooms.map(room => {
      const busy = this._pending === `room:${room.id}`, off = !ready || busy, known = room.gainDb !== null;
      const card = document.createElement('article'); card.className = 'card';
      const badge = !ready ? 'Unknown' : room.playing.length ? 'Playing' : room.muted ? 'Muted' : 'Quiet';
      card.innerHTML = `<div class="card-head"><span>Output ${room.output}</span><span class="badge ${room.playing.length ? 'on' : ''}">${badge}</span></div>
        <h2>${esc(room.name)}</h2><p class="sub">${room.playing.length ? 'Now: ' + esc(room.playing.join(' + ')) : 'Sources can play together'}</p>
        <div class="label">Sources</div><div class="chips"></div>
        <div class="label"><span>Volume</span><output>${known ? room.gainDb + ' dB' : '—'}</output></div>
        <input type="range" min="${room.minDb}" max="${room.maxDb}" step="0.5" value="${known ? room.gainDb : room.minDb}" aria-label="${esc(room.name)} volume in dB">
        <div class="limits"><span>${room.minDb} dB</span><span>Cap ${room.maxDb} dB${known && room.gainDb > room.maxDb ? ' · current volume is above the cap' : ''}</span></div>
        <button class="wide mute ${room.muted ? 'on' : ''}" aria-pressed="${room.muted === true}">${room.muted ? 'Muted · tap to unmute' : 'Playing · tap to mute'}</button>`;
      const chips = card.querySelector('.chips');
      for (const m of room.mix) {
        const b = document.createElement('button');
        b.className = `chip ${m.on ? 'on' : ''}`; b.disabled = off;
        b.setAttribute('aria-pressed', String(m.on));
        b.setAttribute('aria-label', `${room.name}: ${m.name} ${m.on ? 'on' : 'off'}${m.present ? ', signal present' : ''}`);
        b.innerHTML = `${m.present ? '<span class="sig"></span>' : ''}${esc(m.name)}`;
        b.onclick = () => this._call('room', {room_id: room.id, source_id: m.id, on: !m.on}, `room:${room.id}`);
        chips.append(b);
      }
      const slider = card.querySelector('input'), out = card.querySelector('output');
      slider.disabled = off;
      slider.oninput = () => { out.textContent = `${slider.value} dB`; };
      slider.onchange = () => { slider.blur(); this._call('room', {room_id: room.id, gain_db: Number(slider.value)}, `room:${room.id}`); };
      const mute = card.querySelector('.mute'); mute.disabled = off || room.muted === null;
      mute.onclick = () => this._call('room', {room_id: room.id, muted: !room.muted}, `room:${room.id}`);
      return card;
    }));
  }

  _renderInputs(s, ready) {
    const box = this.shadowRoot.getElementById('inputs');
    box.replaceChildren(...s.inputs.map(inp => {
      const off = !ready || this._pending === `input:${inp.id}`, known = inp.gainDb !== null;
      const card = document.createElement('article'); card.className = 'card';
      card.innerHTML = `<div class="card-head"><span>${inp.channels.map(c => c.group + c.channel).join(' + ')}${inp.channels.length > 1 ? ' · set together' : ''}</span>
          <span class="badge ${inp.present ? 'on' : ''}">${inp.present === null ? 'Unknown' : inp.present ? 'Signal' : 'No signal'}</span></div>
        <h2>${esc(inp.name)}</h2>
        <div class="label"><span>Input gain</span><output>${known ? inp.gainDb + ' dB' : 'Channels differ'}</output></div>
        <input type="range" min="${s.inputRange.min}" max="${s.inputRange.max}" step="0.5" value="${known ? inp.gainDb : s.inputRange.min}" aria-label="${esc(inp.name)} input gain in dB">
        <div class="limits"><span>${s.inputRange.min} dB</span><span>Max ${s.inputRange.max} dB</span></div>
        <button class="wide ${inp.agc ? 'on' : ''}" aria-haspopup="dialog">Automatic gain (AGC) · ${inp.agc === null ? 'mixed' : inp.agc ? 'On' : 'Off'} ›</button>`;
      const slider = card.querySelector('input'), out = card.querySelector('output');
      slider.disabled = off;
      slider.oninput = () => { out.textContent = `${slider.value} dB`; };
      slider.onchange = () => { slider.blur(); this._call('input', {source_id: inp.id, gain_db: Number(slider.value)}, `input:${inp.id}`); };
      card.querySelector('.wide').onclick = () => { this._agcId = inp.id; this._fillAgc(true); this.shadowRoot.getElementById('a-err').textContent = ''; this.shadowRoot.getElementById('agc').showModal(); };
      return card;
    }));
  }

  // Status and switch follow live state; the form fields are filled only on open, so typing is never overwritten.
  _fillAgc(withForm = false) {
    const r = this.shadowRoot, inp = this._input(this._agcId); if (!inp) return;
    const ready = this._state.status === 'ready', on = inp.agc === true;
    r.getElementById('a-title').textContent = `${inp.name} · Automatic gain (AGC)`;
    r.getElementById('a-status').textContent = inp.agc === null ? 'Channels differ' : on ? 'AGC is on' : 'AGC is off';
    const sw = r.getElementById('a-switch'); sw.textContent = on ? 'Turn off' : 'Turn on'; sw.setAttribute('aria-checked', String(on));
    sw.disabled = r.getElementById('a-save').disabled = !ready || !!this._pending;
    r.getElementById('a-err').textContent = this._error;
    if (!withForm || !inp.channels.length) return;
    const st = inp.channels[0].agcSettings, form = r.getElementById('a-form');
    form.thresholdDb.value = st.thresholdDb; form.targetDb.value = st.targetDb;
    form.responseS.value = st.responseS.toFixed(2); form.maxGainDb.value = st.maxGainDb.toFixed(2);
    const same = inp.channels.every(c => JSON.stringify(c.agcSettings) === JSON.stringify(st));
    r.getElementById('a-note').textContent = inp.channels.length > 1
      ? `Saved to ${inp.channels.map(c => c.group + c.channel).join(' and ')} together.${same ? '' : ' They currently differ; saving makes them identical.'}`
      : `Saved to ${inp.channels[0].group}${inp.channels[0].channel}.`;
    r.getElementById('a-saved').textContent = '';
  }

  _openSettings() {
    const r = this.shadowRoot, s = this._state; if (!s) return;
    const box = r.getElementById('caps');
    box.replaceChildren(...s.rooms.map(room => {
      const row = document.createElement('div'); row.className = 'caprow';
      row.innerHTML = `<label>${esc(room.name)}</label><input type="number" step="0.5" min="${room.minDb + 5}" max="0" value="${room.maxDb}" aria-label="${esc(room.name)} volume cap in dB"><span>dB</span><button class="btn">Save</button><span class="msg" role="status"></span>`;
      const input = row.querySelector('input'), msg = row.querySelector('.msg');
      row.querySelector('button').onclick = async () => {
        msg.textContent = '';
        try { await this._hass.callWS({type: `${DOMAIN}/cap`, room_id: room.id, max_db: Number(input.value)}); msg.textContent = 'Saved'; }
        catch (err) { msg.textContent = err.message || String(err); }
      };
      return row;
    }));
    r.getElementById('settings').showModal();
  }
}

customElements.define('clearone-multiroom-panel', ClearOneMultiroomPanel);
