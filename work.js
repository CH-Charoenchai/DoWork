// ---------- RENDER: WORK VIEW ----------
let workSearch = '', workCategoryFilter = '', workStatusFilter = '';

// การพับ/แสดงส่วน "พักไว้" และ "เสร็จแล้ว" (จำค่าไว้ในเบราว์เซอร์)
const WORK_SHOW_KEY = 'dowork_work_sections';
let workShow = { hold:false, done:false };
try{ Object.assign(workShow, JSON.parse(localStorage.getItem(WORK_SHOW_KEY) || '{}')); }catch(e){}
function saveWorkShow(){ try{ localStorage.setItem(WORK_SHOW_KEY, JSON.stringify(workShow)); }catch(e){} }

const WORK_STATUS_CHIPS = [
  { val:'', label:'ทั้งหมด' },
  { val:'ยังไม่ทำ', label:'ยังไม่ทำ' },
  { val:'กำลังทำ', label:'กำลังทำ' },
  { val:HOLD, label:'พักไว้' },
  { val:'เสร็จแล้ว', label:'เสร็จแล้ว' }
];

function renderWork(){
  const el = $('#work-view');
  const cats = new Set(DEFAULT_CATEGORIES);
  tasksCache.forEach(t=>cats.add(t.category));

  el.innerHTML = `
    <div class="view-header">
      <div><h1>Work</h1><div class="view-sub">ลากเพื่อจัดลำดับ · กดช่องสี่เหลี่ยมเพื่อทำเสร็จ</div></div>
      <div class="toolbar" style="margin:0;">
        <input type="text" id="work-search" placeholder="ค้นหางาน..." value="${escapeHtml(workSearch)}">
        <select id="work-cat-filter">
          <option value="">ทุกหมวดหมู่</option>
          ${[...cats].map(c=>`<option value="${escapeHtml(c)}" ${c===workCategoryFilter?'selected':''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="chip-row" id="work-chips"></div>
    <div class="quick-add">
      <input type="text" id="work-qa-title" placeholder="+ เพิ่มงานใหม่ แล้วกด Enter...">
      <select id="work-qa-cat" aria-label="หมวดหมู่">${allKnownCategories().map(c=>`<option value="${escapeHtml(c)}" ${c===(workCategoryFilter||getLastCat())?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
      <button type="button" class="btn-add" id="work-qa-btn">เพิ่ม</button>
    </div>
    <div id="work-lists"></div>
  `;

  $('#work-search').addEventListener('input', (e)=>{ workSearch = e.target.value; renderWorkLists(); });
  $('#work-cat-filter').addEventListener('change', (e)=>{ workCategoryFilter = e.target.value; renderWorkLists(); });
  const qa = $('#work-qa-title');
  const doAdd = async ()=>{ const ok = await quickAddTask(qa.value, $('#work-qa-cat').value); if(ok){ const n = $('#work-qa-title'); if(n) n.focus(); } };
  $('#work-qa-btn').addEventListener('click', doAdd);
  qa.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); doAdd(); } });

  renderWorkLists();
}

