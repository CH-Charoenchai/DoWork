/* DoWork — คู่มือเริ่มต้น: กล่องต้อนรับ · เช็คลิสต์ · สอนแบบพาทำ (ไฮไลต์ปุ่มจริงทีละขั้น)
   วางไว้ข้าง index.html · ถ้ารัน tour_setup.sql จะจำข้ามเครื่องได้ (ไม่รันก็ใช้ได้ จำเฉพาะเครื่องนี้) */
(function(){
'use strict';
const $id = id => document.getElementById(id);
let state = {}, uid = null, initedFor = null, loaded = false, lastCountAt = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- สถานะ (ฐานข้อมูล + เครื่องนี้) ---------- */
const lsKey = () => 'dowork_onb_' + uid;
function readLocal(){ try{ return JSON.parse(localStorage.getItem(lsKey()) || '{}'); }catch(e){ return {}; } }
async function loadState(){
  let db = {};
  for(let i = 0; i < 3; i++){
    const { data, error } = await sb.from('app_settings').select('onboarding').eq('user_id', uid).maybeSingle();
    if(error) break;
    if(data){ db = data.onboarding || {}; break; }
    await sleep(600);
  }
  state = Object.assign({}, db, readLocal());
}
async function saveState(patch){
  Object.assign(state, patch);
  try{ localStorage.setItem(lsKey(), JSON.stringify(state)); }catch(e){}
  await sb.from('app_settings').update({ onboarding: state }).eq('user_id', uid);
}

/* ---------- กล่องโต้ตอบ (ต้อนรับ / คู่มือ / เช็คลิสต์) ---------- */
function mountDialog(html, handler, enterAction){
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay ui-dialog';
  ov.innerHTML = html;
  document.body.appendChild(ov);
  function close(action){
    document.removeEventListener('keydown', onKey, true);
    ov.remove();
    if(prev && prev.focus) try{ prev.focus(); }catch(e){}
    handler(action || 'close');
  }
  function onKey(e){
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close('close'); }
    else if(e.key === 'Enter' && enterAction && document.activeElement.tagName !== 'BUTTON'){ e.preventDefault(); e.stopPropagation(); close(enterAction); }
  }
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', e => { if(e.target === ov) close('close'); });
  ov.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => close(b.dataset.g)));
  return { ov, close };
}

function openGuide(mode){
  const help = mode === 'help';
  const name = (userProfile && userProfile.name) || (currentUser && currentUser.user_metadata && currentUser.user_metadata.display_name) || '';
  const html = `
    <div class="modal ui-modal guide-modal" role="dialog" aria-modal="true" aria-label="คู่มือการใช้งาน">
      <div class="modal-body">
        <div class="guide-hero">
          <div class="blob-big"></div>
          <h2>${help ? 'คู่มือการใช้งาน' : 'ยินดีต้อนรับสู่ DoWork 👋'}</h2>
          <p>${help ? 'DoWork ทำอะไรได้บ้าง' : (name ? 'สวัสดี '+escapeHtml(name)+' · ' : '') + 'แอปจัดการงานประจำวัน ครบในที่เดียว'}</p>
        </div>
        <div class="guide-list">
          <div class="guide-row"><span class="guide-ic">🏠</span><div><b>Home</b><span class="t">ดูภาพรวม งานที่ใกล้ครบกำหนด และเพิ่มงานเร็วๆ ได้ทันที</span></div></div>
          <div class="guide-row"><span class="guide-ic">📋</span><div><b>Work</b><span class="t">จัดการงานทั้งหมด ลากเรียง ติ๊กให้เสร็จ หรือกด “พักไว้” ถ้ายังไม่พร้อมทำ</span></div></div>
          <div class="guide-row"><span class="guide-ic">🔁</span><div><b>Routine</b><span class="t">งานประจำรายสัปดาห์ เดือน หรือไตรมาส เช็คลิสต์รีเซ็ตเองทุกรอบ</span></div></div>
          <div class="guide-row"><span class="guide-ic">📝</span><div><b>Note</b><span class="t">จดโน้ตแยกเป็นสมุด ปรับสีและลากสลับตำแหน่งได้ บันทึกให้อัตโนมัติ</span></div></div>
          <div class="guide-row"><span class="guide-ic">🔗</span><div><b>ทางลัด</b><span class="t">เก็บลิงก์เว็บหรือเอกสารที่เปิดบ่อยไว้ที่แถบด้านบน</span></div></div>
        </div>
        <p class="guide-note">อยากลองใช้จริง? ให้แอปพาทำทีละขั้น ใช้เวลาประมาณ 2–3 นาที</p>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-g="close">${help ? 'ปิด' : 'ข้ามไปก่อน'}</button>
          <button type="button" class="btn-submit" data-g="tour">${help ? '▶ สอนใหม่แบบพาทำ' : 'เริ่มเลย — พาทำให้ดู'}</button>
        </div>
      </div>
    </div>`;
  const { ov } = mountDialog(html, async (act) => {
    if(!state.welcomed) await saveState({ welcomed:true });
    if(act === 'tour') startTour();
  }, 'tour');
  ov.querySelector('[data-g="tour"]').focus();
}

