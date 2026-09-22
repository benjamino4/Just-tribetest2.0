/* TRIBES v3 - Liquid Glass - Telegram Mini App frontend */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor && tg.setHeaderColor('#09090b'); tg.setBackgroundColor && tg.setBackgroundColor('#09090b'); } catch(e){} }
const START_PARAM = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
const INIT = (tg && tg.initData) ? tg.initData
  : ('user_id=dev-' + Math.floor(Math.random()*9000+1000) + '&first_name=Explorer');

let STATE = null;

function hdrs(){ return { 'Content-Type':'application/json', 'X-Init-Data': INIT }; }
async function api(path, method, body){
  const opt = { method: method||'GET', headers: hdrs() };
  if (method === 'POST') opt.body = JSON.stringify(Object.assign({ initData: INIT }, body||{}));
  const r = await fetch(path, opt);
  let data = {}; try { data = await r.json(); } catch(e){}
  if (!r.ok) throw new Error(data.detail || ('error ' + r.status));
  return data;
}
function haptic(t){ try{ tg.HapticFeedback.impactOccurred(t||'light'); }catch(e){} }
function notif(t){ try{ tg.HapticFeedback.notificationOccurred(t||'success'); }catch(e){} }
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(()=>el.classList.remove('show'), 2400);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
function fmt(n){ n=Number(n||0); return n>=1000? (n/1000).toFixed(n%1000?1:0)+'k' : ''+n; }
function ic(id, cls){ return '<svg class="'+(cls||'')+'"><use href="#'+id+'"/></svg>'; }
const ART = {ward:'ic-ward',eternal:'ic-ward',crest:'ic-crest',warpaint:'ic-warpaint',
  rekindle:'ic-rekindle',cache:'ic-cache',relic:'ic-relic',star:'ic-star'};
function artIcon(a){ return ic(ART[a]||'ic-relic','art floaty'); }
const RANKIC = {ashborn:'ic-flame',emberkin:'ic-flame',flamewarden:'ic-crest',pyrarch:'ic-rank',firstflame:'ic-rank'};
function rankBadge(rk){
  if(!rk) return '';
  return '<span class="rank '+esc(rk.id)+'">'+ic(RANKIC[rk.id]||'ic-rank')+esc(rk.name)+'</span>';
}
/* number that counts up: <span class="countup" data-to="123">0</span> */
function cu(n){ return '<span class="countup" data-to="'+Number(n||0)+'">0</span>'; }

/* ---------- ember particle canvas ---------- */
(function(){
  const cv = document.getElementById('embers'), cx = cv.getContext('2d');
  let W,H,parts=[];
  function size(){ W=cv.width=innerWidth; H=cv.height=innerHeight; }
  size(); addEventListener('resize', size);
  function spawn(){ return {x:Math.random()*W, y:H+10, r:Math.random()*2.4+0.6,
    vy:-(Math.random()*0.7+0.25), vx:(Math.random()-0.5)*0.4, a:Math.random()*0.6+0.2, life:0}; }
  for(let i=0;i<52;i++){ const p=spawn(); p.y=Math.random()*H; parts.push(p); }
  function tick(){
    cx.clearRect(0,0,W,H);
    const frost = document.body.getAttribute('data-age')==='frost';
    for(const p of parts){
      p.y+=p.vy; p.x+=p.vx; p.life+=0.01;
      if(p.y< -10){ Object.assign(p, spawn()); }
      const col = frost? '200,235,255' : '255,'+(140+Math.floor(Math.random()*60))+',60';
      cx.beginPath(); cx.arc(p.x,p.y,p.r,0,7);
      cx.fillStyle='rgba('+col+','+(p.a*(0.6+0.4*Math.sin(p.life*3)))+')'; cx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

/* ---------- fluid helpers: ripple, count-up, sheet ---------- */
function attachRipples(root){
  root.querySelectorAll('.btn,.moreitem,.suggest').forEach(b=>{
    if(b._rip) return; b._rip=1;
    b.addEventListener('pointerdown', e=>{
      const rect=b.getBoundingClientRect(), d=Math.max(rect.width,rect.height);
      const s=document.createElement('span'); s.className='ripple';
      s.style.width=s.style.height=d+'px';
      s.style.left=(e.clientX-rect.left-d/2)+'px'; s.style.top=(e.clientY-rect.top-d/2)+'px';
      b.appendChild(s); setTimeout(()=>s.remove(),600);
    });
  });
}
function runCountUp(root){
  root.querySelectorAll('.countup').forEach(el=>{
    const to=Number(el.dataset.to||0); if(to<=0){ el.textContent=fmt(to); return; }
    const dur=760, t0=performance.now();
    function step(t){ const p=Math.min(1,(t-t0)/dur); const e=1-Math.pow(1-p,3);
      el.textContent=fmt(Math.round(to*e)); if(p<1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  });
}
function afterRender(root){ runCountUp(root); attachRipples(root); }

function openSheet(html){
  const ov=document.getElementById('overlay'), body=document.getElementById('sheetBody');
  body.innerHTML=html; ov.classList.add('show'); afterRender(body); haptic();
  return body;
}
function closeSheet(){ document.getElementById('overlay').classList.remove('show'); }
document.getElementById('overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') closeSheet(); });

/* ---------- routing ---------- */
let TAB = 'home';
document.querySelector('#tabs .navwrap').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); TAB = b.dataset.tab; haptic();
  render();
});
document.getElementById('moreBtn').addEventListener('click', ()=>openMore());

function goTab(tab){
  TAB=tab;
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===TAB));
  render();
}