function sortForDisplay(list){
  return [...list].sort((a,b)=>{
    const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
    if(pa !== pb) return pb - pa;
    const sa = a.sort_order ?? 0, sb2 = b.sort_order ?? 0;
    if(sa !== sb2) return sa - sb2;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

function statusGroup(t){
  return t.status==='เสร็จแล้ว' ? 'done' : (t.status===HOLD ? 'hold' : 'active');
}

function collapsibleSection(key, title, cls, list, emptyMsg, force){
  const open = force || workShow[key];
  const btn = force ? '' : `<button type="button" class="section-toggle" data-sec="${key}">${open?'ซ่อน':'แสดง'}</button>`;
  let h = `<div class="section-title ${cls}">${title} <span class="count-pill">${list.length}</span>${btn}</div>`;
  if(open){
    h += list.length ? `<div class="task-list" data-group="${key}">${list.map(taskCardHtml).join('')}</div>` : emptyStateHtml(emptyMsg);
  }
  return h;
}

function renderWorkChips(base){
  const el = $('#work-chips');
  if(!el) return;
  el.innerHTML = WORK_STATUS_CHIPS.map(c=>{
    const n = c.val ? base.filter(t=>t.status===c.val).length : base.length;
    return `<button type="button" class="chip ${workStatusFilter===c.val?'on':''}" data-st="${escapeHtml(c.val)}">${c.label} ${n}</button>`;
  }).join('');
  $all('#work-chips .chip').forEach(b=> b.addEventListener('click', ()=>{
    workStatusFilter = b.dataset.st;
    renderWorkLists();
  }));
}

function renderWorkLists(){
  updateWorkBadge();
  if(!$('#work-lists')) return;
  const q = workSearch.trim().toLowerCase();
  // ฐานสำหรับตัวเลขบนปุ่มกรอง = ผลค้นหา + หมวดหมู่ (ยังไม่กรองสถานะ)
  const base = tasksCache.filter(t=>{
    if(q && !t.title.toLowerCase().includes(q)) return false;
    if(workCategoryFilter && t.category !== workCategoryFilter) return false;
    return true;
  });
  renderWorkChips(base);

  let html = '';
  if(workStatusFilter){
    // เลือกสถานะเดียว: แสดงเป็นลิสต์เดียวแบบเปิดเต็ม
    const list = sortForDisplay(base.filter(t=>t.status===workStatusFilter));
    const grp = statusGroup({ status: workStatusFilter });
    html = list.length
      ? `<div class="task-list" data-group="${grp}">${list.map(taskCardHtml).join('')}</div>`
      : emptyStateHtml('ไม่มีงานในสถานะนี้');
  } else {
    const active = sortForDisplay(base.filter(t=>statusGroup(t)==='active'));
    const hold = sortForDisplay(base.filter(t=>statusGroup(t)==='hold'));
    const done = sortForDisplay(base.filter(t=>statusGroup(t)==='done'));
    // ถ้ากำลังค้นหาหรือกรองหมวดหมู่ ให้เปิดส่วนที่พับไว้อัตโนมัติ
    const force = !!(q || workCategoryFilter);

    html = `<div class="section-title">ยังไม่เสร็จ <span class="count-pill">${active.length}</span></div>`;
    html += active.length ? `<div class="task-list" data-group="active">${active.map(taskCardHtml).join('')}</div>` : emptyStateHtml(tasksCache.length ? 'ไม่มีงานค้าง เยี่ยมมาก! 🎉' : 'ยังไม่มีงาน — พิมพ์ชื่องานในช่องด้านบนแล้วกด Enter ได้เลย');
    if(hold.length) html += collapsibleSection('hold', 'พักไว้', 'hold', hold, 'ไม่มีงานที่พักไว้', force);
    html += collapsibleSection('done', 'เสร็จแล้ว', 'done', done, 'ยังไม่มีงานที่เสร็จในตอนนี้', force);
  }

  $('#work-lists').innerHTML = html;
  $all('.section-toggle').forEach(btn=> btn.addEventListener('click', ()=>{
    workShow[btn.dataset.sec] = !workShow[btn.dataset.sec];
    saveWorkShow();
    renderWorkLists();
  }));
  $all('.task-card').forEach(card=> card.addEventListener('click', (e)=>{
    if(e.target.closest('.pin-btn') || e.target.closest('.drag-handle') || e.target.closest('.task-check')) return;
    openTaskModal(card.dataset.id);
  }));
  $all('.pin-btn').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    togglePin(btn.dataset.id);
  }));
  $all('.task-check').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    setTaskStatus(btn.dataset.id, btn.classList.contains('on') ? 'ยังไม่ทำ' : 'เสร็จแล้ว');
  }));
  wireDragAndDrop();
}

async function togglePin(taskId){
  const t = tasksCache.find(x=>x.id===taskId);
  if(!t) return;
  const newVal = !t.pinned;
  const { error } = await sb.from('tasks').update({pinned:newVal}).eq('id', taskId);
  if(error){ showToast('อัปเดตไม่สำเร็จ: '+error.message); return; }
  t.pinned = newVal;
  renderWorkLists();
  if(currentView==='home') renderHome();
  showToast(newVal ? 'ติดดาวแล้ว ⭐' : 'เอาดาวออกแล้ว');
}

// ---------- DRAG & DROP REORDER ----------
let dragSrcId = null;