/* ================== สอนแบบพาทำ (spotlight) ================== */
const TOUR = { on:false, i:0, timer:null, token:0, locked:false, scrolled:false, st:{}, base:null, layers:null };

const navTab = v => {
  const a = document.querySelector(`.top-nav .nav-item[data-view="${v}"]`);
  if(a && a.getClientRects().length) return a;
  const b = document.querySelector(`.mobile-nav button[data-view="${v}"]`);
  return (b && b.getClientRects().length) ? b : null;
};
const createdIds = () => new Set(tasksCache.filter(t => TOUR.base && !TOUR.base.tasks.has(t.id)).map(t => t.id));
const doneCount = () => tasksCache.filter(t => t.status === 'เสร็จแล้ว').length;
function pickCard(){
  const ids = createdIds();
  const cards = [...document.querySelectorAll('#work-lists .task-card')].filter(c => !c.classList.contains('done') && !c.classList.contains('on-hold'));
  return cards.find(c => ids.has(c.dataset.id)) || cards[0] || null;
}
async function ensureActiveTask(){
  if(tasksCache.some(t => t.status !== 'เสร็จแล้ว' && t.status !== HOLD)) return;
  const max = tasksCache.reduce((m,t) => Math.max(m, t.sort_order || 0), 0);
  const { error } = await sb.from('tasks').insert({
    user_id: currentUser.id, title: 'งานตัวอย่าง (ใช้ลองทำตามขั้นตอน)', category: getLastCat() || 'Project',
    urgency: 'ปกติ', impact: 'กลาง', status: 'ยังไม่ทำ', deadline: null, sort_order: max + 1
  });
  if(!error) await loadTasks();
}