function applyState(s){
  STATE = s;
  const age = s.age||{};
  document.body.setAttribute('data-age', age.id||'fire');
  document.getElementById('ageChip').textContent = age.name||'Age of First Fire';
}

/* ---------- boot + refresh ---------- */
async function boot(){
  try{
    const s = await api('/api/start','POST',{start_param:START_PARAM});
    applyState(s); render();
  }catch(e){
    const hint = /hash|initData|signature|401/i.test(e.message||'')
      ? '<br><small>Open this app <b>inside Telegram</b> (tap the bot\u2019s menu button or your Mini App link) \u2014 a normal browser can\u2019t sign you in.</small>'
      : '<br><small>'+esc(e.message)+'</small>';
    document.getElementById('view').innerHTML =
      '<div class="empty">Could not reach the fire.'+hint+'</div>';
  }
}
async function refresh(){ const s = await api('/api/state'); applyState(s); render(); }
async function act(fn){ try{ await fn(); }catch(e){ toast(e.message); notif('error'); } }

/* ---------- render dispatch ---------- */
function render(){
  if(!STATE) return;
  const v = document.getElementById('view');
  if(TAB==='home'){ v.innerHTML = '<div class="screen">'+renderHome()+'</div>'; bindHome(); afterRender(v); }
  else if(TAB==='tribe'){ v.innerHTML='<div class="loader">\u2026</div>'; renderTribe(v); }
  else if(TAB==='ranks'){ v.innerHTML='<div class="loader">\u2026</div>'; renderRanks(v); }
  else if(TAB==='lands'){ v.innerHTML='<div class="loader">\u2026</div>'; renderLands(v); }
  else if(TAB==='store'){ v.innerHTML='<div class="loader">\u2026</div>'; renderStore(v); }
}

