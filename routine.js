/* DoWork — Routine module
   วางไฟล์นี้ไว้ข้าง index.html แล้วเพิ่มบรรทัดนี้ก่อน </body>:  <script src="routine.js"></script>
   ต้องรัน routine.sql ใน Supabase ก่อน */
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const R={items:[],logs:[]};
const FREQ={weekly:'รายสัปดาห์',monthly:'รายเดือน',quarterly:'รายไตรมาส'};
const WD=['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'];
const DEF_DAY={weekly:1,monthly:25,quarterly:0};
const P=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${P(d.getMonth()+1)}-${P(d.getDate())}`;
const dim=(y,m)=>new Date(y,m+1,0).getDate();
const monday=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7));

/* ---------- period logic ---------- */
function key(f,d=new Date()){
  if(f==='weekly') return 'W'+ymd(monday(d));
  if(f==='quarterly') return d.getFullYear()+'-Q'+(Math.floor(d.getMonth()/3)+1);
  return d.getFullYear()+'-'+P(d.getMonth()+1);
}
function back(f,i){
  const n=new Date();
  if(f==='weekly') return new Date(n.getFullYear(),n.getMonth(),n.getDate()-7*i);
  if(f==='quarterly') return new Date(n.getFullYear(),n.getMonth()-3*i,1);
  return new Date(n.getFullYear(),n.getMonth()-i,1);
}
function due(r){
  const n=new Date(), dd=r.due_day;
  if(r.frequency==='weekly'){ const m=monday(n); return new Date(m.getFullYear(),m.getMonth(),m.getDate()+(dd||1)-1); }
  const mo=r.frequency==='quarterly' ? Math.floor(n.getMonth()/3)*3+2 : n.getMonth();
  const l=dim(n.getFullYear(),mo);
  return new Date(n.getFullYear(),mo,dd===0?l:Math.min(dd,l));
}
const logOf=(r,k=key(r.frequency))=>R.logs.find(l=>l.routine_id===r.id&&l.period_key===k);
const isDone=(r,k)=>!!(logOf(r,k)&&logOf(r,k).completed_at);
const stepsDone=r=>(logOf(r)&&logOf(r).steps_done)||[];
function st(r){
  const dd=due(r);
  if(isDone(r)) return {state:'done',days:0,due:dd};
  const t=new Date(); t.setHours(0,0,0,0);
  const days=Math.round((dd-t)/864e5);
  return {state:days<0?'overdue':days<=5?'soon':'todo',days,due:dd};
}
function label(s){
  if(s.state==='done') return 'เสร็จรอบนี้ ✓';
  if(s.state==='overdue') return `⚠ เลยมา ${-s.days} วัน`;
  if(s.state==='soon') return s.days===0?'ครบกำหนดวันนี้':`อีก ${s.days} วัน`;
  return 'ครบกำหนด '+fmtDate(s.due);
}
function dayOpts(f,sel){
  if(f==='weekly') return WD.map((w,i)=>`<option value="${i+1}" ${sel===i+1?'selected':''}>วัน${w}</option>`).join('');
  const pre=f==='quarterly'?'สิ้นไตรมาส ':'';
  return `<option value="0" ${sel===0?'selected':''}>${pre}สิ้นเดือน</option>`+
    Array.from({length:31},(_,i)=>`<option value="${i+1}" ${sel===i+1?'selected':''}>${pre}วันที่ ${i+1}</option>`).join('');
}
const freqOpts=s=>Object.entries(FREQ).map(([k,v])=>`<option value="${k}" ${k===s?'selected':''}>${v}</option>`).join('');
const catOpts=s=>allKnownCategories().map(c=>`<option value="${escapeHtml(c)}" ${c===s?'selected':''}>${escapeHtml(c)}</option>`).join('');

/* ---------- data ---------- */
async function load(){
  const {data,error}=await sb.from('routines').select('*').order('sort_order',{ascending:true,nullsFirst:false}).order('created_at');
  if(error){ showToast('โหลดลูทีนไม่สำเร็จ: '+error.message); return; }
  R.items=data||[];
  const since=new Date(); since.setMonth(since.getMonth()-20);
  const l=await sb.from('routine_logs').select('*').gte('created_at',since.toISOString());
  R.logs=l.data||[];
  refresh();
}
function badge(){
  const n=R.items.filter(r=>r.active).map(st).filter(s=>s.state==='overdue'||s.state==='soon').length;
  const b=$('#routine-badge'); if(b){ b.textContent=n; b.classList.toggle('hidden',!n); }
}
function refresh(){
  badge();
  if(currentView==='routine') render(); else if(currentView==='home') renderHome();
}
async function saveLog(r,steps_done,complete){
  const k=key(r.frequency);
  const row={routine_id:r.id,user_id:currentUser.id,period_key:k,steps_done,completed_at:complete?new Date().toISOString():null};
  const {data,error}=await sb.from('routine_logs').upsert(row,{onConflict:'routine_id,period_key'}).select().single();
  if(error){ showToast('บันทึกไม่สำเร็จ: '+error.message); return; }
  R.logs=R.logs.filter(l=>!(l.routine_id===r.id&&l.period_key===k)).concat(data);
  refresh();
}
async function upd(id,patch){
  const {error}=await sb.from('routines').update(patch).eq('id',id);
  if(error){ showToast('ไม่สำเร็จ: '+error.message); return false; }
  Object.assign(R.items.find(x=>x.id===id),patch); refresh(); return true;
}
async function act(a,id,node){
  const r=R.items.find(x=>x.id===id); if(!r) return;
  const steps=r.steps||[];
  if(a==='toggle') return isDone(r)?saveLog(r,[],false):saveLog(r,steps.map((_,i)=>i),true);
  if(a==='step'){
    const i=+node.dataset.step, cur=stepsDone(r);
    const next=cur.includes(i)?cur.filter(x=>x!==i):[...cur,i];
    return saveLog(r,next,steps.length>0&&next.length===steps.length);
  }
  if(a==='day') return upd(id,{due_day:parseInt(node.value,10)});
  if(a==='pause') return upd(id,{active:!r.active});
  if(a==='edit') return openForm(id);
  if(a==='del'){
    if(!confirm(`ลบลูทีน "${r.title}" พร้อมประวัติทั้งหมด? ย้อนกลับไม่ได้ (ถ้าแค่หยุดชั่วคราวให้กดพัก ⏸)`)) return;
    const {error}=await sb.from('routines').delete().eq('id',id);
    if(error){ showToast('ลบไม่สำเร็จ: '+error.message); return; }
    R.items=R.items.filter(x=>x.id!==id); refresh(); showToast('ลบลูทีนแล้ว');
  }
}

/* ---------- UI ---------- */
function card(r){
  const s=st(r), done=s.state==='done', steps=r.steps||[], sd=stepsDone(r), c=colorForCategory(r.category);
  const dots=Array.from({length:6},(_,i)=>5-i).map(i=>`<span class="rt-dot ${isDone(r,key(r.frequency,back(r.frequency,i)))?'on':''}"></span>`).join('');
  const links=(r.links||[]).map(l=>`<a class="rt-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(l.label||l.url.replace(/^https?:\/\//,''))}</a>`).join('');
  const stepHtml=steps.map((t,i)=>`<label class="rt-step"><input type="checkbox" data-act="step" data-step="${i}" ${sd.includes(i)?'checked':''} ${r.active?'':'disabled'}><span class="${sd.includes(i)?'strike':''}">${escapeHtml(t)}</span></label>`).join('');
  return `<div class="task-card ${done||!r.active?'done':''} ${r.active&&s.state==='soon'?'rt-soon':''} ${r.active&&s.state==='overdue'?'rt-overdue':''}" data-rid="${r.id}" style="cursor:default;align-items:flex-start;">
    <button type="button" class="rt-check ${done?'on':''}" data-act="toggle" ${r.active?'':'disabled'} aria-label="เสร็จรอบนี้">${done?'✓':''}</button>
    <div class="task-body">
      <div class="task-title-row">
        <span class="task-title ${done?'strike':''}">${escapeHtml(r.title)}</span>
        <span class="tag tag-cat" style="background:${c}22;color:${c};">${escapeHtml(r.category||'')}</span>
        <span class="tag tag-cat">${FREQ[r.frequency]}</span>
        ${steps.length?`<span class="link-count-badge">☑ ${sd.length}/${steps.length}</span>`:''}
      </div>
      ${stepHtml?`<div class="rt-steps">${stepHtml}</div>`:''}
      ${links?`<div class="rt-links">${links}</div>`:''}
      ${r.note?`<div class="task-note-preview"><span class="note-preview-icon">📝</span><span class="note-preview-text">${escapeHtml(r.note)}</span></div>`:''}
      <div class="rt-dots" title="6 รอบล่าสุด">${dots}</div>
    </div>
    <div class="task-side">
      <span class="deadline-badge ${s.state==='overdue'?'overdue':''}">${r.active?label(s):'พักอยู่'}</span>
      <select class="rt-day" data-act="day" aria-label="วันครบกำหนด">${dayOpts(r.frequency,r.due_day)}</select>
      <div style="display:flex;gap:2px;">
        <button type="button" class="rt-act" data-act="edit" title="แก้ไข" aria-label="แก้ไข">✎</button>
        <button type="button" class="rt-act" data-act="pause" title="${r.active?'พัก':'เปิดใช้'}" aria-label="พักหรือเปิดใช้">${r.active?'⏸':'▶'}</button>
        <button type="button" class="rt-act" data-act="del" title="ลบ" aria-label="ลบ">🗑</button>
      </div>
    </div>
  </div>`;
}
let q='',catF='';
function build(){
  if($('#rt-lists')) return;
  $('#routine-view').innerHTML=`
    <div class="view-header"><div><h1>Routine</h1><div class="view-sub">เช็คลิสงานประจำ · เรียงตามกำหนดใกล้สุดก่อน · รีเซ็ตอัตโนมัติเมื่อขึ้นรอบใหม่</div></div></div>
    <div class="toolbar">
      <input type="text" id="rt-search" placeholder="ค้นหาลูทีน...">
      <select id="rt-cat-filter" aria-label="หมวดหมู่"></select>
    </div>
    <div id="rt-lists"></div>`;
  $('#rt-search').addEventListener('input',e=>{ q=e.target.value; render(); });
  $('#rt-cat-filter').addEventListener('change',e=>{ catF=e.target.value; render(); });
  const L=$('#rt-lists');
  L.addEventListener('click',e=>{
    const n=e.target.closest('[data-act]'); if(!n||n.tagName==='SELECT'||n.type==='checkbox') return;
    act(n.dataset.act,n.closest('[data-rid]').dataset.rid,n);
  });
  L.addEventListener('change',e=>{
    const n=e.target.closest('[data-act]'); if(!n||(n.tagName!=='SELECT'&&n.type!=='checkbox')) return;
    act(n.dataset.act,n.closest('[data-rid]').dataset.rid,n);
  });
}
function render(){
  build();
  $('#rt-cat-filter').innerHTML='<option value="">ทุกหมวดหมู่</option>'+allKnownCategories().map(c=>`<option value="${escapeHtml(c)}" ${c===catF?'selected':''}>${escapeHtml(c)}</option>`).join('');
  const ql=q.trim().toLowerCase();
  const items=R.items.filter(r=>(!ql||r.title.toLowerCase().includes(ql))&&(!catF||r.category===catF));
  const byDue=(a,b)=>due(a)-due(b)||(a.sort_order||0)-(b.sort_order||0);
  const act=items.filter(r=>r.active);
  const pend=act.filter(r=>!isDone(r)).sort(byDue), done=act.filter(r=>isDone(r)).sort(byDue), paused=items.filter(r=>!r.active);
  const L=(a,m)=>a.length?`<div class="task-list">${a.map(card).join('')}</div>`:(m?emptyStateHtml(m):'');
  const filtering=ql||catF;
  $('#rt-lists').innerHTML=
    `<div class="section-title">รอทำรอบนี้ <span class="count-pill">${pend.length}</span></div>${L(pend,filtering?'ไม่พบลูทีนที่ค้นหา':R.items.length?'ลูทีนรอบนี้ครบแล้ว 🎉':'ยังไม่มีลูทีน กดปุ่ม + เพื่อเพิ่มอันแรก')}`+
    `<div class="section-title done">เสร็จรอบนี้ <span class="count-pill">${done.length}</span></div>${L(done,'ยังไม่มีที่เสร็จในรอบนี้')}`+
    (paused.length?`<div class="section-title">พักไว้ <span class="count-pill">${paused.length}</span></div>${L(paused)}`:'');
}
function openForm(id){
  const r=id?R.items.find(x=>x.id===id):null;
  const v=r||{title:'',category:'Admin',frequency:'monthly',due_day:25,steps:[],links:[],note:''};
  const ov=document.createElement('div'); ov.className='modal-overlay';
  ov.innerHTML=`<div class="modal"><div class="modal-head"><h2>${r?'แก้ไขลูทีน':'เพิ่มลูทีนใหม่'}</h2><button type="button" class="modal-close" data-x aria-label="ปิด">✕</button></div><div class="modal-body">
    <div class="form-row"><label>ชื่อลูทีน</label><input type="text" id="e-title" placeholder="เช่น ส่งรายงานประจำเดือน" value="${escapeHtml(v.title)}"></div>
    <div class="form-row"><label>รายละเอียด / โน้ต</label><textarea id="e-note" rows="3" placeholder="รายละเอียด หรือสิ่งที่ต้องทำ...">${escapeHtml(v.note||'')}</textarea></div>
    <div class="form-two">
      <div class="form-row"><label>หมวดหมู่</label><select id="e-cat">${catOpts(v.category)}</select></div>
      <div class="form-row"><label>ความถี่</label><select id="e-freq">${freqOpts(v.frequency)}</select></div>
    </div>
    <div class="form-row"><label>วันครบกำหนด</label><select id="e-day">${dayOpts(v.frequency,v.due_day)}</select></div>
    <div class="form-row"><label>ขั้นตอนย่อย (บรรทัดละ 1 ข้อ ไม่บังคับ)</label><textarea id="e-steps" rows="3">${escapeHtml((v.steps||[]).join('\n'))}</textarea></div>
    <div class="form-row"><label>ลิงก์ (บรรทัดละ 1 ลิงก์ รูปแบบ url | ชื่อ ไม่บังคับ)</label><textarea id="e-links" rows="2">${escapeHtml((v.links||[]).map(l=>l.url+(l.label?' | '+l.label:'')).join('\n'))}</textarea></div>
    <div class="modal-actions"><button type="button" class="btn-ghost" data-x>ยกเลิก</button><button type="button" class="btn-submit" id="e-save">บันทึกลูทีน</button></div>
  </div></div>`;
  document.body.appendChild(ov);
  const close=()=>{ ov.remove(); document.removeEventListener('keydown',esc); };
  const esc=e=>{ if(e.key==='Escape') close(); };
  document.addEventListener('keydown',esc);
  ov.addEventListener('click',e=>{ if(e.target===ov||e.target.closest('[data-x]')) close(); });
  $('#e-freq').onchange=e=>{ $('#e-day').innerHTML=dayOpts(e.target.value,DEF_DAY[e.target.value]); };
  $('#e-title').focus();
  $('#e-save').onclick=async()=>{
    const title=$('#e-title').value.trim(); if(!title){ showToast('ใส่ชื่อลูทีนก่อนนะ'); $('#e-title').focus(); return; }
    const lines=t=>t.split('\n').map(x=>x.trim()).filter(Boolean);
    const patch={
      title, category:$('#e-cat').value||'Admin', frequency:$('#e-freq').value, due_day:parseInt($('#e-day').value,10),
      steps:lines($('#e-steps').value),
      links:lines($('#e-links').value).map(x=>{ const [u,...l]=x.split('|'); return {url:normalizeUrl(u),label:l.join('|').trim()}; }),
      note:$('#e-note').value.trim()
    };
    try{
      if(r){ if(await upd(id,patch)){ close(); showToast('บันทึกแล้ว ✓'); } return; }
      if(!currentUser){ showToast('ยังไม่ได้เข้าสู่ระบบ'); return; }
      const max=R.items.reduce((m,x)=>Math.max(m,x.sort_order||0),0);
      const {error}=await sb.from('routines').insert({...patch,user_id:currentUser.id,sort_order:max+1});
      if(error){ console.error(error); showToast('เพิ่มไม่สำเร็จ: '+error.message); return; }
      close(); showToast('เพิ่มลูทีนแล้ว 🔁'); await load();
    }catch(err){ console.error(err); showToast('เกิดข้อผิดพลาด: '+err.message); }
  };
}