const STEPS = [
  { id:'add', view:'home', t:'เพิ่มงานแรกของคุณ',
    x:'พิมพ์ชื่องานในช่องนี้ เช่น “ส่งรายงานประจำเดือน” แล้วกด Enter (หรือกดปุ่ม เพิ่ม)',
    target: () => document.querySelector('#home-view .quick-add'),
    init: () => ({ n: tasksCache.length }),
    done: s => tasksCache.length > s.n },
  { id:'go-work', t:'ไปดูงานทั้งหมด',
    x:'งานที่เพิ่มจะอยู่ในหน้า Work กดแท็บ Work',
    target: () => navTab('work'),
    done: () => currentView === 'work' },
  { id:'tick', view:'work', t:'ทำงานให้เสร็จ',
    x:'ติ๊กช่องสี่เหลี่ยมหน้างาน = ทำเสร็จ (กดอีกครั้งเพื่อยกเลิกได้)',
    target: () => { const c = pickCard(); return c && c.querySelector('.task-check'); },
    init: async () => { await ensureActiveTask(); return { n: doneCount() }; },
    done: s => doneCount() > s.n },
  { id:'open', view:'work', t:'เปิดรายละเอียดงาน',
    x:'กดที่การ์ดงานเพื่อเปิดดูรายละเอียด ใส่โน้ต ลิงก์ และเปลี่ยนสถานะ',
    target: () => pickCard(),
    init: async () => { await ensureActiveTask(); return {}; },
    done: () => !$id('task-modal').classList.contains('hidden') },
  { id:'hold', t:'ลองกด “พักไว้”',
    x:'ถ้างานยังไม่พร้อมทำ ให้กด “พักไว้” งานจะไม่ถูกนับเป็นงานค้าง และเก็บแยกไว้ในหน้า Work',
    target: () => document.querySelector('#tm-status-group [data-val="พักไว้"]'),
    init: () => { const t = tasksCache.find(x => x.id === activeTaskId); return { was: t && t.status }; },
    done: s => { const t = tasksCache.find(x => x.id === activeTaskId); return !!t && t.status === HOLD && s.was !== HOLD; },
    onDone: () => $id('task-modal').classList.add('hidden') },
  { id:'go-routine', t:'ไปหน้า Routine',
    x:'งานที่ต้องทำซ้ำๆ เป็นประจำ ใช้ Routine กดแท็บ Routine',
    skipIf: () => !navTab('routine'),
    target: () => navTab('routine'),
    done: () => currentView === 'routine' },
  { id:'open-routine', view:'routine', t:'สร้างลูทีนแรก',
    x:'กด “+ งานใหม่” ตอนอยู่หน้า Routine จะเป็นการสร้างลูทีน (ไม่ใช่งานปกติ)',
    skipIf: () => !navTab('routine'),
    target: () => $id('fab-add'),
    done: () => !!$id('e-title') },
  { id:'save-routine', view:'routine', t:'กรอกแล้วกดบันทึก',
    x:'ตั้งชื่อ เช่น “ส่งรายงานประจำสัปดาห์” เลือกความถี่และวันครบกำหนด แล้วกด “บันทึกลูทีน”',
    skipIf: () => !navTab('routine'),
    target: () => { const e = $id('e-title'); return e ? e.closest('.modal') : null; },
    init: () => ({ n: document.querySelectorAll('#routine-view [data-rid]').length }),
    done: s => document.querySelectorAll('#routine-view [data-rid]').length > s.n },
  { id:'go-note', t:'ไปหน้า Note',
    x:'สุดท้ายลองจดโน้ต กดแท็บ Note',
    target: () => navTab('note'),
    done: () => currentView === 'note' },
  { id:'new-note', view:'note', t:'สร้างโน้ตใหม่',
    x:'กด “+ โน้ตใหม่” จะได้หน้ากระดาษเปล่าทางขวา',
    target: () => $id('note-new'),
    init: () => ({ n: document.querySelectorAll('#note-list .ni').length }),
    done: s => document.querySelectorAll('#note-list .ni').length > s.n },
  { id:'note-title', view:'note', t:'ตั้งชื่อโน้ต',
    x:'พิมพ์ชื่อโน้ตตรงนี้ (อย่างน้อย 3 ตัวอักษร) แล้วเขียนเนื้อหาต่อด้านล่างได้เลย บันทึกให้เองอัตโนมัติ',
    target: () => $id('note-title'),
    done: () => { const e = $id('note-title'); return !!e && e.value.trim().length >= 3; } }
];

function buildLayers(){
  const root = document.createElement('div'); root.className = 'tour-root';
  root.innerHTML = '<div class="tour-dim"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-hole"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  TOUR.layers = { root, dim: root.querySelector('.tour-dim'), blocks: [...root.querySelectorAll('.tour-block')], hole: root.querySelector('.tour-hole'), tip: root.querySelector('.tour-tip') };
}