function wireDragAndDrop(){
  $all('.task-card').forEach(card=>{
    card.addEventListener('dragstart', (e)=>{
      dragSrcId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', card.dataset.id); }catch(err){}
    });
    card.addEventListener('dragend', ()=>{
      card.classList.remove('dragging');
      $all('.task-card').forEach(c=>c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e)=>{
      e.preventDefault();
      if(card.dataset.id === dragSrcId) return;
      card.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('dragleave', ()=> card.classList.remove('drag-over'));
    card.addEventListener('drop', async (e)=>{
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId = card.dataset.id;
      if(!dragSrcId || dragSrcId === targetId) return;
      const list = card.closest('.task-list');
      if(!list) return;
      await reorderWithinList(list, dragSrcId, targetId);
      dragSrcId = null;
    });
  });
}

async function reorderWithinList(listEl, srcId, targetId){
  const groupName = listEl.dataset.group;
  const q = workSearch.trim().toLowerCase();
  let filtered = tasksCache.filter(t=>{
    if(q && !t.title.toLowerCase().includes(q)) return false;
    if(workCategoryFilter && t.category !== workCategoryFilter) return false;
    if(workStatusFilter && t.status !== workStatusFilter) return false;
    return statusGroup(t) === groupName;
  });
  let ordered = sortForDisplay(filtered).map(t=>t.id);
  const srcIdx = ordered.indexOf(srcId);
  const targetIdx = ordered.indexOf(targetId);
  if(srcIdx===-1 || targetIdx===-1) return;
  ordered.splice(srcIdx, 1);
  const insertAt = ordered.indexOf(targetId);
  ordered.splice(insertAt, 0, srcId);

  const updates = ordered.map((id, i)=> ({ id, sort_order: i + 1 }));
  updates.forEach(u=>{
    const t = tasksCache.find(x=>x.id===u.id);
    if(t) t.sort_order = u.sort_order;
  });
  renderWorkLists();

  for(const u of updates){
    const { error } = await sb.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id);
    if(error){ showToast('บันทึกลำดับไม่สำเร็จ: '+error.message); return; }
  }
  showToast('จัดลำดับแล้ว');
}

function emptyStateHtml(msg){
  return `<div class="empty-state"><div class="blob-big"></div>${msg}</div>`;
}

function taskCardHtml(t){
  const onHold = t.status === HOLD;
  const overdue = isOverdue(t);
  const done = t.status === 'เสร็จแล้ว';
  const note = latestNoteByTask[t.id];
  const catColor = colorForCategory(t.category);
  return `
    <div class="task-card ${done?'done':''} ${onHold?'on-hold':''} ${t.pinned?'pinned':''}" data-id="${t.id}" draggable="true">
      <span class="drag-handle" title="ลากเพื่อจัดลำดับ">⠿</span>
      <button type="button" class="task-check ${done?'on':''}" data-id="${t.id}" title="${done?'ยกเลิกเสร็จ':'ทำเสร็จ'}" aria-label="${done?'ยกเลิกเสร็จ':'ทำเสร็จ'}">${done?'✓':''}</button>
      <button type="button" class="pin-btn ${t.pinned?'active':''}" data-id="${t.id}" title="${t.pinned?'เอาดาวออก':'ติดดาว'}">${t.pinned?'★':'☆'}</button>
      ${moodDot(t)}
      <div class="task-body">
        <div class="task-title-row">
          <span class="task-title ${done?'strike':''}">${escapeHtml(t.title)}</span>
          <span class="tag tag-cat" style="background:${catColor}22;color:${catColor};">${escapeHtml(t.category)}</span>
        </div>
        ${note ? `<div class="task-note-preview"><span class="note-preview-icon">📝</span><span class="note-preview-text">${escapeHtml(note.content)}</span></div>` : ''}
      </div>
      <div class="task-side">
        <span class="status-pill ${STATUS_CLASS[t.status]}">${t.status}</span>
        ${t.deadline ? `<span class="deadline-badge ${overdue?'overdue':''}">${overdue?'⚠ ':''}${fmtDate(t.deadline)}</span>` : ''}
        ${(t.links && t.links.length) ? `<span class="link-count-badge">🔗 ${t.links.length}</span>` : ''}
      </div>
    </div>
  `;
}

// ---------- TOP NAV BADGE: จำนวนงานค้าง (ไม่นับงานเสร็จและงานที่พักไว้) ----------
(function(){
  const btn = document.querySelector('.nav-item[data-view="work"]');
  if(btn && !document.getElementById('work-badge')){
    btn.insertAdjacentHTML('beforeend','<span id="work-badge" class="hidden" style="margin-left:8px;background:var(--coral-soft);color:var(--coral);font-size:11px;font-family:var(--font-mono);padding:2px 8px;border-radius:999px;"></span>');
  }
  // อัปเดต badge ทุกครั้งที่โหลดงานใหม่หรือแก้ไขฟิลด์งาน (เช่น เปลี่ยนสถานะ)
  const _lt = loadTasks;
  loadTasks = async function(){ await _lt.apply(this, arguments); updateWorkBadge(); };
  const _uf = updateTaskField;
  updateTaskField = async function(){ await _uf.apply(this, arguments); updateWorkBadge(); };
})();

function updateWorkBadge(){
  const n = tasksCache.filter(t=>t.status!=='เสร็จแล้ว' && t.status!==HOLD).length;
  const b = document.getElementById('work-badge');
  if(b){ b.textContent = n; b.classList.toggle('hidden', !n); }
}
