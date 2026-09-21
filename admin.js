'use strict';
// Elders' Forge - owner-only control panel client.
// Auth: ADMIN_KEY sent as X-Admin-Key on every request (also ?key= fallback).
const KEYSTORE = 'forge_key';
let KEY = sessionStorage.getItem(KEYSTORE) || '';
let CFG = {};            // effective config
let OVERRIDE = {};       // current override
let OVER = {};           // live snapshot
let BOTU = '';

function hdrs() {
  const h = { 'Content-Type': 'application/json' };
  if (KEY) h['X-Admin-Key'] = KEY;
  return h;
}
async function api(path, method, body) {
  const r = await fetch(path, {
    method: method || 'GET', headers: hdrs(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 403 || r.status === 401) { throw new Error('unauthorized'); }
  const txt = await r.text();
  let data = {}; try { data = txt ? JSON.parse(txt) : {}; } catch (e) {}
  if (!r.ok) throw new Error(data.detail || ('error ' + r.status));
  return data;
}
function $(s, r) { return (r || document).querySelector(s); }
function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 2600);
}

// ---- gate -----------------------------------------------------------------
async function unlock() {
  KEY = $('#keyInput').value.trim();
  $('#gateMsg').textContent = 'Unsealing\u2026';
  try {
    await loadConfig();
    sessionStorage.setItem(KEYSTORE, KEY);
    $('#gate').classList.add('hidden');
    $('#panel').classList.remove('hidden');
    await boot();
  } catch (e) {
    $('#gateMsg').textContent = e.message === 'unauthorized' ? 'Wrong key \u2013 the forge stays sealed.' : e.message;
  }
}
function lock() {
  sessionStorage.removeItem(KEYSTORE); KEY = '';
  $('#panel').classList.add('hidden'); $('#gate').classList.remove('hidden');
  $('#gateMsg').textContent = ''; $('#keyInput').value = '';
}

async function loadConfig() {
  const d = await api('/api/admin/config');
  CFG = d.config || {}; OVERRIDE = d.override || {}; BOTU = d.bot_username || '';
}

// patch helper: send a nested override patch and refresh
async function patch(obj) {
  const d = await api('/api/admin/config', 'POST', { patch: obj });
  CFG = d.config || CFG; toast('Saved'); return d;
}

// __MORE__

// ---- boot / tabs ----------------------------------------------------------
async function boot() {
  $('#authTag').textContent = KEY ? 'key auth' : 'telegram';
  await refresh();
}
async function refresh() {
  await loadConfig();
  try { OVER = await api('/api/admin/overview'); } catch (e) { OVER = {}; }
  renderAll();
  toast('Loaded');
}
function renderAll() {
  renderWorld(); renderEconomy(); renderTasks(); renderStore(); renderTribes(); renderRaw();
}
function showTab(t) {
  document.querySelectorAll('.ftab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.fview').forEach(v => v.classList.toggle('on', v.id === 'v-' + t));
}

// ---- WORLD ----------------------------------------------------------------
function renderWorld() {
  const v = $('#v-world'); v.innerHTML = '';
  const age = (CFG.age || {}); const cur = age.current; const ages = age.ages || {};
  const c1 = card('Current Age', 'Switch the world era. Each age changes palette, tone and decay rate.');
  const row = el('div', 'field-row');
  const sel = el('select'); sel.id = 'ageSel';
  Object.keys(ages).forEach(k => {
    const o = el('option', null, (ages[k].name || k) + (k === cur ? ' \u2022 active' : ''));
    o.value = k; if (k === cur) o.selected = true; sel.appendChild(o);
  });
  const b = btn('Set Age', 'primary', async () => {
    try { await api('/api/admin/age', 'POST', { age: sel.value }); toast('Age set'); await refresh(); }
    catch (e) { toast(e.message, 1); }
  });
  row.append(sel, b); c1.appendChild(row); v.appendChild(c1);

  const c2 = card('Maintenance', 'One-off world actions.');
  const g = el('div', 'field-row');
  g.append(
    btn('Run Ashfall now', 'ghost', async () => { try { const r = await api('/api/admin/ashfall', 'POST', {}); toast('Ashfall: ' + (r.ran ? (r.changed || []).length + ' tribes' : 'already ran')); await refresh(); } catch (e) { toast(e.message, 1); } }),
    btn('Reset ALL overrides', 'danger', async () => { if (!confirm('Reset every custom tweak back to file defaults?')) return; try { await api('/api/admin/config/reset', 'POST', {}); toast('Reset to defaults'); await refresh(); } catch (e) { toast(e.message, 1); } })
  );
  c2.appendChild(g); v.appendChild(c2);

  const c3 = card('Bot username', 'Used to build referral / launch links (without @).');
  const r3 = el('div', 'field-row');
  const inp = el('input'); inp.id = 'botU'; inp.value = BOTU; inp.placeholder = 'my_tribes_bot';
  r3.append(inp, btn('Save', 'primary', async () => { try { const d = await api('/api/admin/bot_username', 'POST', { bot_username: inp.value }); BOTU = d.bot_username; toast('Saved'); } catch (e) { toast(e.message, 1); } }));
  c3.appendChild(r3); v.appendChild(c3);
}