async function snapshotIds(){
  const n = await sb.from('notes').select('id');
  const r = await sb.from('routines').select('id');
  TOUR.base.notes = n.error ? null : new Set((n.data || []).map(x => x.id));
  TOUR.base.routines = r.error ? null : new Set((r.data || []).map(x => x.id));
}

function startTour(){
  if(TOUR.on) return;
  TOUR.on = true; TOUR.i = 0; TOUR.base = { tasks: new Set(tasksCache.map(t => t.id)), notes:null, routines:null };
  snapshotIds();
  buildLayers();
  document.addEventListener('keydown', onTourKey, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  if(currentView !== 'home') switchView('home');
  showStep(0);
}
function endTour(){
  TOUR.on = false; clearInterval(TOUR.timer); TOUR.token++;
  document.removeEventListener('keydown', onTourKey, true);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
  if(TOUR.layers){ TOUR.layers.root.remove(); TOUR.layers = null; }
  saveState({ welcomed:true });
}
function onTourKey(e){ if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); endTour(); } }

async function showStep(i){
  clearInterval(TOUR.timer);
  const my = ++TOUR.token;
  while(STEPS[i] && STEPS[i].skipIf && STEPS[i].skipIf()) i++;
  if(i >= STEPS.length) return renderOutro();
  TOUR.i = i; TOUR.locked = false; TOUR.scrolled = false;
  const s = STEPS[i];
  if(s.view && currentView !== s.view) switchView(s.view);
  renderTip(s, true);
  TOUR.st = s.init ? await s.init() : {};
  if(!TOUR.on || my !== TOUR.token) return;
  TOUR.timer = setInterval(tick, 250);
  tick();
}
function renderTip(s, fresh){
  const tip = TOUR.layers.tip;
  const active = STEPS.filter(x => !(x.skipIf && x.skipIf()));   // ไม่นับขั้นที่ถูกข้าม (เช่น ไม่มีหน้า Routine)
  const total = active.length, n = active.indexOf(s) + 1;
  tip.classList.remove('center');
  tip.innerHTML = `
    <div class="tour-step">ขั้น ${n}/${total}</div>
    <div class="tour-prog"><i style="width:${Math.round((n-1)/total*100)}%"></i></div>
    <h4>${s.t}</h4><p>${s.x}</p>
    <div class="tour-miss" hidden>ยังไม่เจอปุ่มนี้ในหน้านี้ ข้ามขั้นนี้ได้เลย</div>
    <div class="tour-ok" hidden>✓ ทำได้แล้ว!</div>
    <div class="tour-actions"><button type="button" class="tour-btn" data-t="exit">ออกจากการสอน</button><button type="button" class="tour-btn pri" data-t="skip">ข้ามขั้นนี้</button></div>`;
  tip.querySelector('[data-t="exit"]').addEventListener('click', endTour);
  tip.querySelector('[data-t="skip"]').addEventListener('click', () => showStep(TOUR.i + 1));
  TOUR.layers.hole.classList.remove('ok');
}
function tick(){
  if(!TOUR.on || TOUR.locked) return;
  const s = STEPS[TOUR.i]; if(!s) return;
  let ok = false; try{ ok = s.done(TOUR.st); }catch(e){}
  if(ok){ complete(s); return; }
  place();
}
function complete(s){
  TOUR.locked = true; clearInterval(TOUR.timer);
  const L = TOUR.layers; L.hole.classList.add('ok');
  const ok = L.tip.querySelector('.tour-ok'); if(ok) ok.hidden = false;
  const miss = L.tip.querySelector('.tour-miss'); if(miss) miss.hidden = true;
  if(s.onDone) try{ s.onDone(); }catch(e){}
  const my = TOUR.token;
  setTimeout(() => { if(TOUR.on && my === TOUR.token) showStep(TOUR.i + 1); }, 900);
}
function placeTip(rect){
  const tip = TOUR.layers.tip, vw = innerWidth, vh = innerHeight, m = 12;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let top, left;
  if(!rect){ top = (vh - h) / 2; left = (vw - w) / 2; }
  else if(rect.height > vh * 0.55){
    if(vw >= 860){
      if(rect.right + 16 + w <= vw - m) left = rect.right + 16;
      else if(rect.left - 16 - w >= m) left = rect.left - 16 - w;
      else left = vw - w - m;
      top = clamp(rect.top, m, vh - h - m);
    } else { top = m; left = (vw - w) / 2; }
  } else {
    const below = rect.bottom + 14, above = rect.top - 14 - h;
    top = below + h <= vh - m ? below : (above >= m ? above : m);
    left = clamp(rect.left + rect.width / 2 - w / 2, m, vw - w - m);
  }
  tip.style.top = Math.round(top) + 'px'; tip.style.left = Math.round(left) + 'px';
}
function place(){
  if(!TOUR.on || !TOUR.layers) return;
  const s = STEPS[TOUR.i]; if(!s) return;
  const L = TOUR.layers;
  const el = s.target ? s.target() : null;
  const vis = el && el.getClientRects().length > 0;
  const miss = L.tip.querySelector('.tour-miss');
  if(!vis){
    L.hole.style.display = 'none'; L.blocks.forEach(b => b.style.display = 'none'); L.dim.style.display = 'block';
    if(miss && !TOUR.locked) miss.hidden = false;
    placeTip(null); return;
  }
  L.dim.style.display = 'none'; if(miss) miss.hidden = true;
  if(!TOUR.scrolled){
    TOUR.scrolled = true;
    const r0 = el.getBoundingClientRect();
    if(r0.top < 70 || r0.bottom > innerHeight - 20) el.scrollIntoView({ block:'center', behavior:'smooth' });
  }
  const r = el.getBoundingClientRect(), pad = 6;
  const rect = { top:r.top - pad, left:r.left - pad, width:r.width + pad*2, height:r.height + pad*2 };
  rect.right = rect.left + rect.width; rect.bottom = rect.top + rect.height;
  Object.assign(L.hole.style, { display:'block', top:rect.top+'px', left:rect.left+'px', width:rect.width+'px', height:rect.height+'px' });
  const tall = rect.height > innerHeight * 0.55;
  const vw = innerWidth, vh = innerHeight;
  const geo = [
    [0, 0, vw, Math.max(0, rect.top)],
    [0, rect.bottom, vw, Math.max(0, vh - rect.bottom)],
    [0, rect.top, Math.max(0, rect.left), rect.height],
    [rect.right, rect.top, Math.max(0, vw - rect.right), rect.height]
  ];
  L.blocks.forEach((b, k) => {
    if(tall){ b.style.display = 'none'; return; }
    Object.assign(b.style, { display:'block', left:geo[k][0]+'px', top:geo[k][1]+'px', width:geo[k][2]+'px', height:geo[k][3]+'px' });
  });
  placeTip(rect);
}

