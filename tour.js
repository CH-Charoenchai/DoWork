/* DoWork — คู่มือเริ่มต้นสำหรับผู้ใช้ใหม่ (กล่องต้อนรับ + เช็คลิสต์บนหน้า Home + ปุ่ม ?)
   วางไว้ข้าง index.html · ถ้ารัน tour_setup.sql จะจำข้ามเครื่องได้ (ไม่รันก็ใช้ได้ จำเฉพาะเครื่องนี้) */
(function(){
'use strict';
const $id = id => document.getElementById(id);
let state = {}, uid = null, initedFor = null, loaded = false, lastCountAt = 0;
const counts = { notes: 0 };

/* ---------- สถานะ (ฐานข้อมูล + เครื่องนี้) ---------- */
const lsKey = () => 'dowork_onb_' + uid;
function readLocal(){ try{ return JSON.parse(localStorage.getItem(lsKey()) || '{}'); }catch(e){ return {}; } }
async function loadState(){
  let db = {};
  for(let i = 0; i < 3; i++){
    const { data, error } = await sb.from('app_settings').select('onboarding').eq('user_id', uid).maybeSingle();
    if(error) break;                       // ยังไม่มีคอลัมน์ → ใช้ค่าในเครื่องแทน
    if(data){ db = data.onboarding || {}; break; }
    await new Promise(r => setTimeout(r, 600));   // รอแถวตั้งค่าของผู้ใช้ใหม่ถูกสร้าง
  }
  state = Object.assign({}, db, readLocal());
}
async function saveState(patch){
  Object.assign(state, patch);
  try{ localStorage.setItem(lsKey(), JSON.stringify(state)); }catch(e){}
  await sb.from('app_settings').update({ onboarding: state }).eq('user_id', uid);
}

/* ---------- เช็คลิสต์ ---------- */
const ITEMS = [
  { k:'task', t:'เพิ่มงานแรกของคุณ', h:'พิมพ์ในช่องเพิ่มงานเร็ว หรือกด “+ งานใหม่”',
    done: () => tasksCache.length > 0,
    go: () => { if(currentView !== 'home') switchView('home'); const i = $id('qa-title'); if(i) i.focus(); } },
  { k:'status', t:'ลองทำงานให้เสร็จ หรือพักไว้', h:'ติ๊กช่องสี่เหลี่ยมหน้างานในหน้า Work หรือเปิดงานแล้วเลือก “พักไว้”',
    done: () => tasksCache.some(t => t.status === 'เสร็จแล้ว' || t.status === HOLD),
    go: () => switchView('work') },
  { k:'note', t:'เขียนโน้ตแรก', h:'หน้า Note จดได้แบบ OneNote แยกเป็นสมุด บันทึกอัตโนมัติ',
    done: () => counts.notes > 0,
    go: () => switchView('note') },
  { k:'photo', t:'ตั้งรูปโปรไฟล์', h:'ไปที่ Settings > โปรไฟล์ แล้วอัปโหลดรูปของคุณ',
    done: () => !!userProfile.avatar,
    go: () => switchView('settings') },
  { k:'shortcut', t:'เพิ่มทางลัดเว็บที่ใช้บ่อย', h:'กด + ที่แถบด้านบน แล้ววางลิงก์เว็บหรือเอกสารที่เปิดบ่อย',
    done: () => userShortcuts.length > 0,
    go: () => { if(typeof showShortcutAddForm === 'function') showShortcutAddForm(); } }
];

async function refreshCounts(){
  const r = await sb.from('notes').select('id', { count:'exact', head:true });
  const n = (!r.error && typeof r.count === 'number') ? r.count : 0;
  if(n !== counts.notes){ counts.notes = n; renderCard(); }
}

function renderCard(){
  const host = $id('home-view');
  if(!host || currentView !== 'home') return;
  let card = host.querySelector('.onb-card');
  if(!loaded || state.hidden){ if(card) card.remove(); return; }
  const done = ITEMS.filter(i => i.done()).length, all = done === ITEMS.length;
  if(!card){
    card = document.createElement('div'); card.className = 'onb-card';
    const hdr = host.querySelector('.view-header');
    if(hdr) hdr.after(card); else host.prepend(card);
  }
  card.innerHTML = all ? `
    <div class="onb-head"><div><h3>ครบแล้ว! 🎉 คุณพร้อมใช้ DoWork เต็มรูปแบบ</h3>
      <div class="onb-sub">ลืมวิธีใช้เมื่อไหร่ กดปุ่ม “?” ที่แถบด้านบนเพื่อเปิดคู่มือได้เสมอ</div></div>
      <button type="button" class="onb-hide" data-act="hide">ปิดการ์ด</button></div>` : `
    <div class="onb-head"><div><h3>เริ่มต้นใช้งาน DoWork</h3>
      <div class="onb-sub">ทำครบ ${ITEMS.length} ข้อ แล้วคุณจะใช้เป็นทุกส่วน · ${done}/${ITEMS.length}</div></div>
      <button type="button" class="onb-hide" data-act="hide" title="ซ่อนการ์ดนี้ (เปิดกลับได้จากปุ่ม ?)">ซ่อน</button></div>
    <div class="onb-bar"><i style="width:${Math.round(done/ITEMS.length*100)}%"></i></div>
    <div class="onb-list">${ITEMS.map(i=>`
      <button type="button" class="onb-item ${i.done()?'done':''}" data-k="${i.k}">
        <span class="onb-box">✓</span>
        <span><b>${i.t}</b><i>${i.h}</i></span><span class="onb-go">›</span>
      </button>`).join('')}</div>`;
  card.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', ()=>{
    const it = ITEMS.find(x => x.k === b.dataset.k); if(it) it.go();
  }));
  const hide = card.querySelector('[data-act="hide"]');
  if(hide) hide.addEventListener('click', async ()=>{ await saveState({ hidden:true }); renderCard(); });
}