/* ---------- HOME (the Fire) ---------- */
function renderHome(){
  const u = STATE.user, t = STATE.tribe, tasks = STATE.tasks||[];
  const stateLabel = {active:'Your fire burns bright',cooling:'Your fire is cooling',fading:'Your fire is fading'}[u.state]||'Kindle the first flame';
  const streakPct = Math.min(100, u.streak/30*100);
  let h = '';
  h += '<div class="hero liquid">'+
    '<div class="glow-orb"></div>'+
    '<svg class="bigflame"><use href="#ic-flame"/></svg>'+
    '<div class="hill"></div>'+
    '<div class="hero-copy">'+
      '<span class="chip best">'+esc(stateLabel)+(u.rank?' \u00b7 #'+u.rank.position+' in tribe':'')+'</span>'+
      '<div class="hero-title">'+esc(u.name)+(u.title?' <span class="chip">'+esc(u.title)+'</span>':'')+'</div>'+
      '<div class="hero-sub">'+(u.rank?rankBadge(u.rank):'A wanderer of the wilds')+'</div>'+
    '</div>'+
  '</div>';

  h += '<div class="resources">'+
    '<div class="resource"><div class="value">'+u.streak+'</div><div class="label">Day Streak</div></div>'+
    '<div class="resource"><div class="value ember">'+cu(u.kindle)+'</div><div class="label">Kindle</div></div>'+
    '<div class="resource"><div class="value star">'+cu(u.ember)+'</div><div class="label">Ember</div></div>'+
  '</div>';

  h += '<div class="card liquid" style="margin-top:12px">'+
    '<div class="row"><h3>Tend the Campfire</h3>'+ic('ic-flame','art floaty')+'</div>'+
    '<div class="mini" style="margin:4px 0 12px">Kindle Score feeds your tribe Loyalty and sets your rank.</div>'+
    '<div class="bar"><i style="width:'+streakPct+'%"></i></div>'+
    '<button class="btn orange full" id="checkinBtn" style="margin-top:14px">'+ic('ic-flame')+'Tend the Campfire</button>'+
  '</div>';

  if(t){
    const loyPct = t.next_cost? Math.min(100, t.loyalty/t.next_cost*100) : 100;
    h += '<div class="card" data-go="tribe" style="cursor:pointer">'+
      '<div class="row"><h2>'+esc(t.name)+'</h2><span class="chip best">'+esc(t.stage)+'</span></div>'+
      '<div class="sub">Shared Loyalty pool \u2014 the whole tribe rises together</div>'+
      '<div class="stat-row">'+
        '<div class="stat"><div class="v loyal">'+cu(t.loyalty)+'</div><div class="l">Loyalty</div></div>'+
        '<div class="stat"><div class="v">'+t.members+'</div><div class="l">Kin</div></div>'+
        '<div class="stat"><div class="v star">'+cu(t.embertide)+'</div><div class="l">Embertide</div></div>'+
      '</div>'+
      '<div class="progress loy" style="margin-top:12px"><i style="width:'+loyPct+'%"></i></div>'+
      (t.fading? '<div class="mini" style="margin-top:8px;color:var(--fire)">'+t.fading+' kin fading \u2014 Ashfall bleeds Loyalty. Rekindle them in Tribe.</div>':'')+
    '</div>';
  } else {
    h += '<div class="card"><h2>You walk alone</h2>'+
      '<div class="sub">Wanderers earn Ember but no Loyalty, rank or land. Join or found a tribe.</div>'+
      '<button class="btn teal small" data-go="tribe" style="margin-top:12px">Find or found a tribe</button></div>';
  }

  h += '<div class="section-title">'+ic('ic-relic')+'Daily Rites</div>';
  h += '<div class="card list stagger"><div class="kin"><div class="avatar">'+ic('ic-relic')+'</div>'+
    '<div class="who"><div class="nm">Seek a Relic</div><div class="meta">A shard for your Satchel + Ember</div></div>'+
    '<button class="btn small teal" id="relicBtn">Seek</button></div>';
  for(const tk of tasks){
    h += '<div class="kin"><div class="pos">'+(tk.complete?'\u2713':'\u00b7')+'</div>'+
      '<div class="who"><div class="nm">'+esc(tk.title)+'</div><div class="meta">'+esc(tk.hint)+' \u00b7 +'+tk.reward+' Ember</div></div>'+
      (tk.complete?'<span class="chip">done</span>':'<button class="btn small" data-task="'+esc(tk.id)+'">Do</button>')+'</div>';
  }
  h += '</div>';

  h += '<div class="section-title">'+ic('ic-referral')+'Bloodline</div>';
  h += '<div class="card"><div class="sub">Invite kin \u2014 '+STATE.referral.count+' have answered your call.</div>'+
    '<button class="btn ghost small" id="inviteBtn" style="margin-top:12px">'+ic('ic-referral')+'Share invite link</button></div>';
  return h;
}