/* ---------- จบการสอน ---------- */
async function renderOutro(){
  clearInterval(TOUR.timer);
  const L = TOUR.layers; if(!L) return;
  L.hole.style.display = 'none'; L.blocks.forEach(b => b.style.display = 'none'); L.dim.style.display = 'block';
  await saveState({ welcomed:true, tourDone:true });
  const nT = tasksCache.filter(t => !TOUR.base.tasks.has(t.id)).length;
  const nr = await sb.from('notes').select('id'), rr = await sb.from('routines').select('id');
  const nN = (TOUR.base.notes && !nr.error) ? (nr.data || []).filter(x => !TOUR.base.notes.has(x.id)).length : 0;
  const nR = (TOUR.base.routines && !rr.error) ? (rr.data || []).filter(x => !TOUR.base.routines.has(x.id)).length : 0;
  const made = [nT && `งาน ${nT}`, nN && `โน้ต ${nN}`, nR && `ลูทีน ${nR}`].filter(Boolean).join(' · ');
  const tip = L.tip; tip.classList.add('center');
  tip.innerHTML = `
    <h4>เยี่ยมมาก! 🎉 คุณใช้ DoWork เป็นแล้ว</h4>
    <p>ลืมวิธีใช้เมื่อไหร่ กดปุ่ม <b>“?”</b> ที่แถบด้านบน แล้วเลือก “พาทำให้ดู” ได้เสมอ</p>
    ${made ? `<p class="tour-made">สิ่งที่สร้างตอนลองทำ (เป็นข้อมูลจริง): ${made}</p>` : ''}
    <div class="tour-actions">
      ${made ? '<button type="button" class="tour-btn" data-t="clean">ลบสิ่งที่สร้างตอนลองทำ</button>' : ''}
      <button type="button" class="tour-btn pri" data-t="keep">${made ? 'เก็บไว้' : 'เสร็จสิ้น'}</button>
    </div>`;
  placeTip(null);
  tip.querySelector('[data-t="keep"]').addEventListener('click', () => { endTour(); });
  const cb = tip.querySelector('[data-t="clean"]');
  if(cb) cb.addEventListener('click', async () => { cb.disabled = true; cb.textContent = 'กำลังลบ…'; await cleanup(); });
}
async function cleanup(){
  const b = TOUR.base;
  const tids = tasksCache.filter(t => !b.tasks.has(t.id)).map(t => t.id);
  const nr = await sb.from('notes').select('id'), rr = await sb.from('routines').select('id');
  const nids = (b.notes && !nr.error) ? (nr.data || []).map(x => x.id).filter(id => !b.notes.has(id)) : [];
  const rids = (b.routines && !rr.error) ? (rr.data || []).map(x => x.id).filter(id => !b.routines.has(id)) : [];
  if(tids.length){ await sb.from('task_notes').delete().in('task_id', tids); await sb.from('tasks').delete().in('id', tids); }
  if(nids.length) await sb.from('notes').delete().in('id', nids);
  if(rids.length){ await sb.from('routine_logs').delete().in('routine_id', rids); await sb.from('routines').delete().in('id', rids); }
  showToast('ลบสิ่งที่สร้างตอนลองทำแล้ว');
  setTimeout(() => location.reload(), 600);
}