/* ---------- home integration ---------- */
function decorateHome(){
  const g=$('.stat-grid'); if(!g) return;
  const act=R.items.filter(r=>r.active), d=act.filter(r=>isDone(r)).length, p=act.length?Math.round(d/act.length*100):0;
  const c=document.createElement('div'); c.className='stat-card accent-mint'; c.style.cursor='pointer';
  c.innerHTML=act.length
    ?`<div class="stat-num">${d}/${act.length}</div><div class="stat-label">ลูทีนรอบนี้</div><div class="bar-track" style="margin-top:8px;"><div class="bar-fill" style="width:${p}%;background:var(--mint);"></div></div>`
    :`<div class="stat-num">–</div><div class="stat-label">ลูทีน</div><div class="stat-sub">ยังไม่มีลูทีน</div>`;
  c.onclick=()=>switchView('routine'); g.appendChild(c);
  const panel=[...$$('.panel')].find(x=>x.querySelector('h3')&&x.querySelector('h3').textContent.trim()==='ใกล้ครบกำหนด');
  const items=act.filter(r=>!isDone(r)).map(r=>({r,s:st(r)})).filter(x=>x.s.state!=='todo').sort((a,b)=>a.s.due-b.s.due);
  if(!panel||!items.length) return;
  let list=panel.querySelector('.mini-list');
  if(!list){ const en=panel.querySelector('.empty-note'); if(en) en.remove(); list=document.createElement('div'); list.className='mini-list'; panel.appendChild(list); }
  items.forEach(({r,s})=>{
    const it=document.createElement('div'); it.className='mini-item';
    it.innerHTML=`<span class="mood-dot" style="width:12px;height:12px;background:var(--mint);"></span><span class="mtitle">${escapeHtml(r.title)}</span><span class="tag tag-cat" style="font-size:10px;">🔁 ลูทีน</span><span class="mmeta ${s.state==='overdue'?'overdue':''}">${fmtDate(s.due)}</span>`;
    it.onclick=()=>switchView('routine'); list.appendChild(it);
  });
}