function shareInvite(){
  const link=STATE.referral.link;
  const share='https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent('Join my tribe in Tribes. We rise together.');
  if(tg&&tg.openTelegramLink) tg.openTelegramLink(share);
  else { navigator.clipboard&&navigator.clipboard.writeText(link); toast('Invite link copied'); }
}

function bindHome(){
  const v = document.getElementById('view');
  v.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>goTab(el.dataset.go));
  const cb=v.querySelector('#checkinBtn'); if(cb) cb.onclick=()=>act(async()=>{
    cb.disabled=true; const r=await api('/api/checkin','POST');
    haptic('medium'); notif('success'); toast(r.already?'Already tended today':'The fire grows. +Kindle');
    applyState(r); render();
  });
  const rb=v.querySelector('#relicBtn'); if(rb) rb.onclick=()=>act(async()=>{
    const r=await api('/api/relic/find','POST'); toast(r.already?'No relic today':'Relic found!'); notif('success'); applyState(r); render();
  });
  v.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>act(async()=>{
    const r=await api('/api/tasks/complete','POST',{task_id:b.dataset.task});
    toast(r.already?'Already done':'Rite complete'); applyState(r); render();
  }));
  const ib=v.querySelector('#inviteBtn'); if(ib) ib.onclick=shareInvite;
}

/* ---------- TRIBE ---------- */
async function renderTribe(v){
  const d = await api('/api/tribe');
  if(!d.tribe){ renderNoTribe(v); return; }
  const t=d.tribe, roster=d.roster||[], fading=d.fading||[], isChief=d.is_chief;
  const pct = t.next_cost? Math.min(100, t.loyalty/t.next_cost*100) : 100;
  let h='<div class="screen">';
  h += '<div class="card liquid tribe-head">'+
    '<div class="crest">'+ic('ic-crest')+'</div>'+
    '<h2>'+esc(t.name)+' <span class="chip best">'+esc(t.stage)+'</span></h2>'+
    (t.war_cry?'<div class="warcry">\u201c'+esc(t.war_cry)+'\u201d</div>':'')+
    '<div class="stat-row">'+
      '<div class="stat"><div class="v loyal">'+cu(t.loyalty)+'</div><div class="l">Loyalty</div></div>'+
      '<div class="stat"><div class="v">'+t.members+'/'+t.max_members+'</div><div class="l">Kin</div></div>'+
      '<div class="stat"><div class="v star">'+cu(t.embertide)+'</div><div class="l">Embertide</div></div>'+
    '</div>'+
    '<div class="pips"><span class="pip active">'+t.active+' active</span>'+
      '<span class="pip cool">'+t.cooling+' cooling</span>'+
      '<span class="pip fade">'+t.fading+' fading</span></div>';
  if(t.next_stage){
    h+='<div class="upgrade"><div class="mini">Next: '+esc(t.next_stage)+' \u00b7 '+fmt(t.next_cost)+' Loyalty</div>'+
      '<div class="progress loy"><i style="width:'+pct+'%"></i></div>'+
      (isChief?'<button class="btn small orange" id="upgradeBtn"'+(t.loyalty<t.next_cost?' disabled':'')+'>Advance the tribe</button>':'')+'</div>';
  }
  h+='<div class="row2" style="margin-top:10px">'+
    (isChief?'<button class="btn ghost small" id="warcryBtn">Set war cry</button>':'')+
    '<button class="btn ghost small danger" id="leaveBtn">Leave tribe</button></div>';
  h+='</div>';

  if(fading.length){
    h+='<div class="section-title">'+ic('ic-rekindle')+'Fading kin \u2014 Rekindle them</div><div class="card list stagger">';
    for(const f of fading){
      h+='<div class="kin"><div class="avatar fade">'+ic('ic-flame')+'</div>'+
        '<div class="who"><div class="nm">'+esc(f.name)+'</div><div class="meta">idle '+f.idle_days+'d \u00b7 '+fmt(f.kindle)+' Kindle bleeding Ashfall</div></div>'+
        '<button class="btn small teal" data-rekindle="'+esc(f.user_id)+'">Rekindle</button></div>';
    }
    h+='</div>';
  }

  h+='<div class="section-title">'+ic('ic-rank')+'Ranks by effort</div><div class="card list stagger">';
  for(const m of roster){
    h+='<div class="kin"><div class="pos">'+m.position+'</div>'+
      '<div class="avatar '+esc(m.state)+'">'+ic('ic-flame')+'</div>'+
      '<div class="who"><div class="nm">'+esc(m.name)+(m.user_id===STATE.user.id?' <span class="chip">you</span>':'')+'</div>'+
      '<div class="meta">'+rankBadge(m.rank)+' \u00b7 '+fmt(m.kindle)+' Kindle</div></div>'+
      '<div class="pip '+(m.state==='active'?'active':m.state==='cooling'?'cool':'fade')+'">'+esc(m.state)+'</div></div>';
  }
  h+='</div></div>';
  v.innerHTML=h;
  afterRender(v);
  bindTribe(v, isChief);
}