/* ---------- กล่องต้อนรับ / คู่มือ ---------- */
function openGuide(mode){
  const help = mode === 'help';
  const name = (userProfile && userProfile.name) || (currentUser && currentUser.user_metadata && currentUser.user_metadata.display_name) || '';
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay ui-dialog';
  ov.innerHTML = `
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
          <div class="guide-row"><span class="guide-ic">📝</span><div><b>Note</b><span class="t">จดโน้ตแบบ OneNote แยกเป็นสมุด บันทึกให้อัตโนมัติ</span></div></div>
          <div class="guide-row"><span class="guide-ic">🔗</span><div><b>ทางลัด</b><span class="t">เก็บลิงก์เว็บหรือเอกสารที่เปิดบ่อยไว้ที่แถบด้านบน</span></div></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" data-g="close">${help ? 'ปิด' : 'ข้ามไปก่อน'}</button>
          <button type="button" class="btn-submit" data-g="go">${help ? 'ดูเช็คลิสต์เริ่มต้น' : 'เริ่มเลย'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const goBtn = ov.querySelector('[data-g="go"]');
  async function close(go){
    document.removeEventListener('keydown', onKey, true);
    ov.remove();
    if(prev && prev.focus) try{ prev.focus(); }catch(e){}
    const patch = {};
    if(!state.welcomed) patch.welcomed = true;
    if(go && state.hidden) patch.hidden = false;      // เปิดการ์ดเช็คลิสต์กลับมา
    if(Object.keys(patch).length) await saveState(patch);
    if(go){ if(currentView !== 'home') switchView('home'); else renderCard(); renderCard(); const c = document.querySelector('.onb-card'); if(c) c.scrollIntoView({ behavior:'smooth', block:'start' }); }
  }
  function onKey(e){
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(false); }
    else if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); close(true); }
  }
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', e => { if(e.target === ov) close(false); });
  ov.querySelector('[data-g="close"]').addEventListener('click', () => close(false));
  goBtn.addEventListener('click', () => close(true));
  goBtn.focus();
}

/* ---------- เริ่มทำงานเมื่อโหลดข้อมูลแล้ว ---------- */
async function maybeInit(){
  if(!currentUser) return;
  if(initedFor === currentUser.id){ renderCard(); return; }
  initedFor = currentUser.id; uid = currentUser.id;
  await loadState();
  loaded = true;
  if(!state.welcomed){
    if(tasksCache.length > 0){ await saveState({ welcomed:true, hidden:true }); }   // ผู้ใช้เดิม: ไม่รบกวน
    else setTimeout(() => openGuide('welcome'), 450);
  }
  renderCard(); refreshCounts();
}

const _lt = loadTasks;
loadTasks = async function(){ await _lt.apply(this, arguments); maybeInit(); };

const _rh = renderHome;
renderHome = function(){
  _rh.apply(this, arguments);
  renderCard();
  const now = Date.now();
  if(loaded && now - lastCountAt > 4000){ lastCountAt = now; refreshCounts(); }
};

const helpBtn = $id('help-btn');
if(helpBtn) helpBtn.addEventListener('click', () => openGuide('help'));

sb.auth.onAuthStateChange((ev, session) => {
  if(!(session && session.user)){ initedFor = null; loaded = false; state = {}; counts.notes = 0; }
});
})();