/* ---------- boot ---------- */
const css=document.createElement('style');
css.textContent=`
.rt-check{flex-shrink:0;width:28px;height:28px;border-radius:50%;border:2px solid var(--border);background:var(--surface);color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;}
.rt-check.on{background:var(--mint);border-color:var(--mint);}
.rt-dots{display:flex;gap:4px;margin-top:6px;}
.rt-dot{width:8px;height:8px;border-radius:50%;background:var(--border);}
.rt-dot.on{background:var(--mint);}
.rt-add{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
.rt-add input,.rt-add select,.rt-day{padding:10px 12px;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:var(--surface);font-size:13.5px;color:var(--ink);outline:none;}
.rt-day{padding:4px 6px;font-size:12px;}
.rt-add input{flex:1;min-width:180px;}
.rt-add button{background:var(--purple);color:#fff;padding:10px 18px;border-radius:var(--radius-sm);font-weight:700;font-size:13px;}
.task-card.rt-soon{background:linear-gradient(135deg,var(--yellow-soft),var(--surface) 60%);border:1.5px solid var(--yellow);}
.task-card.rt-overdue{background:linear-gradient(135deg,var(--coral-soft),var(--surface) 60%);border:1.5px solid var(--coral);}
.rt-soon .deadline-badge{color:#a66a00;font-weight:700;}
.rt-act{background:none;color:var(--ink-soft);width:28px;height:28px;border-radius:50%;font-size:13px;}
.rt-act:hover{background:var(--purple-soft);color:var(--purple);}
.rt-steps{display:flex;flex-direction:column;gap:4px;margin-top:8px;}
.rt-step{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;}
.rt-step input{accent-color:var(--mint);width:16px;height:16px;}
.rt-step .strike{text-decoration:line-through;color:var(--ink-soft);}
.rt-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.rt-link{font-size:12px;font-weight:600;color:var(--purple);background:var(--purple-soft);padding:3px 10px;border-radius:999px;text-decoration:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;
document.head.appendChild(css);

// nav + view
const sideBtn=document.createElement('button');
sideBtn.className='nav-item'; sideBtn.dataset.view='routine';
sideBtn.innerHTML='<span class="nav-icon">🔁</span>Routine<span id="routine-badge" class="hidden" style="margin-left:auto;background:var(--coral-soft);color:var(--coral);font-size:11px;font-family:var(--font-mono);padding:2px 8px;border-radius:999px;"></span>';
$('.nav-item[data-view="work"]').after(sideBtn);
const mobBtn=document.createElement('button'); mobBtn.dataset.view='routine'; mobBtn.textContent='Routine';
$('.mobile-nav button[data-view="work"]').after(mobBtn);
const view=document.createElement('div'); view.id='routine-view'; view.className='hidden';
$('#work-view').after(view);
[sideBtn,mobBtn].forEach(b=>b.addEventListener('click',()=>switchView('routine')));

// hook switchView / renderHome
const _sv=switchView;
switchView=function(v){
  if(v!=='routine'){ view.classList.add('hidden'); return _sv(v); }
  currentView='routine';
  ['home','work','settings'].forEach(x=>$('#'+x+'-view').classList.add('hidden'));
  view.classList.remove('hidden');
  $$('.nav-item,.mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='routine'));
  $('#fab-add').classList.remove('hidden');
  render();
};
const _rh=renderHome;
renderHome=function(){ _rh(); decorateHome(); };

document.addEventListener('click',e=>{
  if(currentView==='routine'&&e.target.closest('#fab-add')){ e.stopPropagation(); openForm(null); }
},true);

// auth
let lastUid=null;
sb.auth.onAuthStateChange((ev,session)=>{
  if(session&&session.user){ if(session.user.id!==lastUid||ev==='SIGNED_IN'){ lastUid=session.user.id; load(); } }
  else { lastUid=null; R.items=[]; R.logs=[]; badge(); }
});

// rename DoDee -> DoWork
document.title=document.title.replace(/DoDee/g,'DoWork');
const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
while((n=w.nextNode())) if(n.nodeValue.includes('DoDee')) n.nodeValue=n.nodeValue.replace(/DoDee/g,'DoWork');
})();
