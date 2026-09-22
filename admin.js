'use strict';
// Elders' Forge v3 - owner-only control panel client.
// Auth: ADMIN_KEY sent as X-Admin-Key on every request (also ?key= fallback).
const KEYSTORE = 'forge_key';
let KEY = sessionStorage.getItem(KEYSTORE) || '';
let CFG = {};            // effective config
let OVERRIDE = {};       // current override
let BOTU = '';
let CUR = 'dash';        // active tab
let DASH = {};           // last dashboard payload
let USERQ = '';          // kin search query
let IDLE_TIMER = null;
const IDLE_MS = 20 * 60 * 1000; // auto-lock after 20 min idle

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
function fmt(n) { n = Number(n || 0); return n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : '' + n; }
let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 2600);
}

// ---- session hardening: idle auto-lock -----------------------------------
function bumpIdle() {
  clearTimeout(IDLE_TIMER);
  IDLE_TIMER = setTimeout(() => { toast('Locked after inactivity', 1); lock(); }, IDLE_MS);
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
  clearTimeout(IDLE_TIMER);
  $('#panel').classList.add('hidden'); $('#gate').classList.remove('hidden');
  $('#gateMsg').textContent = ''; $('#keyInput').value = '';
}

async function loadConfig() {
  const d = await api('/api/admin/config');
  CFG = d.config || {}; OVERRIDE = d.override || {}; BOTU = d.bot_username || '';
}
// patch helper: send a nested override patch and refresh CFG
async function patch(obj) {
  const d = await api('/api/admin/config', 'POST', { patch: obj });
  CFG = d.config || CFG; toast('Saved'); return d;
}
let OVER = {};            // overview snapshot (tribes)

// ---- boot / tabs ----------------------------------------------------------
async function boot() {
  $('#authTag').textContent = KEY ? 'key auth' : 'telegram';
  bumpIdle();
  await refresh();
}
async function refresh() {
  await loadConfig();
  try { OVER = await api('/api/admin/overview'); } catch (e) { OVER = {}; }
  render(CUR);
  toast('Loaded');
}
const RENDERERS = {
  dash: renderDash, world: renderWorld, economy: renderEconomy, tasks: renderTasks,
  store: renderStore, lands: renderLands, tribes: renderTribes, broadcast: renderBroadcast,
  airdrop: renderAirdrop, system: renderSystem, audit: renderAudit, raw: renderRaw,
};
function render(t) { const fn = RENDERERS[t]; if (!fn) return; try { const p = fn(); if (p && p.catch) p.catch(e => toast(e.message, 1)); } catch (e) { toast(e.message, 1); } }
function showTab(t) {
  CUR = t;
  document.querySelectorAll('.ftab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.fview').forEach(v => v.classList.toggle('on', v.id === 'v-' + t));
  render(t);
}
function setMaintTag(on) {
  const t = $('#maintTag'); if (!t) return;
  t.textContent = on ? 'MAINTENANCE ON' : '';
  t.className = on ? 'pill bad' : '';
}