function bindTribe(v, isChief){
  const up=v.querySelector('#upgradeBtn'); if(up) up.onclick=()=>act(async()=>{
    const r=await api('/api/tribe/upgrade','POST'); toast('The tribe advances!'); notif('success'); applyState(r); render();
  });
  const wc=v.querySelector('#warcryBtn'); if(wc) wc.onclick=()=>{
    const txt=prompt('War cry (max 80 chars):'); if(txt==null) return;
    act(async()=>{ const r=await api('/api/tribe/warcry','POST',{text:txt}); toast('War cry set'); applyState(r); render(); });
  };
  const lv=v.querySelector('#leaveBtn'); if(lv) lv.onclick=()=>{
    if(!confirm('Leave your tribe? You become a Wanderer.')) return;
    act(async()=>{ const r=await api('/api/tribe/leave','POST'); toast('You walk alone now'); applyState(r); render(); });
  };
  v.querySelectorAll('[data-rekindle]').forEach(b=>b.onclick=()=>act(async()=>{
    if(STATE.dev_mode){
      const r=await api('/api/rekindle','POST',{user_id:b.dataset.rekindle});
      haptic('medium'); toast('Kin rekindled \u2014 their fire returns'); applyState(r); render();
    } else {
      const inv=await api('/api/store/invoice','POST',{item_id:'rekindle_token',target:b.dataset.rekindle});
      if(tg&&tg.openInvoice) tg.openInvoice(inv.invoice_link,()=>refresh()); else toast('Open in Telegram to pay');
    }
  }));
}

/* ---------- NO TRIBE: found or join ---------- */
async function renderNoTribe(v){
  const d = await api('/api/tribes');
  const tribes = d.tribes||[];
  const cost = (STATE.tribe_found_cost||0), haveE = (STATE.user&&STATE.user.ember)||0;
  const minK = (STATE.tribe_found_min_kindle||0), haveK = (STATE.user&&STATE.user.kindle)||0;
  const canAfford = haveE>=cost && haveK>=minK;
  let h='<div class="screen">';
  h+='<div class="card found-card liquid">'+
    '<div class="found-crest"><img src="/assets/crest.png" alt="" /></div>'+
    '<h2>Found your own tribe</h2>'+
    '<div class="sub">Become chief. Your first fire seeds the tribe Loyalty.</div>'+
    '<input id="tname" class="inp" maxlength="32" placeholder="Name your band / clan / tribe" />'+
    '<div class="cost-line'+(canAfford?'':' short')+'">'+ic('ic-flame')+'Founding costs <b>'+fmt(cost)+' Ember</b>'+
      (minK>0?(' &amp; '+fmt(minK)+' Kindle'):'')+
      ' \u00b7 you have '+fmt(haveE)+' Ember'+(minK>0?(', '+fmt(haveK)+' Kindle'):'')+'</div>'+
    '<button class="btn orange'+(canAfford?'':' ghost')+'" id="foundBtn" style="margin-top:10px">'+ic('ic-crest')+'Found the tribe</button></div>';
  h+='<div class="section-title">'+ic('ic-rank')+'Join an existing tribe</div><div class="card list stagger">';
  if(!tribes.length) h+='<div class="empty">No tribes yet \u2014 be the first.</div>';
  for(const t of tribes){
    h+='<div class="kin"><div class="avatar">'+ic('ic-crest')+'</div>'+
      '<div class="who"><div class="nm">'+esc(t.name)+'</div><div class="meta">'+fmt(t.loyalty_earned)+' Loyalty \u00b7 '+t.members+'/'+t.max_members+' kin</div></div>'+
      '<button class="btn small teal" data-join="'+esc(t.tribe_id)+'"'+(t.members>=t.max_members?' disabled':'')+'>'+(t.members>=t.max_members?'Full':'Join')+'</button></div>';
  }
  h+='</div></div>';
  v.innerHTML=h;
  afterRender(v);
  const fb=v.querySelector('#foundBtn'); fb.onclick=()=>{
    const nm=v.querySelector('#tname').value.trim(); if(!nm){ toast('Name your band / clan / tribe first'); return; }
    act(async()=>{ const r=await api('/api/tribe/found','POST',{name:nm}); haptic('medium'); toast('Your tribe is born'); notif('success'); applyState(r); render(); });
  };
  v.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>act(async()=>{
    const r=await api('/api/tribe/join','POST',{tribe_id:b.dataset.join}); toast('You joined the tribe'); notif('success'); applyState(r); render();
  }));
}