// generic UI helpers
function card(title, sub) {
  const c = el('div', 'fcard');
  c.appendChild(el('h3', null, title));
  if (sub) c.appendChild(el('p', 'muted', sub));
  return c;
}
function btn(label, kind, fn) { const b = el('button', 'btn ' + (kind || 'ghost') + ' sm', label); b.addEventListener('click', fn); return b; }
function fieldNum(label, val) {
  const w = el('label', 'fnum'); w.appendChild(el('span', null, label));
  const i = el('input'); i.type = 'number'; i.step = 'any'; i.value = (val == null ? '' : val); w.appendChild(i); w._input = i; return w;
}

// __MORE2__

// ---- ECONOMY (numeric config sections) ------------------------------------
const ECON_SECTIONS = [
  ['ember', 'Ember rewards', 'Soft currency earned from daily life.'],
  ['kindle', 'Kindle scoring', 'Personal effort score feeding tribe Loyalty.'],
  ['loyalty', 'Loyalty', 'The shared tribe pool.'],
  ['ashfall', 'Ashfall decay', 'Neglect-driven Loyalty decay.'],
  ['rekindle', 'Rekindle', 'Reviving fading kin.'],
  ['tribe', 'Tribe founding', 'Cost & gates to start a tribe (incl. Ember cost).'],
  ['referral', 'Referral / Bloodline', 'Rewards for bringing kin.'],
  ['invasion', 'Lands / Invasion', 'Embertide gains and land contests.'],
];
function renderEconomy() {
  const v = $('#v-economy'); v.innerHTML = '';
  ECON_SECTIONS.forEach(([key, title, sub]) => {
    const obj = CFG[key] || {};
    const c = card(title, sub);
    const grid = el('div', 'fgrid');
    const inputs = {};
    Object.keys(obj).forEach(k => {
      const val = obj[k];
      if (val && typeof val === 'object') return; // nested handled in Raw
      if (typeof val === 'boolean') {
        const w = el('label', 'fbool'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = val;
        w.append(cb, el('span', null, k)); grid.appendChild(w); inputs[k] = () => cb.checked;
      } else if (typeof val === 'number') {
        const f = fieldNum(k, val); grid.appendChild(f); inputs[k] = () => { const n = parseFloat(f._input.value); return isNaN(n) ? val : n; };
      } else {
        const w = el('label', 'fnum'); w.appendChild(el('span', null, k));
        const i = el('input'); i.value = val == null ? '' : val; w.appendChild(i); grid.appendChild(w); inputs[k] = () => i.value;
      }
    });
    c.appendChild(grid);
    c.appendChild(btn('Save ' + title, 'primary', async () => {
      const p = {}; Object.keys(inputs).forEach(k => { p[k] = inputs[k](); });
      try { await patch({ [key]: p }); await refresh(); } catch (e) { toast(e.message, 1); }
    }));
    v.appendChild(c);
  });
}

// ---- QUESTS ---------------------------------------------------------------
function renderTasks() {
  const v = $('#v-tasks'); v.innerHTML = '';
  const tasks = CFG.tasks || [];
  const c = card('Quests', 'Daily / weekly / once tasks that grant Ember + Kindle.');
  tasks.forEach(t => {
    const row = el('div', 'lrow');
    row.appendChild(el('div', 'lmain', (t.title || t.id) + '  \u00b7  ' + (t.repeat || 'daily') + '  \u00b7  +' + (t.reward || 0) + ' Ember'));
    const acts = el('div', 'lacts');
    acts.append(
      btn('Edit', 'ghost', () => taskForm(t)),
      btn('Remove', 'danger', async () => { if (!confirm('Remove quest ' + t.id + '?')) return; try { await api('/api/admin/tasks', 'POST', { op: 'remove', id: t.id }); toast('Removed'); await refresh(); } catch (e) { toast(e.message, 1); } })
    );
    row.appendChild(acts); c.appendChild(row);
  });
  c.appendChild(btn('+ New quest', 'primary', () => taskForm({ id: '', title: '', repeat: 'daily', reward: 20, desc: '' })));
  v.appendChild(c);
}
function taskForm(t) {
  const v = $('#v-tasks');
  const c = card(t.id ? 'Edit quest' : 'New quest', 'id is the unique key; repeat = daily | weekly | once.');
  const grid = el('div', 'fgrid');
  const fId = textField('id', t.id), fT = textField('title', t.title), fR = textField('reward', t.reward), fRep = textField('repeat', t.repeat || 'daily'), fD = textField('desc', t.desc || '');
  grid.append(fId.w, fT.w, fR.w, fRep.w, fD.w); c.appendChild(grid);
  c.appendChild(btn('Save quest', 'primary', async () => {
    const task = { id: fId.get(), title: fT.get(), reward: parseInt(fR.get() || '0', 10) || 0, repeat: fRep.get() || 'daily', desc: fD.get() };
    if (!task.id || !task.title) { toast('id + title required', 1); return; }
    try { await api('/api/admin/tasks', 'POST', { op: 'edit', task }); toast('Saved'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  v.prepend(c);
}
function textField(label, val) {
  const w = el('label', 'fnum'); w.appendChild(el('span', null, label));
  const i = el('input'); i.value = val == null ? '' : val; w.appendChild(i);
  return { w, get: () => i.value.trim() };
}

// __MORE3__

// ---- STORE ----------------------------------------------------------------
function renderStore() {
  const v = $('#v-store'); v.innerHTML = '';
  const items = (CFG.store || {}).items || [];
  const c = card('Store items', 'Cosmetic / convenience / social only. "stars" = Telegram Stars price.');
  items.forEach(it => {
    const row = el('div', 'lrow');
    row.appendChild(el('div', 'lmain', (it.title || it.id) + '  \u00b7  ' + (it.stars) + ' \u2b50  \u00b7  ' + (it.kind || '')));
    const acts = el('div', 'lacts');
    acts.append(
      btn('Edit', 'ghost', () => storeForm(it)),
      btn('Remove', 'danger', async () => { if (!confirm('Remove item ' + it.id + '?')) return; try { await api('/api/admin/store', 'POST', { op: 'remove', id: it.id }); toast('Removed'); await refresh(); } catch (e) { toast(e.message, 1); } })
    );
    row.appendChild(acts); c.appendChild(row);
  });
  c.appendChild(btn('+ New item', 'primary', () => storeForm({ id: '', title: '', stars: 50, kind: 'cosmetic_user', desc: '', section: '' })));
  v.appendChild(c);
}
function storeForm(it) {
  const v = $('#v-store');
  const c = card(it.id ? 'Edit item' : 'New item', 'kind: freeze | freeze3 | freeze7 | cosmetic_user | cosmetic_tribe | bundle | rekindle');
  const grid = el('div', 'fgrid');
  const fId = textField('id', it.id), fT = textField('title', it.title), fS = textField('stars', it.stars), fK = textField('kind', it.kind || 'cosmetic_user'), fSec = textField('section', it.section || ''), fD = textField('desc', it.desc || '');
  grid.append(fId.w, fT.w, fS.w, fK.w, fSec.w, fD.w); c.appendChild(grid);
  c.appendChild(btn('Save item', 'primary', async () => {
    const item = { id: fId.get(), title: fT.get(), stars: parseInt(fS.get() || '0', 10) || 0, kind: fK.get(), section: fSec.get(), desc: fD.get() };
    if (!item.id || !item.title) { toast('id + title required', 1); return; }
    try { await api('/api/admin/store', 'POST', { op: 'edit', item }); toast('Saved'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  v.prepend(c);
}

// ---- TRIBES & KIN ---------------------------------------------------------
function renderTribes() {
  const v = $('#v-tribes'); v.innerHTML = '';
  const tribes = OVER.tribes || []; const users = OVER.users || [];

  const ct = card('Tribes', 'Live tribes. Adjust the pool, retune, or disband.');
  tribes.forEach(t => {
    const row = el('div', 'lrow col');
    row.appendChild(el('div', 'lmain', esc(t.name) + '  \u00b7  L' + t.level + '  \u00b7  ' + t.members + ' kin  \u00b7  ' + t.loyalty + ' Loyalty  \u00b7  ' + t.embertide + ' Embertide'));
    const g = el('div', 'field-row');
    const fL = fieldNum('+/- Loyalty', 0), fE = fieldNum('+/- Embertide', 0);
    g.append(fL, fE, btn('Grant', 'primary', async () => {
      try { await api('/api/admin/grant', 'POST', { tribe_id: t.tribe_id, loyalty: parseInt(fL._input.value || '0', 10) || 0, embertide: parseInt(fE._input.value || '0', 10) || 0 }); toast('Granted'); await refresh(); } catch (e) { toast(e.message, 1); }
    }));
    const g2 = el('div', 'field-row');
    const fN = textField('rename', t.name), fLv = fieldNum('level', t.level);
    g2.append(fN.w, fLv, btn('Update', 'ghost', async () => {
      try { await api('/api/admin/tribe', 'POST', { tribe_id: t.tribe_id, name: fN.get(), level: parseInt(fLv._input.value || t.level, 10) }); toast('Updated'); await refresh(); } catch (e) { toast(e.message, 1); }
    }), btn('Disband', 'danger', async () => { if (!confirm('Disband ' + t.name + '? Kin become wanderers.')) return; try { await api('/api/admin/tribe', 'POST', { tribe_id: t.tribe_id, op: 'disband' }); toast('Disbanded'); await refresh(); } catch (e) { toast(e.message, 1); } }));
    row.append(g, g2); ct.appendChild(row);
  });
  v.appendChild(ct);

  const cu = card('Kin', 'Top explorers. Adjust Kindle / Ember directly.');
  users.slice(0, 60).forEach(u => {
    const row = el('div', 'lrow');
    row.appendChild(el('div', 'lmain', esc(u.name) + (u.username ? ' @' + esc(u.username) : '') + '  \u00b7  ' + u.kindle + ' Kindle  \u00b7  ' + u.ember + ' Ember  \u00b7  ' + (u.state || '')));
    const acts = el('div', 'field-row');
    const fK = fieldNum('+/- Kindle', 0), fE = fieldNum('+/- Ember', 0);
    acts.append(fK, fE, btn('Grant', 'primary', async () => {
      try { await api('/api/admin/grant', 'POST', { user_id: u.user_id, kindle: parseInt(fK._input.value || '0', 10) || 0, ember: parseInt(fE._input.value || '0', 10) || 0 }); toast('Granted'); await refresh(); } catch (e) { toast(e.message, 1); }
    }));
    row.appendChild(acts); cu.appendChild(row);
  });
  v.appendChild(cu);
}

// ---- RAW CONFIG -----------------------------------------------------------
function renderRaw() {
  const v = $('#v-raw'); v.innerHTML = '';
  const c = card('Raw override (advanced)', 'Deep-merged onto file defaults. Paste a JSON patch; only the keys you include change.');
  const ta = el('textarea', 'raw-json'); ta.rows = 18; ta.value = JSON.stringify(OVERRIDE, null, 2);
  c.appendChild(ta);
  const row = el('div', 'field-row');
  row.append(
    btn('Apply patch', 'primary', async () => {
      let obj; try { obj = JSON.parse(ta.value || '{}'); } catch (e) { toast('Invalid JSON', 1); return; }
      try { await patch(obj); await refresh(); } catch (e) { toast(e.message, 1); }
    }),
    btn('Show effective config', 'ghost', () => { ta.value = JSON.stringify(CFG, null, 2); })
  );
  c.appendChild(row); v.appendChild(c);
}

// ---- wire -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  $('#unlockBtn').addEventListener('click', unlock);
  $('#keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  $('#lockBtn').addEventListener('click', lock);
  $('#refreshBtn').addEventListener('click', () => refresh().catch(e => toast(e.message, 1)));
  document.querySelectorAll('.ftab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.t)));
  if (KEY) { loadConfig().then(() => { $('#gate').classList.add('hidden'); $('#panel').classList.remove('hidden'); return boot(); }).catch(() => { /* stay on gate */ }); }
});
