/* DoWork — Note module (หน้าโน้ตแบบ OneNote: สมุด · รายการ · ที่เขียน)
   วางไว้ข้าง index.html · ต้องรัน note_setup.sql ใน Supabase ก่อน */
(function(){
'use strict';
const N = { books:[], notes:[], selBook:'', selId:null, q:'', loaded:false, error:null };
const COLORS = ['#4A74D0','#5FB46A','#F0644D','#FFC53D','#F4A58F','#8A6FD8'];
let built = false, saveTimer = null, dirty = false;
const view = document.getElementById('note-view');
const $id = id => document.getElementById(id);

/* ---------- sanitize (เก็บเฉพาะแท็กที่ใช้ในโน้ต) ---------- */
const ALLOWED = new Set(['B','STRONG','I','EM','U','H2','H3','P','DIV','BR','UL','OL','LI','A','SPAN','INPUT']);
const DROP = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','FORM','TEXTAREA','SELECT','BUTTON','IMG','SVG','VIDEO','AUDIO']);
function cleanNode(node){
  Array.from(node.childNodes).forEach(ch=>{
    if(ch.nodeType === 3) return;
    if(ch.nodeType !== 1){ ch.remove(); return; }
    const tag = ch.tagName;
    if(DROP.has(tag)){ ch.remove(); return; }
    if(!ALLOWED.has(tag)){
      cleanNode(ch);
      while(ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
      ch.remove(); return;
    }
    Array.from(ch.attributes).forEach(a=>{
      const n = a.name;
      if(tag==='A' && n==='href'){ if(!/^(https?:|mailto:)/i.test(a.value.trim())) ch.removeAttribute(n); return; }
      if(n === 'class'){
        const keep = a.value.split(/\s+/).filter(c=>c==='ck'||c==='ck-text');
        if(keep.length) ch.setAttribute('class', keep.join(' ')); else ch.removeAttribute('class');
        return;
      }
      if(tag==='INPUT' && (n==='type' || n==='checked')) return;
      ch.removeAttribute(n);
    });
    if(tag === 'INPUT'){
      if(ch.getAttribute('type') !== 'checkbox'){ ch.remove(); return; }
      ch.setAttribute('contenteditable','false');
    }
    if(tag === 'A'){ ch.setAttribute('target','_blank'); ch.setAttribute('rel','noopener noreferrer'); }
    cleanNode(ch);
  });
}
function sanitize(html){
  const d = new DOMParser().parseFromString('<body>'+(html||'')+'</body>','text/html');
  cleanNode(d.body);
  return d.body.innerHTML;
}
function textOf(html){
  const d = new DOMParser().parseFromString('<body>'+(html||'')+'</body>','text/html');
  return d.body.textContent.replace(/\s+/g,' ').trim();
}
const prep = n => { n.content = sanitize(n.content); n._text = textOf(n.content); return n; };

/* ---------- helpers ---------- */
function fmtShort(iso){
  const d = new Date(iso), t = new Date();
  return d.toDateString()===t.toDateString()
    ? d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})
    : d.toLocaleDateString('th-TH',{day:'numeric',month:'short'});
}
function fmtLong(iso){
  const d = new Date(iso), t = new Date();
  const time = d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  return d.toDateString()===t.toDateString() ? 'วันนี้ '+time : d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})+' '+time;
}
function groupOf(n){
  if(n.pinned) return '📌 ปักหมุด';
  const d = new Date(n.updated_at || n.created_at), t = new Date();
  const days = (new Date(t.getFullYear(),t.getMonth(),t.getDate()) - new Date(d.getFullYear(),d.getMonth(),d.getDate())) / 864e5;
  if(days <= 0) return 'วันนี้';
  if(days < 7) return '7 วันที่ผ่านมา';
  return 'ก่อนหน้านี้';
}
const current = () => N.notes.find(n=>n.id===N.selId) || null;
function visible(){
  const q = N.q.trim().toLowerCase();
  return N.notes.filter(n=>{
    if(N.selBook && n.notebook_id !== N.selBook) return false;
    if(q && !((n.title||'').toLowerCase().includes(q) || n._text.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b)=>{
    if(!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

/* ---------- data ---------- */
async function load(){
  const [b, n] = await Promise.all([
    sb.from('note_notebooks').select('*').order('sort_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true}),
    sb.from('notes').select('*').order('updated_at',{ascending:false})
  ]);
  if(b.error || n.error){ N.error = (b.error || n.error).message; }
  else {
    N.error = null; N.books = b.data || []; N.notes = (n.data || []).map(prep);
    if(!current()){ const v = visible(); N.selId = v.length ? v[0].id : null; }
  }
  N.loaded = true;
  if(currentView === 'note') render();
}

/* ---------- save (อัตโนมัติ) ---------- */
function setStatus(msg, bad){
  const el = $id('note-saved'); if(!el) return;
  el.textContent = msg; el.classList.toggle('bad', !!bad);
}
function scheduleSave(){
  if(!current()) return;
  dirty = true; setStatus('กำลังบันทึก…');
  clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 700);
}
async function flushSave(){
  clearTimeout(saveTimer);
  const n = current(), titleEl = $id('note-title'), docEl = $id('note-doc');
  if(!dirty || !n || !titleEl || !docEl) return;
  dirty = false;
  const title = titleEl.value.trim();
  const content = sanitize(docEl.innerHTML);
  const updated = new Date().toISOString();
  Object.assign(n, { title, content, _text: textOf(content), updated_at: updated });
  renderList();
  const when = $id('note-when'); if(when) when.textContent = 'แก้ไขล่าสุด ' + fmtLong(updated);
  const { error } = await sb.from('notes').update({ title, content, updated_at: updated }).eq('id', n.id);
  if(error){ setStatus('บันทึกไม่สำเร็จ', true); showToast('บันทึกโน้ตไม่สำเร็จ: '+error.message); dirty = true; return; }
  setStatus('✓ บันทึกแล้ว');
}

/* ---------- สมุดโน้ต ---------- */
function renderBooks(){
  const el = $id('nb-list'); if(!el) return;
  const count = id => N.notes.filter(n=> id ? n.notebook_id===id : true).length;
  el.innerHTML = `<div class="nbi ${N.selBook===''?'on':''}" data-id=""><i style="background:#4A74D0"></i><span class="nbn">ทั้งหมด</span><b>${count('')}</b></div>` +
    N.books.map(b=>`<div class="nbi ${N.selBook===b.id?'on':''}" data-id="${b.id}">
      <i style="background:${escapeHtml(b.color||'#4A74D0')}"></i><span class="nbn">${escapeHtml(b.name)}</span>
      <span class="nb-tools"><button type="button" data-act="rename" title="เปลี่ยนชื่อ">✎</button><button type="button" data-act="del" title="ลบสมุด">✕</button></span>
      <b>${count(b.id)}</b></div>`).join('');
  el.querySelectorAll('.nbi').forEach(row=> row.addEventListener('click', async (e)=>{
    const id = row.dataset.id;
    const act = e.target.closest('[data-act]');
    if(act){ e.stopPropagation(); return act.dataset.act==='rename' ? renameBook(id) : deleteBook(id); }
    await flushSave();
    N.selBook = id;
    const v = visible(); if(!v.find(n=>n.id===N.selId)) N.selId = v.length ? v[0].id : null;
    renderBooks(); renderList(); renderEditor();
  }));
}
async function addBook(){
  const name = ((await uiPrompt('สมุดโน้ตใหม่', '', { placeholder:'ชื่อสมุด เช่น งานประจำ', confirmText:'สร้างสมุด' })) || '').trim();
  if(!name) return;
  const max = N.books.reduce((m,b)=>Math.max(m,b.sort_order||0),0);
  const { data, error } = await sb.from('note_notebooks').insert({ user_id: currentUser.id, name, color: COLORS[N.books.length % COLORS.length], sort_order: max+1 }).select().single();
  if(error){ showToast('สร้างสมุดไม่สำเร็จ: '+error.message); return; }
  N.books.push(data); N.selBook = data.id; renderBooks(); renderList(); renderEditor();
  showToast('สร้างสมุดแล้ว 📒');
}
async function renameBook(id){
  const b = N.books.find(x=>x.id===id); if(!b) return;
  const name = ((await uiPrompt('เปลี่ยนชื่อสมุด', b.name, { confirmText:'บันทึก' })) || '').trim();
  if(!name || name === b.name) return;
  const { error } = await sb.from('note_notebooks').update({ name }).eq('id', id);
  if(error){ showToast('เปลี่ยนชื่อไม่สำเร็จ: '+error.message); return; }
  b.name = name; renderBooks(); renderEditor();
}
async function deleteBook(id){
  const b = N.books.find(x=>x.id===id); if(!b) return;
  const n = N.notes.filter(x=>x.notebook_id===id).length;
  if(!await uiConfirm(n ? `โน้ต ${n} รายการในสมุดนี้จะยังอยู่ แต่ไม่อยู่ในสมุดใด` : 'สมุดนี้ยังไม่มีโน้ต', { title:`ลบสมุด "${b.name}"?`, confirmText:'ลบสมุด', danger:true })) return;
  const { error } = await sb.from('note_notebooks').delete().eq('id', id);
  if(error){ showToast('ลบสมุดไม่สำเร็จ: '+error.message); return; }
  N.books = N.books.filter(x=>x.id!==id);
  N.notes.forEach(x=>{ if(x.notebook_id===id) x.notebook_id = null; });
  if(N.selBook === id) N.selBook = '';
  renderBooks(); renderList(); renderEditor();
}

/* ---------- รายการโน้ต ---------- */
function renderList(){
  const el = $id('note-list'); if(!el) return;
  const v = visible();
  if(!v.length){
    el.innerHTML = `<div class="empty-note" style="margin:10px;">${N.q ? 'ไม่พบโน้ตที่ค้นหา' : 'ยังไม่มีโน้ต กด “+ โน้ตใหม่” ได้เลย'}</div>`;
    return;
  }
  let last = '', html = '';
  v.forEach(n=>{
    const g = groupOf(n);
    if(g !== last){ html += `<div class="lab">${g}</div>`; last = g; }
    html += `<div class="ni ${n.id===N.selId?'on':''}" data-id="${n.id}">
      <div class="nt">${escapeHtml(n.title || 'ไม่มีชื่อ')}</div>
      <div class="nd"><span>${fmtShort(n.updated_at)}</span><span class="snip">${escapeHtml(n._text.slice(0,70) || 'ไม่มีข้อความเพิ่มเติม')}</span></div></div>`;
  });
  el.innerHTML = html;
  el.querySelectorAll('.ni').forEach(it=> it.addEventListener('click', ()=> selectNote(it.dataset.id)));
}
async function selectNote(id){
  await flushSave();
  N.selId = id;
  $id('note-layout').classList.add('editing');
  renderList(); renderEditor();
}
async function newNote(){
  await flushSave();
  const { data, error } = await sb.from('notes').insert({ user_id: currentUser.id, notebook_id: N.selBook || null, title:'', content:'' }).select().single();
  if(error){ showToast('สร้างโน้ตไม่สำเร็จ: '+error.message+' (ต้องรัน note_setup.sql ก่อน)'); return; }
  const n = prep(data); N.notes.unshift(n); N.selId = n.id; N.q = '';
  const s = $id('note-search'); if(s) s.value = '';
  $id('note-layout').classList.add('editing');
  renderBooks(); renderList(); renderEditor();
  const t = $id('note-title'); if(t) t.focus();
}
async function deleteNote(){
  const n = current(); if(!n) return;
  if(!await uiConfirm(`"${n.title || 'ไม่มีชื่อ'}" จะถูกลบถาวร ย้อนกลับไม่ได้นะ`, { title:'ลบโน้ตนี้?', confirmText:'ลบโน้ต', danger:true })) return;
  const { error } = await sb.from('notes').delete().eq('id', n.id);
  if(error){ showToast('ลบไม่สำเร็จ: '+error.message); return; }
  dirty = false; N.notes = N.notes.filter(x=>x.id!==n.id);
  const v = visible(); N.selId = v.length ? v[0].id : null;
  $id('note-layout').classList.remove('editing');
  renderBooks(); renderList(); renderEditor(); showToast('ลบโน้ตแล้ว');
}
async function togglePinNote(){
  const n = current(); if(!n) return;
  const pinned = !n.pinned;
  const { error } = await sb.from('notes').update({ pinned }).eq('id', n.id);
  if(error){ showToast('ปักหมุดไม่สำเร็จ: '+error.message); return; }
  n.pinned = pinned; renderList(); renderEditor();
}

/* ---------- ที่เขียน ---------- */
function makeCk(html){
  const d = document.createElement('div'); d.className = 'ck';
  d.innerHTML = '<input type="checkbox" contenteditable="false"><span class="ck-text">'+(html || '<br>')+'</span>';
  return d;
}
function placeCaret(el, atEnd){
  const r = document.createRange(), s = window.getSelection();
  r.selectNodeContents(el); r.collapse(!atEnd); s.removeAllRanges(); s.addRange(r);
}
function insertChecklist(){
  const docEl = $id('note-doc'); docEl.focus();
  const sel = window.getSelection();
  let node = sel.rangeCount ? sel.anchorNode : null;
  if(!node || !docEl.contains(node)) node = null;
  let blk = node && (node.nodeType===3 ? node.parentNode : node);
  while(blk && blk.parentNode !== docEl) blk = blk.parentNode;
  if(!blk || blk === docEl){ const d = makeCk(''); docEl.appendChild(d); placeCaret(d.querySelector('.ck-text'), true); return; }
  if(blk.classList && blk.classList.contains('ck')){
    const p = document.createElement('div'); p.innerHTML = blk.querySelector('.ck-text').innerHTML || '<br>';
    blk.replaceWith(p); placeCaret(p, true); return;
  }
  if(/^(UL|OL)$/.test(blk.tagName)){ const d = makeCk(''); blk.after(d); placeCaret(d.querySelector('.ck-text'), true); return; }
  const d = makeCk(blk.innerHTML === '<br>' ? '' : blk.innerHTML);
  blk.replaceWith(d); placeCaret(d.querySelector('.ck-text'), true);
}
async function exec(cmd){
  const docEl = $id('note-doc'); if(!docEl) return;
  docEl.focus();
  if(cmd === 'bold') document.execCommand('bold');
  else if(cmd === 'italic') document.execCommand('italic');
  else if(cmd === 'h') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase()==='h2' ? 'div' : 'h2');
  else if(cmd === 'ul') document.execCommand('insertUnorderedList');
  else if(cmd === 'check') insertChecklist();
  else if(cmd === 'link'){
    const sel = window.getSelection();
    const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const url = await uiPrompt('เพิ่มลิงก์', '', { placeholder:'วางลิงก์ เช่น https://...', confirmText:'เพิ่มลิงก์' });
    if(!url || !url.trim()) return;
    docEl.focus();
    if(saved){ sel.removeAllRanges(); sel.addRange(saved); }
    document.execCommand('createLink', false, normalizeUrl(url));
  }
  else if(cmd === 'pin') return togglePinNote();
  else if(cmd === 'del') return deleteNote();
  scheduleSave(); toolbarState();
}
function toolbarState(){
  const q = c => { try{ return document.queryCommandState(c); }catch(e){ return false; } };
  const set = (cmd, on)=>{ const b = view.querySelector(`.tbb[data-cmd="${cmd}"]`); if(b) b.classList.toggle('on', !!on); };
  set('bold', q('bold')); set('italic', q('italic')); set('ul', q('insertUnorderedList'));
  let fb = ''; try{ fb = document.queryCommandValue('formatBlock').toLowerCase(); }catch(e){}
  set('h', fb === 'h2');
}
function renderEditor(){
  const ed = $id('note-ed'); if(!ed) return;
  const n = current();
  if(!n){
    ed.innerHTML = `<div class="empty-state" style="border:none;margin:auto;"><div class="blob-big"></div>เลือกโน้ตทางซ้าย หรือสร้างโน้ตใหม่</div>`;
    return;
  }
  ed.innerHTML = `
    <div class="note-tb">
      <button type="button" class="note-back" id="note-back">‹ รายการ</button>
      <button type="button" class="tbb" data-cmd="bold" title="ตัวหนา"><b>B</b></button>
      <button type="button" class="tbb" data-cmd="italic" title="ตัวเอียง"><i>I</i></button>
      <span class="sep"></span>
      <button type="button" class="tbb" data-cmd="h" title="หัวข้อ">H</button>
      <button type="button" class="tbb" data-cmd="ul" title="ลิสต์">• ลิสต์</button>
      <button type="button" class="tbb" data-cmd="check" title="เช็คลิสต์">☑ เช็ค</button>
      <button type="button" class="tbb" data-cmd="link" title="ลิงก์">🔗</button>
      <span class="sep"></span>
      <button type="button" class="tbb ${n.pinned?'on':''}" data-cmd="pin" title="ปักหมุด">📌</button>
      <button type="button" class="tbb" data-cmd="del" title="ลบโน้ต">🗑</button>
      <span class="note-saved" id="note-saved">${dirty ? 'กำลังบันทึก…' : '✓ บันทึกแล้ว'}</span>
    </div>
    <div class="note-doc-wrap">
      <input type="text" class="note-title" id="note-title" maxlength="120" placeholder="ชื่อโน้ต" value="${escapeHtml(n.title||'')}">
      <div class="note-meta">
        <select id="note-nb" aria-label="สมุดโน้ต"><option value="">ไม่มีสมุด</option>${N.books.map(b=>`<option value="${b.id}" ${b.id===n.notebook_id?'selected':''}>${escapeHtml(b.name)}</option>`).join('')}</select>
        <span id="note-when">แก้ไขล่าสุด ${fmtLong(n.updated_at)}</span>
      </div>
      <div class="note-doc" id="note-doc" contenteditable="true" spellcheck="false" data-ph="เริ่มเขียนที่นี่..."></div>
    </div>`;
  const docEl = $id('note-doc');
  docEl.innerHTML = n.content;
  // toolbar
  ed.querySelectorAll('.tbb').forEach(b=>{
    b.addEventListener('mousedown', e=> e.preventDefault());
    b.addEventListener('click', ()=> exec(b.dataset.cmd));
  });
  $id('note-back').addEventListener('click', async ()=>{ await flushSave(); $id('note-layout').classList.remove('editing'); });
  $id('note-title').addEventListener('input', scheduleSave);
  $id('note-title').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); docEl.focus(); } });
  $id('note-nb').addEventListener('change', async (e)=>{
    const id = e.target.value || null;
    const { error } = await sb.from('notes').update({ notebook_id: id }).eq('id', n.id);
    if(error){ showToast('ย้ายโน้ตไม่สำเร็จ: '+error.message); return; }
    n.notebook_id = id;
    if(N.selBook && N.selBook !== id) N.selBook = '';
    renderBooks(); renderList();
  });
  docEl.addEventListener('input', scheduleSave);
  docEl.addEventListener('change', e=>{
    if(e.target.type === 'checkbox'){
      if(e.target.checked) e.target.setAttribute('checked',''); else e.target.removeAttribute('checked');
      scheduleSave();
    }
  });
  docEl.addEventListener('paste', e=>{
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });
  docEl.addEventListener('click', e=>{
    const a = e.target.closest('a');
    if(a && (e.ctrlKey || e.metaKey)){ window.open(a.href, '_blank', 'noopener'); }
  });
  docEl.addEventListener('keydown', e=>{
    const ck = (()=>{ const s = window.getSelection(); if(!s.rangeCount) return null; let nd = s.anchorNode; nd = nd && (nd.nodeType===3 ? nd.parentNode : nd); return nd && nd.closest ? nd.closest('.ck') : null; })();
    if(!ck) return;
    const txt = ck.querySelector('.ck-text');
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      if(!txt.textContent.trim()){ // บรรทัดว่าง: ออกจากเช็คลิสต์
        const p = document.createElement('div'); p.innerHTML = '<br>'; ck.replaceWith(p); placeCaret(p, true);
      } else { const d = makeCk(''); ck.after(d); placeCaret(d.querySelector('.ck-text'), true); }
      scheduleSave();
    } else if(e.key === 'Backspace' && !txt.textContent.length){
      e.preventDefault();
      const p = document.createElement('div'); p.innerHTML = '<br>'; ck.replaceWith(p); placeCaret(p, true); scheduleSave();
    }
  });
  docEl.addEventListener('keyup', toolbarState);
  docEl.addEventListener('mouseup', toolbarState);
}