/* ---------- เริ่มทำงานเมื่อโหลดข้อมูลแล้ว ---------- */
async function maybeInit(){
  if(!currentUser || initedFor === currentUser.id) return;
  initedFor = currentUser.id; uid = currentUser.id;
  try{ await loadState(); }catch(e){ state = readLocal(); }
  loaded = true;
  if(!state.welcomed){
    if(tasksCache.length > 0){ await saveState({ welcomed:true }); }   // ผู้ใช้เดิม: ไม่รบกวน
    else setTimeout(() => openGuide('welcome'), 450);
  }
}

const _lt = loadTasks;
loadTasks = async function(){ await _lt.apply(this, arguments); await maybeInit(); };

// ปุ่ม ? เปิดคู่มือได้ทันทีเสมอ ไม่ต้องรอข้อมูลโหลด
const helpBtn = $id('help-btn');
if(helpBtn) helpBtn.addEventListener('click', () => {
  if(TOUR.on) return;
  if(currentUser && !uid) uid = currentUser.id;
  openGuide('help');
  if(!loaded && currentUser && initedFor !== currentUser.id) loadTasks();
});

// ไฟล์นี้อาจโหลดช้ากว่าการโหลดงานครั้งแรก — ถ้าพลาดรอบแรก ให้เริ่มเองหลังจากนี้
sb.auth.onAuthStateChange((ev, session) => {
  if(session && session.user){
    if(!loaded) setTimeout(() => { if(!loaded && currentUser && initedFor !== currentUser.id) loadTasks(); }, 900);
  } else {
    if(TOUR.on) endTour();
    initedFor = null; loaded = false; state = {}; uid = null;
  }
});
})();