// ---- generic UI helpers ---------------------------------------------------
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
function textField(label, val) {
  const w = el('label', 'fnum'); w.appendChild(el('span', null, label));
  const i = el('input'); i.value = val == null ? '' : val; w.appendChild(i);
  return { w, get: () => i.value.trim() };
}
function stateTag(st) {
  const cls = st === 'active' ? 'ok' : (st === 'cooling' ? 'warn' : 'bad');
  return '<span class="tag ' + cls + '">' + esc(st || '?') + '</span>';
}
// ---- DASHBOARD ------------------------------------------------------------
async function renderDash() {
  const v = $('#v-dash'); v.innerHTML = '';
  v.appendChild(el('p', 'muted', 'Loading health metrics\u2026'));
  const d = await api('/api/admin/dashboard');
  DASH = d; setMaintTag(d.maintenance);
  v.innerHTML = '';
  const c = card('World at a glance', 'Age: ' + esc(d.age || '\u2014') + (d.dev_mode ? '  \u00b7  DEV MODE (no bot token)' : ''));
  const grid = el('div', 'stat-grid');
  const stats = [
    ['Total kin', d.total_users], ['DAU', d.dau], ['WAU', d.wau], ['New today', d.new_today],
    ['Active', d.active], ['Cooling', d.cooling], ['Fading', d.fading],
    ['Tribes', d.tribe_count], ['Lands held', d.lands_held],
    ['Wallets bound', d.wallets_bound], ['Banned', d.banned], ['Flagged', d.flagged],
    ['Total Ember', fmt(d.total_ember)], ['Total Loyalty', fmt(d.total_loyalty)],
    ['\u2b50 Revenue', d.stars_revenue], ['Purchases', d.purchases],
  ];
  stats.forEach(([l, n]) => {
    const s = el('div', 'stat'); s.appendChild(el('div', 'n', String(n == null ? 0 : n)));
    s.appendChild(el('div', 'l', l)); grid.appendChild(s);
  });
  c.appendChild(grid); v.appendChild(c);

  // 14-day signups sparkline
  const cs = card('Signups \u00b7 last 14 days', '');
  const series = d.signups_14d || [];
  const max = Math.max(1, ...series.map(x => x.signups));
  const bars = el('div', 'bars');
  series.forEach(x => {
    const b = el('div', 'bar'); b.style.height = Math.round(100 * x.signups / max) + '%';
    b.title = x.day + ': ' + x.signups; bars.appendChild(b);
  });
  cs.appendChild(bars);
  cs.appendChild(el('div', 'muted-sm', (series[0] ? series[0].day : '') + '  \u2192  ' + (series.length ? series[series.length - 1].day : '')));
  v.appendChild(cs);
}
// ---- WORLD (ages, ranks, ladder, elders) ----------------------------------
function renderWorld() {
  const v = $('#v-world'); v.innerHTML = '';
  const age = (CFG.age || {}); const cur = age.current; const ages = age.ages || {};

  // current age
  const c1 = card('Current Age', 'Switch the world era. Each age changes palette, tone and decay rate.');
  const row = el('div', 'field-row');
  const sel = el('select');
  Object.keys(ages).forEach(k => {
    const o = el('option', null, (ages[k].name || k) + (k === cur ? ' \u2022 active' : ''));
    o.value = k; if (k === cur) o.selected = true; sel.appendChild(o);
  });
  row.append(sel, btn('Set Age', 'primary', async () => {
    try { await api('/api/admin/age', 'POST', { age: sel.value }); toast('Age set'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  c1.appendChild(row); v.appendChild(c1);

  // ages editor
  const c2 = card('Ages editor', 'Create or retune eras. Palette = comma-separated hex colors.');
  Object.keys(ages).forEach(k => {
    const a = ages[k]; const rw = el('div', 'lrow');
    rw.appendChild(el('div', 'lmain', esc(a.name || k) + '  \u00b7  ' + esc(k) + '  \u00b7  decay ' + (a.decay_multiplier != null ? a.decay_multiplier : 1)));
    const acts = el('div', 'lacts');
    acts.append(
      btn('Edit', 'ghost', () => ageForm(k, a)),
      btn('Remove', 'danger', async () => { if (k === cur) { toast('Cannot remove the active age', 1); return; } if (!confirm('Remove age ' + k + '?')) return; try { await api('/api/admin/ages', 'POST', { op: 'remove', id: k }); toast('Removed'); await refresh(); } catch (e) { toast(e.message, 1); } })
    );
    rw.appendChild(acts); c2.appendChild(rw);
  });
  c2.appendChild(btn('+ New age', 'primary', () => ageForm('', { name: '', tagline: '', decay_multiplier: 1, invade_cost_multiplier: 1, palette: '#ff5a3c,#ffb020,#3ce0c8' })));
  v.appendChild(c2);

  // ranks + ladder JSON editors
  jsonListCard(v, 'Rank ladder', 'Tiers by percentile (min_pct 0..1). Kin rank badges.',
    CFG.ranks || [], async (arr) => api('/api/admin/ranks', 'POST', { ranks: arr }));
  jsonListCard(v, 'Settlement ladder', 'Tribe growth stages: level, stage, max_members, invites_per_day, cost.',
    CFG.settlement_ladder || [], async (arr) => api('/api/admin/ladder', 'POST', { ladder: arr }));

  // elders / admins
  const adm = CFG.admin || {};
  const c5 = card('Elders (Forge access)', 'Telegram usernames / user IDs allowed to open the Forge in-app. One per line.');
  const g = el('div', 'fgrid');
  const uw = el('label', 'fnum'); uw.appendChild(el('span', null, 'usernames'));
  const ta1 = el('textarea', 'raw-json'); ta1.rows = 5; ta1.value = (adm.usernames || []).join('\n'); uw.appendChild(ta1);
  const iw = el('label', 'fnum'); iw.appendChild(el('span', null, 'user_ids'));
  const ta2 = el('textarea', 'raw-json'); ta2.rows = 5; ta2.value = (adm.user_ids || []).join('\n'); iw.appendChild(ta2);
  g.append(uw, iw); c5.appendChild(g);
  c5.appendChild(btn('Save elders', 'primary', async () => {
    const usernames = ta1.value.split('\n').map(s => s.trim()).filter(Boolean);
    const user_ids = ta2.value.split('\n').map(s => s.trim()).filter(Boolean);
    try { await api('/api/admin/admins', 'POST', { usernames, user_ids }); toast('Saved'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  v.appendChild(c5);
}
function ageForm(id, a) {
  const v = $('#v-world');
  const c = card(id ? 'Edit age' : 'New age', 'id is the unique era key.');
  const grid = el('div', 'fgrid');
  const pal = Array.isArray(a.palette) ? a.palette.join(',') : (a.palette || '');
  const fId = textField('id', id), fN = textField('name', a.name), fT = textField('tagline', a.tagline),
    fD = textField('decay_multiplier', a.decay_multiplier), fI = textField('invade_cost_multiplier', a.invade_cost_multiplier),
    fP = textField('palette (hex,hex,\u2026)', pal);
  grid.append(fId.w, fN.w, fT.w, fD.w, fI.w, fP.w); c.appendChild(grid);
  c.appendChild(btn('Save age', 'primary', async () => {
    const ageObj = { id: fId.get(), name: fN.get(), tagline: fT.get(),
      decay_multiplier: parseFloat(fD.get() || '1') || 1, invade_cost_multiplier: parseFloat(fI.get() || '1') || 1, palette: fP.get() };
    if (!ageObj.id || !ageObj.name) { toast('id + name required', 1); return; }
    try { await api('/api/admin/ages', 'POST', { op: 'edit', age: ageObj }); toast('Saved'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  v.prepend(c);
}
function jsonListCard(v, title, sub, arr, saveFn) {
  const c = card(title, sub + '  \u2014  edit as JSON array.');
  const ta = el('textarea', 'raw-json'); ta.rows = Math.min(20, Math.max(6, arr.length + 3));
  ta.value = JSON.stringify(arr, null, 2); c.appendChild(ta);
  c.appendChild(btn('Save ' + title, 'primary', async () => {
    let parsed; try { parsed = JSON.parse(ta.value || '[]'); } catch (e) { toast('Invalid JSON', 1); return; }
    if (!Array.isArray(parsed) || !parsed.length) { toast('Must be a non-empty array', 1); return; }
    try { await saveFn(parsed); toast('Saved'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  v.appendChild(c);
}
// ---- ECONOMY --------------------------------------------------------------
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
      if (val && typeof val === 'object') return;
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
// ---- LANDS ----------------------------------------------------------------
async function renderLands() {
  const v = $('#v-lands'); v.innerHTML = '';
  v.appendChild(el('p', 'muted', 'Loading lands\u2026'));
  const r = await api('/api/admin/lands', 'POST', { op: 'resolve' });
  const lands = r.lands || [];
  const tribes = OVER.tribes || [];
  v.innerHTML = '';
  const head = card('Lands map', 'Resolve settles any expired contests. Operate each territory below.');
  head.appendChild(btn('Resolve contests now', 'ghost', async () => { try { await api('/api/admin/lands', 'POST', { op: 'resolve' }); toast('Resolved'); await renderLands(); } catch (e) { toast(e.message, 1); } }));
  v.appendChild(head);

  lands.forEach(l => {
    const c = card(l.name || l.land_id, (l.owner ? 'Held by ' + esc(l.owner_name || l.owner) + ' (' + l.staked + ' staked)' : 'Unclaimed') + (l.contested ? '  \u00b7  CONTESTED by ' + esc(l.attacker_name || l.attacker) : ''));
    const g1 = el('div', 'field-row');
    const fN = textField('rename', l.name);
    g1.append(fN.w, btn('Rename', 'ghost', async () => { try { await api('/api/admin/lands', 'POST', { op: 'rename', land_id: l.land_id, name: fN.get() }); toast('Renamed'); await renderLands(); } catch (e) { toast(e.message, 1); } }));

    const g2 = el('div', 'field-row');
    const sel = el('select');
    sel.appendChild(new Option('\u2014 unclaimed \u2014', ''));
    tribes.forEach(t => { const o = new Option(t.name, t.tribe_id); if (t.tribe_id === l.owner) o.selected = true; sel.add(o); });
    const fS = fieldNum('staked', l.staked);
    g2.append(sel, fS, btn('Set owner', 'primary', async () => { try { await api('/api/admin/lands', 'POST', { op: 'set_owner', land_id: l.land_id, owner_tribe: sel.value, staked: parseInt(fS._input.value || '0', 10) || 0 }); toast('Owner set'); await renderLands(); } catch (e) { toast(e.message, 1); } }));

    const g3 = el('div', 'field-row');
    g3.append(
      btn('Reset contest', 'ghost', async () => { try { await api('/api/admin/lands', 'POST', { op: 'reset_contest', land_id: l.land_id }); toast('Contest cleared'); await renderLands(); } catch (e) { toast(e.message, 1); } }),
      btn('Clear cooldown', 'ghost', async () => { try { await api('/api/admin/lands', 'POST', { op: 'clear_cooldown', land_id: l.land_id }); toast('Cooldown cleared'); await renderLands(); } catch (e) { toast(e.message, 1); } })
    );
    c.append(g1, g2, g3); v.appendChild(c);
  });
}
// ---- TRIBES & KIN ---------------------------------------------------------
function renderTribes() {
  const v = $('#v-tribes'); v.innerHTML = '';
  const tribes = OVER.tribes || [];

  const ct = card('Tribes', 'Live tribes. Adjust the pool, retune, set a chief, view roster, or disband.');
  tribes.forEach(t => {
    const row = el('div', 'lrow col');
    row.appendChild(el('div', 'lmain', esc(t.name) + '  \u00b7  L' + t.level + '  \u00b7  ' + t.members + ' kin  \u00b7  ' + t.loyalty + ' Loyalty  \u00b7  ' + t.embertide + ' Embertide' + (t.chief_id ? '  \u00b7  chief ' + esc(t.chief_id) : '')));
    const g = el('div', 'field-row');
    const fL = fieldNum('+/- Loyalty', 0), fE = fieldNum('+/- Embertide', 0);
    g.append(fL, fE, btn('Grant', 'primary', async () => {
      try { await api('/api/admin/grant', 'POST', { tribe_id: t.tribe_id, loyalty: parseInt(fL._input.value || '0', 10) || 0, embertide: parseInt(fE._input.value || '0', 10) || 0 }); toast('Granted'); await refresh(); } catch (e) { toast(e.message, 1); }
    }));
    const g2 = el('div', 'field-row');
    const fN = textField('rename', t.name), fLv = fieldNum('level', t.level), fCh = textField('chief user_id', t.chief_id || '');
    g2.append(fN.w, fLv, btn('Update', 'ghost', async () => {
      const p = { tribe_id: t.tribe_id, name: fN.get(), level: parseInt(fLv._input.value || t.level, 10) };
      if (fCh.get()) p.chief_id = fCh.get();
      try { await api('/api/admin/tribe', 'POST', p); toast('Updated'); await refresh(); } catch (e) { toast(e.message, 1); }
    }), btn('Roster', 'ghost', () => showRoster(t, row)),
      btn('Disband', 'danger', async () => { if (!confirm('Disband ' + t.name + '? Kin become wanderers.')) return; try { await api('/api/admin/tribe', 'POST', { tribe_id: t.tribe_id, op: 'disband' }); toast('Disbanded'); await refresh(); } catch (e) { toast(e.message, 1); } }));
    row.append(g, g2); ct.appendChild(row);
  });
  v.appendChild(ct);

  // kin search + moderation
  const cu = card('Kin \u00b7 search & moderate', 'Search by name, @username, id or wallet. Ban, flag, reset, delete, move or title any kin.');
  const bar = el('div', 'searchbar');
  const inp = el('input'); inp.placeholder = 'Search kin\u2026'; inp.value = USERQ;
  bar.append(inp, btn('Search', 'primary', () => { USERQ = inp.value.trim(); loadKin(cu, list); }));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { USERQ = inp.value.trim(); loadKin(cu, list); } });
  cu.appendChild(bar);
  const list = el('div'); cu.appendChild(list);
  v.appendChild(cu);
  loadKin(cu, list);
}
async function loadKin(card_, list) {
  list.innerHTML = ''; list.appendChild(el('p', 'muted', 'Loading kin\u2026'));
  const d = await api('/api/admin/users?limit=50&q=' + encodeURIComponent(USERQ));
  list.innerHTML = '';
  list.appendChild(el('div', 'muted-sm', d.total + ' matched \u00b7 showing ' + d.users.length));
  d.users.forEach(u => list.appendChild(kinRow(u, card_, list)));
}
function kinRow(u, card_, list) {
  const row = el('div', 'lrow col');
  const label = esc(u.name) + (u.username ? ' @' + esc(u.username) : '') + '  \u00b7  ' + u.kindle + ' K  \u00b7  ' + u.ember + ' E  \u00b7  ' + (u.tribe_id || 'no tribe');
  const main = el('div', 'lmain'); main.innerHTML = label + ' ' + stateTag(u.state) + (u.banned ? '<span class="tag bad">banned</span>' : '') + (u.flagged ? '<span class="tag warn">flagged</span>' : '') + (u.wallet ? '<span class="tag">wallet</span>' : '');
  row.appendChild(main);
  const act = el('div', 'row-wrap');
  const op = async (o, extra) => { try { await api('/api/admin/user', 'POST', Object.assign({ user_id: u.user_id, op: o }, extra || {})); toast(o + ' \u2713'); await loadKin(card_, list); } catch (e) { toast(e.message, 1); } };
  act.append(
    btn(u.banned ? 'Unban' : 'Ban', u.banned ? 'ghost' : 'danger', () => { if (u.banned || confirm('Ban ' + u.name + '?')) op(u.banned ? 'unban' : 'ban'); }),
    btn(u.flagged ? 'Unflag' : 'Flag', 'ghost', () => op(u.flagged ? 'unflag' : 'flag')),
    btn('Reset', 'ghost', () => { if (confirm('Reset all progress for ' + u.name + '?')) op('reset'); }),
    btn('Delete', 'danger', () => { if (confirm('Permanently DELETE ' + u.name + '? This cannot be undone.')) op('delete'); })
  );
  const fT = textField('set title', u.title || ''), fMv = textField('move to tribe_id', u.tribe_id || '');
  act.append(
    btn('Title', 'ghost', () => op('set_title', { title: fT.get() })), fT.w,
    btn('Move', 'ghost', () => op('set_tribe', { tribe_id: fMv.get() })), fMv.w
  );
  row.appendChild(act);
  return row;
}
async function showRoster(t, anchor) {
  const d = await api('/api/admin/tribe_roster?tribe_id=' + encodeURIComponent(t.tribe_id));
  const box = el('div', 'fcard');
  box.appendChild(el('h3', null, 'Roster \u00b7 ' + esc(t.name)));
  const chiefRow = el('div', 'field-row');
  const sel = el('select');
  d.roster.forEach(u => { const o = new Option((u.name || u.user_id) + (u.username ? ' @' + u.username : ''), u.user_id); if (u.user_id === d.chief_id) o.selected = true; sel.add(o); });
  chiefRow.append(el('span', 'muted', 'Chief:'), sel, btn('Set chief', 'primary', async () => { try { await api('/api/admin/tribe', 'POST', { tribe_id: t.tribe_id, chief_id: sel.value }); toast('Chief set'); await refresh(); } catch (e) { toast(e.message, 1); } }));
  box.appendChild(chiefRow);
  const tbl = el('table', 'ftable');
  tbl.innerHTML = '<tr><th>Kin</th><th>Kindle</th><th>Ember</th><th>State</th></tr>';
  d.roster.forEach(u => { const tr = el('tr'); tr.innerHTML = '<td>' + esc(u.name) + (u.username ? ' @' + esc(u.username) : '') + (u.user_id === d.chief_id ? ' \u2605' : '') + '</td><td>' + u.kindle + '</td><td>' + u.ember + '</td><td>' + stateTag(u.state) + '</td>'; tbl.appendChild(tr); });
  box.appendChild(tbl);
  anchor.appendChild(box);
}
// ---- BROADCAST ------------------------------------------------------------
function renderBroadcast() {
  const v = $('#v-broadcast'); v.innerHTML = '';
  const c = card('Broadcast', 'Send a Telegram message to kin. HTML allowed. Rate-limited & 429-aware. Requires a bot token (not DEV mode).');
  const tgtRow = el('div', 'field-row');
  const sel = el('select');
  sel.add(new Option('Everyone', 'all'));
  sel.add(new Option('Active kin', 'state:active'));
  sel.add(new Option('Cooling kin', 'state:cooling'));
  sel.add(new Option('Fading kin', 'state:fading'));
  (OVER.tribes || []).forEach(t => sel.add(new Option('Tribe: ' + t.name, 'tribe:' + t.tribe_id)));
  tgtRow.append(el('span', 'muted', 'Target:'), sel); c.appendChild(tgtRow);
  const ta = el('textarea', 'bcast'); ta.rows = 6; ta.placeholder = 'Your message to the kin\u2026 (HTML allowed)'; c.appendChild(ta);
  const out = el('div', 'muted-sm'); 
  const row = el('div', 'field-row');
  row.append(
    btn('Dry run (count only)', 'ghost', async () => { if (!ta.value.trim()) { toast('Write a message', 1); return; } try { const r = await api('/api/admin/broadcast', 'POST', { target: sel.value, text: ta.value, dry_run: true }); out.textContent = 'Would reach ' + r.would_send + ' kin (' + r.target + ').'; } catch (e) { toast(e.message, 1); } }),
    btn('Send broadcast', 'danger', async () => { if (!ta.value.trim()) { toast('Write a message', 1); return; } if (!confirm('Send this message now?')) return; out.textContent = 'Sending\u2026'; try { const r = await api('/api/admin/broadcast', 'POST', { target: sel.value, text: ta.value }); out.textContent = 'Sent ' + r.sent + ' \u00b7 failed ' + r.failed + ' \u00b7 total ' + r.total; toast('Broadcast done'); } catch (e) { out.textContent = ''; toast(e.message, 1); } })
  );
  c.append(row, out); v.appendChild(c);
}

// ---- AIRDROP --------------------------------------------------------------
async function renderAirdrop() {
  const v = $('#v-airdrop'); v.innerHTML = '';
  v.appendChild(el('p', 'muted', 'Computing allocations\u2026'));
  const d = await api('/api/admin/snapshot');
  v.innerHTML = '';
  const c = card('Airdrop allocations', 'Transparent formula: (Kindle + Ember) \u00d7 tribe multiplier (1\u00d7\u20132\u00d7 by avg Loyalty/member). Banned kin excluded.');
  c.appendChild(el('div', 'muted-sm', d.count + ' eligible kin \u00b7 ' + d.with_wallet + ' with a wallet' + (d.last_snapshot && d.last_snapshot.ts ? '  \u00b7  last frozen: ' + esc(d.last_snapshot.ts) + ' (' + d.last_snapshot.count + ')' : '  \u00b7  no frozen snapshot yet')));
  const row = el('div', 'field-row');
  row.append(
    btn('Freeze snapshot', 'primary', async () => { if (!confirm('Freeze the current allocation as the official snapshot?')) return; try { const r = await api('/api/admin/snapshot', 'POST', {}); toast('Frozen: ' + r.count + ' kin'); await renderAirdrop(); } catch (e) { toast(e.message, 1); } }),
    btn('Download CSV', 'ghost', downloadSnapshotCsv)
  );
  c.appendChild(row);
  const tbl = el('table', 'ftable');
  tbl.innerHTML = '<tr><th>#</th><th>Kin</th><th>Tribe</th><th>Wallet</th><th>Points</th><th>%</th></tr>';
  (d.preview || []).forEach((r, i) => {
    const tr = el('tr');
    tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + esc(r.name) + (r.username ? ' @' + esc(r.username) : '') + '</td><td>' + esc(r.tribe_id || '\u2014') + '</td><td>' + (r.wallet ? esc(r.wallet.slice(0, 6) + '\u2026' + r.wallet.slice(-4)) : '<span class="muted-sm">none</span>') + '</td><td>' + r.points + '</td><td>' + r.allocation_pct + '%</td>';
    tbl.appendChild(tr);
  });
  c.appendChild(tbl); v.appendChild(c);
}
async function downloadSnapshotCsv() {
  try {
    const r = await fetch('/api/admin/snapshot.csv', { headers: hdrs() });
    if (!r.ok) { toast('Freeze a snapshot first', 1); return; }
    const blob = await r.blob(); const url = URL.createObjectURL(blob);
    const a = el('a'); a.href = url; a.download = 'tribes_snapshot.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast(e.message, 1); }
}

// ---- AUDIT ----------------------------------------------------------------
async function renderAudit() {
  const v = $('#v-audit'); v.innerHTML = '';
  v.appendChild(el('p', 'muted', 'Loading audit log\u2026'));
  const d = await api('/api/admin/audit');
  v.innerHTML = '';
  const c = card('Audit log', 'Last 200 owner actions.');
  const tbl = el('table', 'ftable');
  tbl.innerHTML = '<tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr>';
  (d.audit || []).forEach(a => { const tr = el('tr'); tr.innerHTML = '<td>' + esc(a.ts) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.detail || '') + '</td>'; tbl.appendChild(tr); });
  if (!(d.audit || []).length) c.appendChild(el('p', 'muted', 'No actions logged yet.'));
  else c.appendChild(tbl);
  v.appendChild(c);
}

// ---- RAW CONFIG -----------------------------------------------------------
function renderRaw() {
  const v = $('#v-raw'); v.innerHTML = '';
  const c = card('Raw override (advanced)', 'Deep-merged onto file defaults. Paste a JSON patch; only the keys you include change.');
  const ta = el('textarea', 'raw-json'); ta.rows = 18; ta.value = JSON.stringify(OVERRIDE, null, 2);
  c.appendChild(ta);
  const row = el('div', 'field-row');
  row.append(
    btn('Apply patch', 'primary', async () => { let obj; try { obj = JSON.parse(ta.value || '{}'); } catch (e) { toast('Invalid JSON', 1); return; } try { await patch(obj); await refresh(); } catch (e) { toast(e.message, 1); } }),
    btn('Show effective config', 'ghost', () => { ta.value = JSON.stringify(CFG, null, 2); })
  );
  c.appendChild(row); v.appendChild(c);
}
// ---- SYSTEM ---------------------------------------------------------------
async function renderSystem() {
  const v = $('#v-system'); v.innerHTML = '';
  try { DASH = await api('/api/admin/dashboard'); setMaintTag(DASH.maintenance); } catch (e) {}

  // maintenance
  const cm = card('Maintenance mode', 'When on, the game API returns 503 to all kin (owner + Telegram webhook stay live).');
  const mrow = el('div', 'field-row');
  const on = !!(DASH && DASH.maintenance);
  const msg = textField('message shown to kin', 'The forge is being retuned. Back soon.');
  mrow.append(
    btn(on ? 'Turn OFF' : 'Turn ON', on ? 'ghost' : 'danger', async () => { try { const r = await api('/api/admin/maintenance', 'POST', { on: !on, message: msg.get() }); setMaintTag(r.maintenance.on); toast('Maintenance ' + (r.maintenance.on ? 'ON' : 'OFF')); await renderSystem(); } catch (e) { toast(e.message, 1); } }),
    msg.w
  );
  cm.appendChild(el('div', 'muted-sm', 'Currently: ' + (on ? 'ON' : 'off'))); cm.appendChild(mrow); v.appendChild(cm);

  // world one-offs
  const co = card('World actions', 'One-off maintenance operations.');
  const g = el('div', 'field-row');
  g.append(
    btn('Run Ashfall now', 'ghost', async () => { try { const r = await api('/api/admin/ashfall', 'POST', {}); toast('Ashfall: ' + (r.ran ? (r.changed || []).length + ' tribes' : 'already ran')); await refresh(); } catch (e) { toast(e.message, 1); } }),
    btn('Reset ALL overrides', 'danger', async () => { if (!confirm('Reset every custom tweak back to file defaults?')) return; try { await api('/api/admin/config/reset', 'POST', {}); toast('Reset to defaults'); await refresh(); } catch (e) { toast(e.message, 1); } })
  );
  co.appendChild(g); v.appendChild(co);

  // bot username
  const cb = card('Bot username', 'Used to build referral / launch links (without @).');
  const r3 = el('div', 'field-row');
  const inp = el('input'); inp.value = BOTU; inp.placeholder = 'my_tribes_bot';
  r3.append(inp, btn('Save', 'primary', async () => { try { const d = await api('/api/admin/bot_username', 'POST', { bot_username: inp.value }); BOTU = d.bot_username; toast('Saved'); } catch (e) { toast(e.message, 1); } }));
  cb.appendChild(r3); v.appendChild(cb);

  // config versioning
  const cv = card('Config versions', 'Save a labeled snapshot of the current overrides, roll back anytime.');
  const sv = el('div', 'field-row');
  const lbl = textField('label', '');
  sv.append(lbl.w, btn('Save version', 'primary', async () => { try { await api('/api/admin/config/save', 'POST', { label: lbl.get() }); toast('Version saved'); await renderSystem(); } catch (e) { toast(e.message, 1); } }));
  cv.appendChild(sv);
  try {
    const d = await api('/api/admin/config/versions');
    (d.versions || []).forEach((ver, i) => {
      const rw = el('div', 'lrow');
      rw.appendChild(el('div', 'lmain', esc(ver.label) + '  \u00b7  ' + esc(ver.ts)));
      const acts = el('div', 'lacts');
      acts.append(btn('Roll back', 'ghost', async () => { if (!confirm('Roll back overrides to "' + ver.label + '"?')) return; try { await api('/api/admin/config/rollback', 'POST', { index: i }); toast('Rolled back'); await refresh(); } catch (e) { toast(e.message, 1); } }));
      rw.appendChild(acts); cv.appendChild(rw);
    });
    if (!(d.versions || []).length) cv.appendChild(el('p', 'muted', 'No versions saved yet.'));
  } catch (e) {}
  v.appendChild(cv);

  // season reset
  const cs = card('Season reset', 'DANGER: archives standings, then zeroes all Kindle/Ember/Loyalty/lands for a fresh season.');
  cs.appendChild(btn('Reset season\u2026', 'danger', async () => {
    if (!confirm('Archive standings and WIPE all progress for a new season?')) return;
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
    try { const r = await api('/api/admin/season/reset', 'POST', { confirm: true }); toast('Season reset \u00b7 ' + r.archived + ' tribes archived'); await refresh(); } catch (e) { toast(e.message, 1); }
  }));
  v.appendChild(cs);
}

// ---- wire -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  $('#unlockBtn').addEventListener('click', unlock);
  $('#keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  $('#lockBtn').addEventListener('click', lock);
  $('#refreshBtn').addEventListener('click', () => refresh().catch(e => toast(e.message, 1)));
  document.querySelectorAll('.ftab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.t)));
  ['click', 'keydown', 'mousemove'].forEach(ev => document.addEventListener(ev, () => { if (KEY || !$('#panel').classList.contains('hidden')) bumpIdle(); }, { passive: true }));
  if (KEY) { loadConfig().then(() => { $('#gate').classList.add('hidden'); $('#panel').classList.remove('hidden'); return boot(); }).catch(() => { /* stay on gate */ }); }
});

