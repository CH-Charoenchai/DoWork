// ---------- RENDER: WORK VIEW ----------
let workSearch = '', workCategoryFilter = '';

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

function renderWorkLists(){
  updateWorkBadge();
  if(!$('#work-lists')) return;
  const q = workSearch.trim().toLowerCase();
  let filtered = tasksCache.filter(t=>{
    if(q && !t.title.toLowerCase().includes(q)) return false;
    if(workCategoryFilter && t.category !== workCategoryFilter) return false;
    return true;
  });

  const notDone = sortForDisplay(filtered.filter(t=>t.status!=='เสร็จแล้ว'));
  const done = sortForDisplay(filtered.filter(t=>t.status==='เสร็จแล้ว'));

  let html = `<div class="section-title">ยังไม่เสร็จ <span class="count-pill">${notDone.length}</span></div>`;
  html += notDone.length ? `<div class="task-list" data-group="active">${notDone.map(taskCardHtml).join('')}</div>` : emptyStateHtml('ไม่มีงานค้าง เยี่ยมมาก! 🎉');

  html += `<div class="section-title done">เสร็จแล้ว <span class="count-pill">${done.length}</span></div>`;
  html += done.length ? `<div class="task-list" data-group="done">${done.map(taskCardHtml).join('')}</div>` : emptyStateHtml('ยังไม่มีงานที่เสร็จในตอนนี้');

  $('#work-lists').innerHTML = html;
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
  const done = groupName==='done';
  const q = workSearch.trim().toLowerCase();
  let filtered = tasksCache.filter(t=>{
    if(q && !t.title.toLowerCase().includes(q)) return false;
    if(workCategoryFilter && t.category !== workCategoryFilter) return false;
    return (t.status==='เสร็จแล้ว') === done;
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
  const overdue = isOverdue(t);
  const done = t.status === 'เสร็จแล้ว';
  const note = latestNoteByTask[t.id];
  const catColor = colorForCategory(t.category);
  return `
    <div class="task-card ${done?'done':''} ${t.pinned?'pinned':''}" data-id="${t.id}" draggable="true">
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

// ---------- SIDEBAR BADGE: จำนวนงานค้าง ----------
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
  const n = tasksCache.filter(t=>t.status!=='เสร็จแล้ว').length;
  const b = document.getElementById('work-badge');
  if(b){ b.textContent = n; b.classList.toggle('hidden', !n); }
}
