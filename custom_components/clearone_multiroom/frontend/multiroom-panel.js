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
.level{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--secondary-text-color);margin-top:10px;flex-wrap:wrap}
.meter{position:relative;flex:1;min-width:120px;height:6px;border-radius:3px;background:var(--secondary-background-color)}
.meter>span{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--primary-color);transition:width .4s}
.meter>i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--warning-color,#ffa600)}
.tag{padding:2px 8px;border-radius:999px;border:1px solid var(--divider-color);font-size:11px}
#c-auto{margin-top:6px}
.banner .btn{margin-left:8px}.conn-actions{margin-top:0}.btn.power{min-width:72px}
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
.sig{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;vertical-align:middle;background:currentColor;opacity:.25;transition:opacity .3s,background-color .3s}
.sig.live{opacity:1;background:var(--success-color,#43a047)}.chip.on .sig.live{background:currentColor;box-shadow:0 0 0 2px rgba(255,255,255,.25)}
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
dialog.big{max-width:680px;padding:18px 22px}
.s-head{display:flex;justify-content:space-between;align-items:center}
.icon-btn{border:none;background:none;font-size:18px;padding:6px 10px;border-radius:8px;color:var(--secondary-text-color)}
.icon-btn:hover{background:var(--secondary-background-color)}
.s-tabs{overflow-x:auto;scrollbar-width:none;margin-bottom:8px}
.s-body{min-height:260px;max-height:62vh;overflow-y:auto;padding:4px 2px}
.s-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--divider-color)}
.s-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.s-label{font-size:14px;font-weight:500}
.s-help{font-size:12px;color:var(--secondary-text-color)}
.s-room{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;padding:10px 0;border-bottom:1px solid var(--divider-color)}
.s-room.is-hidden .s-text{opacity:.5}
.s-inline{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--secondary-text-color)}
.s-inline input[type=number],.stepper input{width:72px;padding:6px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;background:var(--card-background-color);color:var(--primary-text-color)}
.stepper{display:inline-flex;align-items:center;gap:6px}.stepper .btn{padding:4px 12px}
.s-quick{margin:8px 0 4px}
.s-threshold{padding-top:10px}.s-threshold input[type=range]{margin:6px 0 10px}
.s-level{display:grid;grid-template-columns:90px 1fr 120px auto;gap:12px;align-items:center;padding:6px 0;font-size:13px}
.s-level .meter{height:8px}.s-level.loud .meter>span{background:var(--success-color,#43a047)}.s-level.ignored{opacity:.55}
.s-val{color:var(--secondary-text-color);font-size:12px}
.s-field{display:flex;flex-direction:column;gap:4px;padding:10px 0}
.s-field select{padding:8px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;background:var(--card-background-color);color:var(--primary-text-color);margin-top:4px}
.s-status{padding:12px 14px;border-radius:12px;background:var(--secondary-background-color);font-size:13px;margin:4px 0 10px;line-height:1.5}
.warn-text{color:var(--warning-color)}
.s-foot{display:flex;justify-content:flex-end;align-items:center;gap:8px;border-top:1px solid var(--divider-color);padding-top:12px;margin-top:8px}
.s-foot .msg{flex:1;flex-basis:auto}.msg.bad{color:var(--error-color)}
input.switch{appearance:none;-webkit-appearance:none;width:38px;height:22px;border-radius:11px;background:var(--disabled-text-color,#999);position:relative;cursor:pointer;flex:none;transition:background .2s;margin:0}
input.switch::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s}
input.switch:checked{background:var(--primary-color)}input.switch:checked::after{left:19px}
input.switch:disabled{opacity:.45;cursor:default}
input.switch:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
@media (max-width:600px){dialog.big{max-width:none;width:100%;height:100%;max-height:none;margin:0;border-radius:0}.s-body{max-height:none}
  .s-room{grid-template-columns:1fr auto}.s-room label:last-child{grid-column:1/-1}.s-level{grid-template-columns:70px 1fr auto}.s-level .s-val{display:none}}
.state{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;background:var(--secondary-background-color);margin:12px 0}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:10px 0}
.fields label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500}
.fields span{font-weight:400;font-size:11px;color:var(--secondary-text-color)}
.fields input,.caprow input{padding:7px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;background:var(--card-background-color);color:inherit}
.caprow{display:flex;align-items:center;gap:8px;margin:10px 0;flex-wrap:wrap}.caprow label{flex:1;min-width:130px}.caprow input{width:84px}
.msg{font-size:12px;color:var(--secondary-text-color);flex-basis:100%;min-height:1em}
.err{color:var(--error-color);font-size:13px;min-height:1em}
.actions{display:flex;gap:8px;align-items:center;margin-top:14px}.actions.wrap{flex-wrap:wrap}
.quick{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.newscene{margin-bottom:16px;max-width:620px}.newscene h2{margin-top:0;font-size:17px}
.field{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--secondary-text-color);margin-top:8px}
.field input{padding:9px;border:1px solid var(--divider-color);border-radius:8px;font:inherit;font-size:15px;background:var(--card-background-color);color:var(--primary-text-color)}
.checks{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}.checks input{accent-color:var(--primary-color)}
.rows{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--secondary-text-color);line-height:1.7}.rows strong{color:var(--primary-text-color);font-weight:500}
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
        <button class="btn power" id="power" hidden></button><button class="btn" id="open-settings">Settings</button></div>
      <main>
        <div id="banner" class="banner" hidden></div><div id="error" class="banner error" role="alert" hidden></div>
        <nav class="tabs" role="tablist"><button role="tab" id="tab-rooms">Rooms</button><button role="tab" id="tab-scenes">Scenes</button><button role="tab" id="tab-inputs">Inputs</button></nav>
        <div id="rooms-view"><div id="quick" class="quick" aria-label="Scenes" hidden></div><section id="rooms" class="grid" aria-label="Rooms"></section></div>
        <section id="scenes-view" hidden>
          <p class="hint">A scene remembers, for the rooms you pick, which sources are on, the volume and mute. Set the rooms the way you want on the Rooms tab, then save it here. Each scene is also a Home Assistant scene entity, so you can use it on dashboards, in automations and with Alexa.</p>
          <form id="new-scene" class="card newscene"><h2>New scene from the current state</h2>
            <label class="field">Name<input name="name" maxlength="40" required placeholder="e.g. Downstairs music" autocomplete="off"></label>
            <div class="label">Rooms</div><div class="checks" id="scene-rooms"></div>
            <div class="actions"><button class="btn primary" type="submit">Save scene</button><span class="msg" id="scene-msg" role="status"></span></div></form>
          <div id="scenes" class="grid" aria-label="Saved scenes"></div>
        </section>
        <section id="inputs-view" hidden><p class="hint">Input gain sets how loud a source is at its input, in every room. AGC is a back-end setting; you rarely need this tab.</p><div id="inputs" class="grid" aria-label="Inputs"></div></section>
        <section class="conn" id="conn" aria-label="Connection"><div><strong id="c-status"></strong><p id="c-detail"></p><p id="c-auto"></p></div></section>
      </main>
      <dialog id="settings" class="big" aria-labelledby="s-title">
        <div class="s-head"><h3 id="s-title">Settings</h3><button class="icon-btn" id="s-close" aria-label="Close settings">✕</button></div>
        <nav class="tabs s-tabs" role="tablist" aria-label="Settings sections">
          <button role="tab" data-tab="rooms">Rooms</button><button role="tab" data-tab="power">Auto power</button><button role="tab" data-tab="devices">Devices</button><button role="tab" data-tab="connection">Connection</button>
        </nav>
        <p class="hint" id="s-readonly" hidden>Only administrators can change these settings.</p>
        <div id="s-body" class="s-body"></div>
        <div class="s-foot" id="s-foot"><span class="msg" id="s-msg" role="status"></span><button class="btn" id="s-revert">Discard changes</button><button class="btn primary" id="s-save">Save</button></div>
      </dialog>
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
    r.getElementById('tab-scenes').onclick = () => this._showTab('scenes');
    r.getElementById('new-scene').onsubmit = async e => {
      e.preventDefault();
      const form = e.target, msg = r.getElementById('scene-msg');
      const room_ids = [...form.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
      msg.textContent = '';
      if (await this._call('scene_save', {name: form.name.value, room_ids}, 'scene')) { msg.textContent = `Saved "${form.name.value.trim()}"`; form.name.value = ''; }
    };
    r.getElementById('pill').onclick = e => { e.preventDefault(); r.getElementById('conn').scrollIntoView({behavior: 'smooth'}); };
    r.getElementById('open-settings').onclick = () => this._openSettings();
    r.getElementById('s-close').onclick = () => this._closeSettings();
    r.getElementById('settings').addEventListener('cancel', e => { e.preventDefault(); this._closeSettings(); });
    r.querySelectorAll('.s-tabs button').forEach(b => { b.onclick = () => this._settingsTab(b.dataset.tab); });
    r.getElementById('s-save').onclick = () => this._saveSettings();
    r.getElementById('s-revert').onclick = () => { this._draft = structuredClone(this._base); this._renderSettings(); };
    r.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
    r.querySelectorAll('dialog').forEach(d => {
      // Close when pressed and released on the backdrop, outside the card.
      const outside = e => { const b = d.getBoundingClientRect(); return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom; };
      let down = false;
      d.addEventListener('mousedown', e => { down = e.target === d && outside(e); });
      d.addEventListener('click', e => { if (e.target === d && down && outside(e)) (d.id === 'settings' ? this._closeSettings() : d.close()); down = false; });
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
    r.getElementById('rooms-view').hidden = tab !== 'rooms';
    r.getElementById('scenes-view').hidden = tab !== 'scenes';
    r.getElementById('tab-scenes').setAttribute('aria-selected', String(tab === 'scenes'));
    r.getElementById('inputs-view').hidden = tab !== 'inputs';
    r.getElementById('tab-rooms').setAttribute('aria-selected', String(tab === 'rooms'));
    r.getElementById('tab-inputs').setAttribute('aria-selected', String(tab === 'inputs'));
  }

  // One line describing the automatic switch-off.
  _autoOffText(a) {
    const info = a?.autoOff;
    if (!info) return '';
    const mins = info.minutes, t = iso => new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    switch (info.state) {
      case 'no_power_switch': return 'Automatic switch-off: needs a power switch (integration → Configure).';
      case 'disabled': return 'Automatic switch-off is turned off.';
      case 'off': return `Automatic switch-off: system is off. It switches off after ${mins} min without sound.`;
      case 'paused': return 'Automatic switch-off: on hold while communication is paused.';
      case 'waiting': return 'Automatic switch-off: waiting for the ClearOne.';
      case 'switching_off': return `No sound for ${mins} min: switching off.`;
      case 'counting': {
        const left = Math.max(0, Math.round((new Date(info.offAt) - Date.now()) / 60000));
        return `Automatic switch-off after ${mins} min without sound (threshold ${a.thresholdDb} dB): last sound ${t(info.lastActivity)}, switches off around ${t(info.offAt)} (≈${left} min).`;
      }
      default: return '';
    }
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
    const power = s?.power, off = power?.on === false;
    const paused = s?.paused === true;
    const pillText = !s ? 'Loading…' : ready ? 'Connected' : paused ? 'Paused' : off ? 'Switched off' : s.status === 'connecting' ? 'Connecting…' : 'Not reachable';
    const pw = r.getElementById('power');
    pw.hidden = !power;
    if (power) {
      pw.textContent = `⏻ ${power.on ? 'On' : power.on === false ? 'Off' : '?'}`;
      pw.classList.toggle('primary', power.on === true);
      pw.disabled = !!this._pending || power.on === null;
      pw.setAttribute('aria-label', `ClearOne and amplifier power: ${power.on ? 'on' : 'off'}`);
      pw.onclick = () => {
        if (power.on && !confirm('Switch off the ClearOne and the amplifier? All rooms go silent.')) return;
        this._call('power', {on: !power.on}, 'power');
      };
    }
    r.getElementById('pill-text').textContent = pillText;
    r.getElementById('pill-dot').classList.toggle('off', !ready);
    r.getElementById('pill').classList.toggle('warn', !!s && !ready);
    const banner = r.getElementById('banner');
    banner.hidden = !s || ready;
    banner.replaceChildren();
    if (s && !ready) {
      if (paused) {
        banner.append('Communication with the ClearOne is paused; controls are disabled. ');
        const go = document.createElement('button'); go.className = 'btn primary'; go.textContent = 'Resume';
        go.disabled = !!this._pending; go.onclick = () => this._call('connection', {action: 'resume'}, 'connection');
        banner.append(go);
      } else if (off) {
        banner.append('The ClearOne and the amplifier are switched off. ');
        const on = document.createElement('button'); on.className = 'btn primary'; on.textContent = 'Turn on';
        on.disabled = !!this._pending; on.onclick = () => this._call('power', {on: true}, 'power');
        banner.append(on);
      } else {
        banner.append(power?.on ? 'Starting up the ClearOne… connecting automatically; controls are disabled until it is ready.'
          : 'Cannot reach the ClearOne. Retrying automatically; controls are disabled until it is back.');
      }
    }
    if (s) {
      const last = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : 'never';
      r.getElementById('c-status').textContent = `ClearOne ${s.device.host} · ${ready ? 'connected' : s.status}`;
      r.getElementById('c-detail').textContent = ready
        ? `Firmware ${s.device.firmware ?? '?'}. Last full read ${last}. Values are read back from the device.`
        : paused ? `Paused: no connection and no polling until you resume. Showing last known values from ${last}.`
        : `${s.error ?? ''} Showing last known values from ${last}.`;
      r.getElementById('c-auto').textContent = this._autoOffText(s.activity);
    }
    if (!s || this._editing()) return;
    this._renderRooms(s, ready);
    this._renderInputs(s, ready);
    this._renderScenes(s, ready);
    if (r.getElementById('agc').open) this._fillAgc(false);
    if (r.getElementById('settings').open) this._settingsLive();
  }

  _renderRooms(s, ready) {
    const box = this.shadowRoot.getElementById('rooms');
    box.replaceChildren(...s.rooms.filter(room => !room.hidden).map(room => {
      const busy = this._pending === `room:${room.id}`, off = !ready || busy, known = room.gainDb !== null;
      const card = document.createElement('article'); card.className = 'card';
      const badge = !ready ? 'Unknown' : room.playing.length ? 'Playing' : room.muted ? 'Muted' : 'Quiet';
      card.innerHTML = `<div class="card-head"><span>Output ${room.output}</span><span class="badge ${room.playing.length ? 'on' : ''}">${badge}</span></div>
        <h2>${esc(room.name)}</h2><p class="sub">${room.playing.length ? 'Now: ' + esc(room.playing.join(' + ')) : ''}</p>
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
        // The dot is always there (fixed width), so buttons never shift; only its colour changes.
        b.innerHTML = `<span class="sig${m.present ? ' live' : ''}" aria-hidden="true"></span>${esc(m.name)}`;
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

  _renderScenes(s, ready) {
    const r = this.shadowRoot, busy = this._pending === 'scene';
    const quick = r.getElementById('quick');
    quick.hidden = !s.scenes.length;
    quick.replaceChildren(...s.scenes.map(sc => {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = sc.name; b.disabled = !ready || busy;
      b.setAttribute('aria-label', `Apply scene ${sc.name}`);
      b.onclick = () => this._call('scene_apply', {scene_id: sc.id}, 'scene');
      return b;
    }));
    const checks = r.getElementById('scene-rooms');
    const visible = s.rooms.filter(room => !room.hidden), key = visible.map(room => room.id).join();
    if (checks.dataset.rooms !== key) {
      checks.dataset.rooms = key;
      checks.replaceChildren(...visible.map(room => {
        const l = document.createElement('label');
        l.innerHTML = `<input type="checkbox" value="${esc(room.id)}" checked> ${esc(room.name)}`;
        return l;
      }));
    }
    r.querySelector('#new-scene button[type=submit]').disabled = !ready || busy;
    const box = r.getElementById('scenes');
    box.replaceChildren(...s.scenes.map(sc => {
      const card = document.createElement('article'); card.className = 'card';
      const rows = sc.rooms.map(rm => `<li><strong>${esc(rm.name)}</strong> · ${rm.sources.length ? esc(rm.sources.join(' + ')) : 'no sources'} · ${rm.muted ? 'muted' : rm.gainDb + ' dB'}</li>`).join('');
      card.innerHTML = `<div class="card-head"><span>Scene</span></div><h2>${esc(sc.name)}</h2><ul class="rows">${rows}</ul>
        <div class="actions wrap"><button class="btn primary" data-a="apply">Apply</button><button class="btn" data-a="capture">Update to current</button><button class="btn" data-a="rename">Rename</button><button class="btn" data-a="delete">Delete</button></div>`;
      card.querySelectorAll('button').forEach(b => { b.disabled = busy || (!ready && b.dataset.a !== 'rename' && b.dataset.a !== 'delete'); });
      card.querySelector('[data-a=apply]').onclick = () => this._call('scene_apply', {scene_id: sc.id}, 'scene');
      card.querySelector('[data-a=capture]').onclick = () => {
        if (confirm(`Replace "${sc.name}" with the current state of ${sc.rooms.map(x => x.name).join(', ')}?`)) this._call('scene_update', {scene_id: sc.id, capture: true}, 'scene');
      };
      card.querySelector('[data-a=rename]').onclick = () => {
        const name = prompt('New name for this scene', sc.name);
        if (name && name.trim() !== sc.name) this._call('scene_update', {scene_id: sc.id, name}, 'scene');
      };
      card.querySelector('[data-a=delete]').onclick = () => {
        if (confirm(`Delete scene "${sc.name}"? Its Home Assistant scene entity is removed too.`)) this._call('scene_delete', {scene_id: sc.id}, 'scene');
      };
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
        <div class="level"><span>Level ${inp.levelDb == null ? '—' : Math.round(inp.levelDb) + ' dB'}</span>
          <span class="meter" aria-hidden="true"><span style="width:${inp.levelDb == null ? 0 : Math.max(0, Math.min(100, (inp.levelDb + 90) / 90 * 100))}%"></span>
          ${s.activity ? `<i style="left:${Math.max(0, Math.min(100, (s.activity.thresholdDb + 90) / 90 * 100))}%" title="Sound threshold ${s.activity.thresholdDb} dB"></i>` : ''}</span>
          ${inp.ignored ? '<span class="tag">ignored for auto-off</span>' : ''}</div>
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

  // ---- Settings dialog -------------------------------------------------------------------------
  // Each tab edits a draft; Save sends only that tab's values (same storage as the integration's Configure).
  static TAB_KEYS = {rooms: ['hidden_rooms', 'caps'],
    power: ['auto_on', 'hold_playback', 'auto_off', 'idle_minutes', 'sound_threshold_db', 'ignored_sources'],
    devices: ['arylic_entity', 'power_entity'], connection: []};

  _snapshot() {
    const s = this._state, v = structuredClone(s.settings || {});
    v.caps = Object.fromEntries(s.rooms.map(room => [room.id, room.maxDb]));
    return v;
  }

  _dirty() {
    const keys = ClearOneMultiroomPanel.TAB_KEYS[this._sTab] || [];
    return keys.some(k => JSON.stringify(this._draft?.[k] ?? null) !== JSON.stringify(this._base?.[k] ?? null));
  }

  _openSettings(tab) {
    if (!this._state) return;
    this._base = this._snapshot(); this._draft = structuredClone(this._base);
    this._sTab = tab || this._sTab || 'rooms';
    this._renderSettings();
    this.shadowRoot.getElementById('settings').showModal();
  }

  _closeSettings() {
    if (this._dirty() && !confirm('Discard your unsaved changes?')) return;
    this.shadowRoot.getElementById('settings').close();
  }

  _settingsTab(tab) {
    if (tab === this._sTab) return;
    if (this._dirty()) {
      if (!confirm('Discard your unsaved changes on this tab?')) return;
      this._draft = structuredClone(this._base);
    }
    this._sTab = tab; this._renderSettings();
  }

  async _saveSettings() {
    const keys = ClearOneMultiroomPanel.TAB_KEYS[this._sTab], values = {}, msg = this.shadowRoot.getElementById('s-msg');
    for (const k of keys) values[k] = this._draft[k];
    if (values.caps) values.caps = Object.fromEntries(Object.entries(values.caps).filter(([id, v]) => v !== this._base.caps[id]));
    msg.className = 'msg'; msg.textContent = 'Saving…';
    try {
      await this._hass.callWS({type: `${DOMAIN}/settings`, values});
      for (const k of keys) this._base[k] = structuredClone(this._draft[k]);
      msg.textContent = this._sTab === 'devices' ? 'Saved. The integration reconnects (about a second).' : 'Saved.';
    } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message || String(err); }
    this._settingsFooter();
  }

  _settingsFooter() {
    const r = this.shadowRoot, admin = this._state?.isAdmin, dirty = this._dirty();
    r.getElementById('s-foot').hidden = this._sTab === 'connection' || !admin;
    r.getElementById('s-save').disabled = r.getElementById('s-revert').disabled = !dirty;
    if (dirty && r.getElementById('s-msg').textContent.startsWith('Saved')) r.getElementById('s-msg').textContent = '';
  }

  // Small builders for consistent rows.
  _switchRow(label, help, checked, onChange, disabled) {
    const row = document.createElement('label'); row.className = 's-row';
    row.innerHTML = `<span class="s-text"><span class="s-label">${esc(label)}</span>${help ? `<span class="s-help">${esc(help)}</span>` : ''}</span><input type="checkbox" class="switch">`;
    const box = row.querySelector('input'); box.checked = !!checked; box.disabled = !!disabled;
    box.onchange = () => { onChange(box.checked); this._settingsFooter(); };
    return row;
  }

  _renderSettings() {
    const r = this.shadowRoot, s = this._state, d = this._draft, admin = !!s.isAdmin, body = r.getElementById('s-body');
    r.querySelectorAll('.s-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === this._sTab)));
    r.getElementById('s-readonly').hidden = admin || this._sTab === 'connection';
    r.getElementById('s-msg').textContent = '';
    body.replaceChildren();
    const ro = !admin;
    if (this._sTab === 'rooms') {
      body.insertAdjacentHTML('beforeend', '<p class="hint">Hide rooms you do not use (yet). Hidden rooms disappear from the panel and their entities are hidden in Home Assistant, but keep working. The cap is the highest volume the slider allows; changing it never changes the current volume.</p>');
      for (const room of s.rooms) {
        const row = document.createElement('div'); row.className = 's-room' + (d.hidden_rooms.includes(room.id) ? ' is-hidden' : '');
        row.innerHTML = `<span class="s-text"><span class="s-label">${esc(room.name)}</span><span class="s-help">Output ${room.output}${room.deviceLabel ? ' · ' + esc(room.deviceLabel) : ''}</span></span>
          <label class="s-inline">Show <input type="checkbox" class="switch"></label>
          <label class="s-inline">Cap <input type="number" step="0.5" min="${room.minDb + 5}" max="0"> dB</label>`;
        const show = row.querySelector('.switch'), cap = row.querySelector('input[type=number]');
        show.checked = !d.hidden_rooms.includes(room.id); show.disabled = ro;
        show.onchange = () => {
          d.hidden_rooms = show.checked ? d.hidden_rooms.filter(id => id !== room.id) : [...d.hidden_rooms, room.id];
          row.classList.toggle('is-hidden', !show.checked); this._settingsFooter();
        };
        cap.value = d.caps[room.id]; cap.disabled = ro;
        cap.oninput = () => { d.caps[room.id] = cap.value === '' ? this._base.caps[room.id] : Number(cap.value); this._settingsFooter(); };
        cap.setAttribute('aria-label', `${room.name} volume cap in dB`);
        body.append(row);
      }
    } else if (this._sTab === 'power') {
      const noPower = !s.settings.power_entity;
      body.insertAdjacentHTML('beforeend', `<div class="s-status" id="s-auto"></div>${noPower ? '<p class="hint warn-text">Choose the power switch on the Devices tab first; automatic power needs it.</p>' : ''}`);
      const dis = ro || noPower;
      body.append(
        this._switchRow('Switch on when music starts', 'When the Arylic starts playing or a room speaker is used.', d.auto_on, v => { d.auto_on = v; }, dis),
        this._switchRow('Hold playback until ready', 'Pause the Arylic while the ClearOne starts, so the start of the music is not lost.', d.hold_playback, v => { d.hold_playback = v; }, dis),
        this._switchRow('Switch off when quiet', 'After the minutes below without sound.', d.auto_off, v => { d.auto_off = v; }, dis));
      const mins = document.createElement('div'); mins.className = 's-row';
      mins.innerHTML = `<span class="s-text"><span class="s-label">Minutes without sound</span><span class="s-help">Before switching off.</span></span>
        <span class="stepper"><button class="btn" data-d="-5" aria-label="5 minutes less">−</button><input type="number" min="1" max="480" step="1" aria-label="Minutes without sound"><button class="btn" data-d="5" aria-label="5 minutes more">+</button></span>`;
      const mi = mins.querySelector('input'); mi.value = d.idle_minutes; mi.disabled = dis;
      const setMin = v => { d.idle_minutes = Math.max(1, Math.min(480, Math.round(v) || 1)); mi.value = d.idle_minutes; this._settingsFooter(); };
      mi.oninput = () => { if (mi.value !== '') { d.idle_minutes = Number(mi.value); this._settingsFooter(); } };
      mi.onchange = () => setMin(Number(mi.value));
      mins.querySelectorAll('button').forEach(b => { b.disabled = dis; b.onclick = () => setMin(d.idle_minutes + Number(b.dataset.d)); });
      const quick = document.createElement('div'); quick.className = 'chips s-quick';
      for (const q of [10, 20, 30, 60]) {
        const b = document.createElement('button'); b.className = 'chip'; b.textContent = `${q} min`; b.disabled = dis;
        b.onclick = () => setMin(q); quick.append(b);
      }
      const th = document.createElement('div'); th.className = 's-threshold';
      th.innerHTML = `<div class="s-row"><span class="s-text"><span class="s-label">Sound threshold <output id="s-th"></output></span>
        <span class="s-help">Louder than this counts as sound. Set it above the noise and below your music: watch the live bars.</span></span></div>
        <input type="range" min="-90" max="-10" step="1" aria-label="Sound threshold in dB"><div id="s-levels"></div>`;
      const slider = th.querySelector('input'); slider.value = d.sound_threshold_db; slider.disabled = dis;
      slider.oninput = () => { d.sound_threshold_db = Number(slider.value); this._settingsLive(); this._settingsFooter(); };
      body.append(mins, quick, th);
      const levels = th.querySelector('#s-levels');
      for (const inp of s.inputs) {
        const row = document.createElement('div'); row.className = 's-level'; row.dataset.src = inp.id;
        row.innerHTML = `<span class="s-label">${esc(inp.name)}</span><span class="meter"><span></span><i></i></span><span class="s-val"></span>
          <label class="s-inline">Ignore <input type="checkbox" class="switch"></label>`;
        const ig = row.querySelector('.switch'); ig.checked = d.ignored_sources.includes(inp.id); ig.disabled = dis;
        ig.setAttribute('aria-label', `Ignore ${inp.name} for switching off`);
        ig.onchange = () => {
          d.ignored_sources = ig.checked ? [...d.ignored_sources, inp.id] : d.ignored_sources.filter(id => id !== inp.id);
          this._settingsLive(); this._settingsFooter();
        };
        levels.append(row);
      }
    } else if (this._sTab === 'devices') {
      const states = Object.values(this._hass.states);
      const name = st => st.attributes.friendly_name || st.entity_id;
      const select = (label, help, key, filter) => {
        const row = document.createElement('label'); row.className = 's-field';
        row.innerHTML = `<span class="s-label">${esc(label)}</span><span class="s-help">${esc(help)}</span><select></select>`;
        const sel = row.querySelector('select'); sel.disabled = ro;
        sel.add(new Option('— none —', ''));
        states.filter(filter).sort((a, b) => name(a).localeCompare(name(b))).forEach(st => sel.add(new Option(`${name(st)} (${st.entity_id})`, st.entity_id)));
        if (d[key] && ![...sel.options].some(o => o.value === d[key])) sel.add(new Option(`${d[key]} (not found)`, d[key]));
        sel.value = d[key] || '';
        sel.onchange = () => { d[key] = sel.value || null; this._settingsFooter(); };
        return row;
      };
      body.append(
        select('Arylic media player', 'The LinkPlay entity of the Arylic (not Music Assistant\'s copy). Room speakers stream through it.', 'arylic_entity',
          st => st.entity_id.startsWith('media_player.') && !('stream_via' in st.attributes) && !('mass_player_type' in st.attributes)),
        select('Power switch', 'The relay that switches the ClearOne and the amplifier. Needed for the ⏻ button and automatic power.', 'power_entity',
          st => /^(switch|input_boolean|light)\./.test(st.entity_id)));
      body.insertAdjacentHTML('beforeend', '<p class="hint">Saving a change here reconnects the integration briefly (about a second).</p>');
    } else {
      body.insertAdjacentHTML('beforeend', `<div class="s-status" id="s-conn"></div>
        <div class="actions wrap"><button class="btn" id="s-pause"></button><button class="btn" id="s-reconnect">Reconnect now</button></div>
        <p class="hint">Pause stops all communication with the ClearOne until you resume, for example while you use Converge Console. Reconnect drops the connection and connects again right away.</p>
        <p class="hint">Changing the ClearOne's address or login: Settings → Devices &amp; services → ClearOne Multiroom → ⋮ → <strong>Reconfigure</strong> (the login is checked there).</p>
        <div class="actions"><button class="btn" id="s-open-integration">Open the integration page</button></div>`);
      body.querySelector('#s-reconnect').onclick = () => this._call('connection', {action: 'reconnect'}, 'connection');
      body.querySelector('#s-open-integration').onclick = () => {
        this.shadowRoot.getElementById('settings').close();
        history.pushState(null, '', '/config/integrations/integration/clearone_multiroom');
        window.dispatchEvent(new CustomEvent('location-changed'));
      };
    }
    this._settingsLive();
    this._settingsFooter();
  }

  // Parts of the open dialog that follow the device every few seconds (never the fields being edited).
  _settingsLive() {
    const r = this.shadowRoot, s = this._state, d = this._draft; if (!s || !d) return;
    const auto = r.getElementById('s-auto');
    if (auto) auto.textContent = this._autoOffText(s.activity) || '—';
    const out = r.getElementById('s-th');
    if (out) out.textContent = `${d.sound_threshold_db} dB`;
    const pct = v => Math.max(0, Math.min(100, (v + 90) / 80 * 100));  // -90..-10 dB, like the slider
    r.querySelectorAll('.s-level').forEach(row => {
      const inp = s.inputs.find(i => i.id === row.dataset.src); if (!inp) return;
      const loud = inp.levelDb != null && inp.levelDb > d.sound_threshold_db, ignored = d.ignored_sources.includes(inp.id);
      row.querySelector('.meter>span').style.width = `${inp.levelDb == null ? 0 : pct(inp.levelDb)}%`;
      row.querySelector('.meter>i').style.left = `${pct(d.sound_threshold_db)}%`;
      row.querySelector('.s-val').textContent = inp.levelDb == null ? '—' : `${Math.round(inp.levelDb)} dB${ignored ? '' : loud ? ' · sound' : ' · quiet'}`;
      row.classList.toggle('loud', loud && !ignored); row.classList.toggle('ignored', ignored);
    });
    const conn = r.getElementById('s-conn');
    if (conn) {
      const paused = s.paused === true, last = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : 'never';
      conn.innerHTML = `<strong>ClearOne ${esc(s.device.host)}</strong> · ${s.status === 'ready' ? 'connected' : esc(s.status)}<br>
        <span class="s-help">Firmware ${esc(s.device.firmware ?? '?')} · last full read ${esc(last)}${s.error ? ' · ' + esc(s.error) : ''}</span>`;
      const pause = r.getElementById('s-pause');
      pause.textContent = paused ? 'Resume communication' : 'Pause communication';
      pause.onclick = () => this._call('connection', {action: paused ? 'resume' : 'pause'}, 'connection');
      r.getElementById('s-reconnect').hidden = paused;
      pause.disabled = r.getElementById('s-reconnect').disabled = !!this._pending;
    }
  }
}

customElements.define('clearone-multiroom-panel', ClearOneMultiroomPanel);