/* ---------- RANKS (leaderboard) ---------- */
async function renderRanks(v){
  const [td, mine] = await Promise.all([api('/api/tribes'), api('/api/tribe').catch(()=>({}))]);
  const tribes=(td.tribes||[]).slice().sort((a,b)=>(b.loyalty_earned||0)-(a.loyalty_earned||0));
  const myTribeName = mine&&mine.tribe? mine.tribe.name : null;
  const roster = mine&&mine.roster? mine.roster : [];
  const medals=['\ud83e\udd47','\ud83e\udd48','\ud83e\udd49'];
  let h='<div class="screen">';
  h+='<div class="card liquid" style="text-align:center">'+
    ic('ic-rank','art floaty')+
    '<h2 style="margin-top:6px">The Great Ledger</h2>'+
    '<div class="sub">Tribes rise by shared Loyalty. Keep your fire alive to climb.</div></div>';

  h+='<div class="tabs" id="ranksTabs">'+
    '<button class="tab active" data-rt="tribes">Tribes</button>'+
    '<button class="tab" data-rt="kin"'+(roster.length?'':' disabled style="opacity:.4"')+'>Your Kin</button></div>';

  h+='<div id="rtTribes"><div class="card list stagger">';
  if(!tribes.length) h+='<div class="empty">No tribes have formed yet.</div>';
  tribes.forEach((t,i)=>{
    const me = t.name===myTribeName;
    h+='<div class="kin">'+
      (i<3?'<div class="rankmedal">'+medals[i]+'</div>':'<div class="ranknum">'+(i+1)+'</div>')+
      '<div class="avatar">'+ic('ic-crest')+'</div>'+
      '<div class="who"><div class="nm">'+esc(t.name)+(me?' <span class="chip best">yours</span>':'')+'</div>'+
      '<div class="meta">'+t.members+'/'+t.max_members+' kin</div></div>'+
      '<div class="chip'+(i===0?' best':'')+'">'+fmt(t.loyalty_earned)+'</div></div>';
  });
  h+='</div></div>';

  h+='<div id="rtKin" style="display:none"><div class="card list stagger">';
  if(!roster.length) h+='<div class="empty">Join a tribe to see your kin ranked.</div>';
  for(const m of roster){
    h+='<div class="kin"><div class="ranknum">'+m.position+'</div>'+
      '<div class="avatar '+esc(m.state)+'">'+ic('ic-flame')+'</div>'+
      '<div class="who"><div class="nm">'+esc(m.name)+(m.user_id===STATE.user.id?' <span class="chip">you</span>':'')+'</div>'+
      '<div class="meta">'+rankBadge(m.rank)+'</div></div>'+
      '<div class="chip">'+fmt(m.kindle)+'</div></div>';
  }
  h+='</div></div></div>';
  v.innerHTML=h;
  afterRender(v);
  v.querySelectorAll('#ranksTabs .tab').forEach(b=>b.onclick=()=>{
    if(b.disabled) return;
    v.querySelectorAll('#ranksTabs .tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); haptic();
    const kin=b.dataset.rt==='kin';
    v.querySelector('#rtTribes').style.display=kin?'none':'';
    v.querySelector('#rtKin').style.display=kin?'':'none';
  });
}

/* ---------- LANDS ---------- */
async function renderLands(v){
  const d = await api('/api/lands');
  const lands=d.lands||[], mine=d.my_tribe;
  let h='<div class="screen">';
  h+='<div class="card liquid land-hero"><div class="land-hero-img"><img src="/assets/land.png" alt="" /></div>'+
    '<h2>The Lands</h2><div class="sub">Stake Embertide to claim ground. Held land feeds your tribe Loyalty daily. Invade rivals to seize theirs.</div></div>';
  h+='<div class="lands stagger">';
  for(const l of lands){
    const held=!!l.owner, ours=l.owner===mine;
    const cls = ours?'ours':(held?'enemy':'wild');
    h+='<div class="land '+cls+'">'+
      '<div class="land-ic">'+ic('ic-land')+'</div>'+
      '<div class="land-nm">'+esc(l.name)+'</div>'+
      '<div class="land-meta">'+(held?esc(l.owner_name)+' \u00b7 '+fmt(l.staked)+' staked':'Unclaimed')+'</div>'+
      (l.contested?'<div class="chip best">Contested \u00b7 '+fmt(l.attacker_staked)+' vs '+fmt(l.staked)+'</div>':'')+
      '<div class="land-act">'+
        (!mine?'<span class="mini">join a tribe</span>':
          ours?'<button class="btn small" data-stake="'+esc(l.land_id)+'">Reinforce</button>':
          held?'<button class="btn small danger" data-invade="'+esc(l.land_id)+'">Invade</button>':
          '<button class="btn small teal" data-stake="'+esc(l.land_id)+'">Claim</button>')+
      '</div></div>';
  }
  h+='</div></div>';
  v.innerHTML=h;
  afterRender(v);
  const doStake=(lid,inv)=>{
    const amt=parseInt(prompt((inv?'Invade with how much':'Stake how much')+' Embertide?'),10);
    if(!amt||amt<=0) return;
    act(async()=>{ const r=await api(inv?'/api/lands/invade':'/api/lands/stake','POST',{land_id:lid,amount:amt});
      haptic('medium'); toast(inv?'Invasion launched':'Ground staked'); notif('success'); applyState(r); render(); });
  };
  v.querySelectorAll('[data-stake]').forEach(b=>b.onclick=()=>doStake(b.dataset.stake,false));
  v.querySelectorAll('[data-invade]').forEach(b=>b.onclick=()=>doStake(b.dataset.invade,true));
}

/* ---------- STORE (the Sky / Trading Post) ---------- */
async function renderStore(v){
  const d = await api('/api/store');
  const sections=d.sections||[], items=d.items||[], live=d.payments_live;
  let h='<div class="screen">';
  h+='<div class="card liquid"><h2>The Trading Post</h2>'+
    '<div class="sub">Everything here is cosmetic, convenience or kinship \u2014 never Loyalty, rank, land or allocation. The airdrop stays fair.</div>'+
    '<div class="pips"><span class="chip">Ash Wards held: '+d.wards+'</span>'+
    (live?'':'<span class="chip best">Demo mode \u2014 free to test</span>')+'</div></div>';
  for(const s of sections){
    const its=items.filter(i=>i.section===s.id);
    if(!its.length) continue;
    h+='<div class="section-title">'+esc(s.title)+'</div>';
    if(s.blurb) h+='<div class="mini" style="margin:-4px 4px 8px">'+esc(s.blurb)+'</div>';
    h+='<div class="card list stagger">';
    for(const i of its){
      h+='<div class="kin"><div class="avatar">'+artIcon(i.art)+'</div>'+
        '<div class="who"><div class="nm">'+esc(i.title)+'</div><div class="meta">'+esc(i.desc||'')+'</div></div>'+
        '<button class="btn small" data-buy="'+esc(i.id)+'">'+ic('ic-star')+i.stars+'</button></div>';
    }
    h+='</div>';
  }
  h+='</div>';
  v.innerHTML=h;
  afterRender(v);
  v.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>act(async()=>{
    const id=b.dataset.buy;
    if(STATE.dev_mode){
      const r=await api('/api/store/buy_demo','POST',{item_id:id}); haptic('medium'); toast('Granted (demo)'); notif('success'); applyState(r); render();
    } else {
      const inv=await api('/api/store/invoice','POST',{item_id:id});
      if(tg&&tg.openInvoice) tg.openInvoice(inv.invoice_link,st=>{ if(st==='paid'){ toast('Thank you!'); refresh(); } });
      else toast('Open in Telegram to pay with Stars');
    }
  }));
}

