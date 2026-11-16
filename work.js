// ---------- RENDER: WORK VIEW ----------
let workSearch = '', workCategoryFilter = '';

// สถานะ "พักไว้" (Hold) + การพับ/แสดงส่วน "พักไว้" และ "เสร็จแล้ว" (จำค่าไว้ในเบราว์เซอร์)
const HOLD = 'พักไว้';
const WORK_SHOW_KEY = 'dowork_work_sections';
let workShow = { hold:false, done:false };
try{ Object.assign(workShow, JSON.parse(localStorage.getItem(WORK_SHOW_KEY) || '{}')); }catch(e){}
function saveWorkShow(){ try{ localStorage.setItem(WORK_SHOW_KEY, JSON.stringify(workShow)); }catch(e){} }

STATUS_CLASS[HOLD] = 'status-hold';

// เพิ่มปุ่มสถานะ "พักไว้" ใน modal งาน
(function(){
  const g = document.getElementById('tm-status-group');
  if(g && !g.querySelector('[data-val="'+HOLD+'"]')){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sel-status'; b.dataset.val = HOLD; b.textContent = HOLD;
    const doing = g.querySelector('[data-val="กำลังทำ"]');
    if(doing) doing.after(b); else g.appendChild(b);
  }
})();

// หน้า Home ไม่นับงานที่พักไว้ (สถิติ, ใกล้ครบกำหนด, Impact สูง ฯลฯ)
(function(){
  const _rh = renderHome;
  renderHome = function(){
    const all = tasksCache;
    tasksCache = all.filter(t=>t.status !== HOLD);
    try{ _rh.apply(this, arguments); } finally { tasksCache = all; }
  };
})();

function renderWork(){
  const el = $('#work-view');
  const cats = new Set(DEFAULT_CATEGORIES);
  tasksCache.forEach(t=>cats.add(t.category));

  el.innerHTML = `
    <div class="view-header">
      <div><h1>Work</h1><div class="view-sub">งานทั้งหมดของคุณ ลากเพื่อจัดลำดับได้เลย</div></div>
    </div>
    <div class="toolbar">
      <input type="text" id="work-search" placeholder="ค้นหางาน..." value="${escapeHtml(workSearch)}">
      <select id="work-cat-filter">
        <option value="">ทุกหมวดหมู่</option>
        ${[...cats].map(c=>`<option value="${escapeHtml(c)}" ${c===workCategoryFilter?'selected':''}>${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div id="work-lists"></div>
  `;

  $('#work-search').addEventListener('input', (e)=>{ workSearch = e.target.value; renderWorkLists(); });
  $('#work-cat-filter').addEventListener('change', (e)=>{ workCategoryFilter = e.target.value; renderWorkLists(); });

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

function renderWorkLists(){
  updateWorkBadge();
  if(!$('#work-lists')) return;
  const q = workSearch.trim().toLowerCase();
  let filtered = tasksCache.filter(t=>{
    if(q && !t.title.toLowerCase().includes(q)) return false;
    if(workCategoryFilter && t.category !== workCategoryFilter) return false;
    return true;
  });

  const active = sortForDisplay(filtered.filter(t=>statusGroup(t)==='active'));
  const hold = sortForDisplay(filtered.filter(t=>statusGroup(t)==='hold'));
  const done = sortForDisplay(filtered.filter(t=>statusGroup(t)==='done'));
  // ถ้ากำลังค้นหาหรือกรองหมวดหมู่ ให้เปิดส่วนที่พับไว้อัตโนมัติ
  const force = !!(q || workCategoryFilter);

  let html = `<div class="section-title">ยังไม่เสร็จ <span class="count-pill">${active.length}</span></div>`;
  html += active.length ? `<div class="task-list" data-group="active">${active.map(taskCardHtml).join('')}</div>` : emptyStateHtml('ไม่มีงานค้าง เยี่ยมมาก! 🎉');

  if(hold.length) html += collapsibleSection('hold', 'พักไว้', 'hold', hold, 'ไม่มีงานที่พักไว้', force);
  html += collapsibleSection('done', 'เสร็จแล้ว', 'done', done, 'ยังไม่มีงานที่เสร็จในตอนนี้', force);

  $('#work-lists').innerHTML = html;
  $all('.section-toggle').forEach(btn=> btn.addEventListener('click', ()=>{
    workShow[btn.dataset.sec] = !workShow[btn.dataset.sec];
    saveWorkShow();
    renderWorkLists();
  }));
  $all('.task-card').forEach(card=> card.addEventListener('click', (e)=>{
    if(e.target.closest('.pin-btn') || e.target.closest('.drag-handle')) return;
    openTaskModal(card.dataset.id);
  }));
  $all('.pin-btn').forEach(btn=> btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    togglePin(btn.dataset.id);
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
  const overdue = isOverdue(t) && !onHold;
  const done = t.status === 'เสร็จแล้ว';
  const note = latestNoteByTask[t.id];
  const catColor = colorForCategory(t.category);
  return `
    <div class="task-card ${done?'done':''} ${onHold?'on-hold':''} ${t.pinned?'pinned':''}" data-id="${t.id}" draggable="true">
      <span class="drag-handle" title="ลากเพื่อจัดลำดับ">⠿</span>
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

// ---------- SIDEBAR BADGE: จำนวนงานค้าง (ไม่นับงานเสร็จและงานที่พักไว้) ----------
(function(){
  const btn = document.querySelector('.nav-item[data-view="work"]');
  if(btn && !document.getElementById('work-badge')){
    btn.insertAdjacentHTML('beforeend','<span id="work-badge" class="hidden" style="margin-left:auto;background:var(--coral-soft);color:var(--coral);font-size:11px;font-family:var(--font-mono);padding:2px 8px;border-radius:999px;"></span>');
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