/* ---------- หน้าจอหลัก ---------- */
function build(){
  view.innerHTML = `
    <div class="note-layout" id="note-layout">
      <aside class="pane note-nb"><h4>สมุดโน้ต</h4><div id="nb-list"></div><button type="button" class="nb-add" id="nb-add">+ สมุดใหม่</button></aside>
      <section class="pane note-list">
        <div class="note-list-head">
          <input type="text" class="note-search" id="note-search" placeholder="ค้นหาโน้ต...">
          <button type="button" class="btn-add wide" id="note-new">+ โน้ตใหม่</button>
        </div>
        <div class="note-list-scroll" id="note-list"></div>
      </section>
      <section class="pane note-ed" id="note-ed"></section>
    </div>`;
  $id('nb-add').addEventListener('click', addBook);
  $id('note-new').addEventListener('click', newNote);
  $id('note-search').addEventListener('input', e=>{ N.q = e.target.value; renderList(); });
  built = true;
}
function render(){
  if(!N.loaded){ view.innerHTML = '<div class="empty-note">กำลังโหลดโน้ต...</div>'; built = false; return; }
  if(N.error){
    built = false;
    view.innerHTML = `<div class="settings-panel" style="max-width:640px;"><h3>ยังใช้งาน Note ไม่ได้</h3>
      <p class="settings-sub">ยังไม่พบตารางโน้ตใน Supabase — เปิด SQL Editor แล้วรันไฟล์ <b>note_setup.sql</b> หนึ่งครั้ง จากนั้นรีเฟรชหน้านี้</p>
      <div class="auth-error">${escapeHtml(N.error)}</div></div>`;
    return;
  }
  if(!built) build();
  renderBooks(); renderList(); renderEditor();
}

/* ---------- เชื่อมกับระบบเมนู ---------- */
const _sv = switchView;
switchView = function(v){
  if(v !== 'note'){
    view.classList.add('hidden');
    const m = document.querySelector('.main'); if(m) m.classList.remove('wide');
    flushSave();
    return _sv(v);
  }
  currentView = 'note';
  ['home-view','work-view','settings-view','routine-view'].forEach(id=>{ const e = $id(id); if(e) e.classList.add('hidden'); });
  view.classList.remove('hidden');
  document.querySelector('.main').classList.add('wide');
  document.querySelectorAll('.nav-item,.mobile-nav button').forEach(b=>b.classList.toggle('active', b.dataset.view==='note'));
  $id('fab-add').classList.remove('hidden');
  render();
};
window.addEventListener('beforeunload', ()=>{ if(dirty) flushSave(); });

let lastUid = null;
sb.auth.onAuthStateChange((ev, session)=>{
  if(session && session.user){
    if(session.user.id !== lastUid || ev === 'SIGNED_IN'){ lastUid = session.user.id; built = false; load(); }
  } else { lastUid = null; N.books = []; N.notes = []; N.loaded = false; N.selId = null; built = false; }
});
})();