/* ---------- MORE sheet: Satchel + Bloodline + Wallet ---------- */
async function openMore(){
  const body=openSheet('<div class="loader">\u2026</div>');
  try{
    const [inv, blood] = await Promise.all([api('/api/inventory'), api('/api/bloodline')]);
    let h='<h2 style="margin:2px 0 12px">More</h2>';
    h+='<div class="section-title" style="margin-top:6px">'+ic('ic-cache')+'Your Satchel</div><div class="card list stagger">';
    h+='<div class="kin"><div class="avatar">'+ic('ic-ward')+'</div><div class="who"><div class="nm">Ash Wards</div>'+
      '<div class="meta">Auto-save a missed day</div></div><div class="chip">x'+inv.wards+'</div></div>';
    if(!(inv.satchel||[]).length && !inv.wards) h+='<div class="empty">Empty \u2014 seek relics and complete rites.</div>';
    for(const it of (inv.satchel||[])){
      h+='<div class="kin"><div class="avatar">'+artIcon(it.art)+'</div>'+
        '<div class="who"><div class="nm">'+esc(it.title)+'</div><div class="meta">'+esc(it.desc||'')+'</div></div>'+
        '<div class="chip">x'+it.qty+'</div></div>';
    }
    h+='</div>';
    if((inv.tribe_cache||[]).length){
      h+='<div class="section-title">'+ic('ic-cache')+'Tribe Cache</div><div class="card list stagger">';
      for(const it of inv.tribe_cache){
        h+='<div class="kin"><div class="avatar">'+artIcon(it.art)+'</div>'+
          '<div class="who"><div class="nm">'+esc(it.title)+'</div><div class="meta">'+esc(it.desc||'')+'</div></div>'+
          '<div class="chip">x'+it.qty+'</div></div>';
      }
      h+='</div>';
    }
    h+='<div class="section-title">'+ic('ic-referral')+'Bloodline \u00b7 '+blood.count+'</div><div class="card list stagger">';
    h+='<button class="btn ghost small" id="inviteBtn2">'+ic('ic-referral')+'Share invite link</button>';
    if(!(blood.bloodline||[]).length) h+='<div class="empty">No kin yet. Invite explorers to grow your line.</div>';
    for(const b of (blood.bloodline||[])){
      h+='<div class="kin"><div class="avatar">'+ic('ic-flame')+'</div>'+
        '<div class="who"><div class="nm">'+esc(b.name||'Explorer')+'</div>'+
        '<div class="meta">'+(b.joined_tribe?'joined a tribe':'answered your call')+'</div></div></div>';
    }
    h+='</div>';
    h+='<div class="section-title">'+ic('ic-wallet')+'Wallet</div><div class="card">'+
      '<div class="sub">Link a wallet for the future airdrop claim.</div>'+
      '<input id="waddr" class="inp" maxlength="80" placeholder="Wallet address" value="'+esc(STATE.user.wallet||'')+'" />'+
      '<button class="btn small orange" id="walletBtn" style="margin-top:10px">Save wallet</button></div>';
    body.innerHTML=h; afterRender(body);
    body.querySelector('#inviteBtn2').onclick=shareInvite;
    body.querySelector('#walletBtn').onclick=()=>act(async()=>{
      const a=body.querySelector('#waddr').value.trim();
      const r=await api('/api/wallet','POST',{address:a}); toast('Wallet saved'); notif('success'); applyState(r);
      closeSheet(); render();
    });
  }catch(e){ body.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; }
}

/* ---------- go ---------- */
boot();
