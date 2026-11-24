/* DoWork — home.js
   แทนที่ renderHome() เดิม: กล่องใกล้ครบกำหนด (ซ่อนถ้าไม่มี) + กราฟภาพรวมรายเดือน + แผงตัวชี้วัด
   วิธีติดตั้ง: วางไฟล์นี้ข้าง index.html แล้วเพิ่ม <script src="home.js"></script> เป็นตัวสุดท้าย (หลัง tour.js) */

let homeTrendMonths = 6;      // 3 | 6 | 12
let homeOverviewChart = null;

(function injectHomeCss(){
  const css = `
  .soon-panel{margin-bottom:16px;}
  .soon-row{display:flex;align-items:center;gap:14px;padding:11px 4px;cursor:pointer;}
  .soon-row+.soon-row{border-top:1px solid var(--border);}
  .soon-row:hover{background:var(--yellow-soft);}
  .soon-row .mtitle{flex:1;min-width:0;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .soon-row .tag{flex-shrink:0;}
  .soon-when{flex-shrink:0;width:74px;text-align:right;font-size:12.5px;color:var(--ink-soft);}
  .soon-when.hot{color:var(--danger);font-weight:800;}
  .ov-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;margin-bottom:16px;}
  .ov-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;}
  .ov-head h3{margin:0;}
  .ov-toggle{display:flex;gap:6px;}
  .ov-toggle button{padding:4px 12px;border-radius:999px;border:1.5px solid var(--navy);background:#fff;font-size:12px;font-weight:700;color:var(--navy-deep);}
  .ov-toggle button.on{background:var(--purple);border-color:var(--purple);color:#fff;}
  .ov-legend{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 6px;font-size:11.5px;font-weight:700;color:var(--ink);}
  .ov-legend span{display:inline-flex;align-items:center;gap:6px;}
  .ov-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;}
  .ov-legend i.line{width:12px;height:12px;border-radius:50%;background:#fff;border:2.5px solid #D9731B;}
  .ov-chart{position:relative;height:340px;}
  .kpi{padding:14px 0;}
  .kpi+.kpi{border-top:1px solid var(--border);}
  .kpi-label{font-size:12.5px;font-weight:700;color:var(--navy-deep);margin-bottom:6px;}
  .kpi-big{font-family:var(--font-display);font-size:30px;font-weight:600;color:var(--navy-deep);line-height:1.1;}
  .kpi-big small{font-family:var(--font-body);font-size:13px;font-weight:600;color:var(--ink-soft);margin-left:4px;}
  .kpi-big.red{color:#B8341F;}
  .kpi-sub{font-size:11.5px;color:var(--ink-soft);margin-top:4px;}
  .kpi-bar{height:10px;border:1.5px solid var(--navy);border-radius:999px;background:#fff;overflow:hidden;margin-top:8px;}
  .kpi-bar i{display:block;height:100%;background:var(--mint);}
  .kpi-link{display:inline-block;margin-top:8px;background:none;color:var(--purple);font-weight:700;font-size:12.5px;text-decoration:underline;padding:0;}
  @media (max-width:860px){ .ov-grid{grid-template-columns:1fr;} .ov-chart{height:280px;} }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
})();

// ---------- คำนวณ ----------
function ovMonthBuckets(n){
  const now = new Date();
  const out = [];
  for(let i = n-1; i >= 0; i--){
    const s = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const e = i === 0 ? new Date(now) : new Date(now.getFullYear(), now.getMonth()-i+1, 1);
    out.push({ s, e, cur: i === 0,
      label: s.toLocaleDateString('th-TH',{month:'short'}) + (i === 0 ? ' (ตอนนี้)' : '') });
  }
  return out;
}
function ovDoneDate(t){ return new Date(t.completed_at || t.created_at); }

function computeOverview(n){
  const tasks = tasksCache.filter(t=>t.status !== HOLD);
  const b = ovMonthBuckets(n);
  return {
    labels: b.map(x=>x.label),
    cur: b.length - 1,
    created: b.map(x=> tasks.filter(t=>{ const c = new Date(t.created_at); return c >= x.s && c < x.e; }).length),
    done: b.map(x=> tasks.filter(t=> t.status === 'เสร็จแล้ว' && ovDoneDate(t) >= x.s && ovDoneDate(t) < x.e).length),
    // ยกไปเดือนถัดไป = งานที่สร้างแล้วและยังไม่เสร็จ ณ สิ้นเดือนนั้น (เดือนนี้ = ค้างตอนนี้)
    carry: b.map(x=> tasks.filter(t=> new Date(t.created_at) < x.e && !(t.status === 'เสร็จแล้ว' && ovDoneDate(t) < x.e)).length)
  };
}

function computeKpis(){
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth()-5, 1);
  const done6 = tasksCache.filter(t=> t.status === 'เสร็จแล้ว' && t.completed_at && new Date(t.completed_at) >= from);
  const withDl = done6.filter(t=> t.deadline_at_completion || t.deadline);
  let onTime = 0;
  withDl.forEach(t=>{
    const c = new Date(t.completed_at); c.setHours(0,0,0,0);
    const d = new Date(t.deadline_at_completion || t.deadline); d.setHours(0,0,0,0);
    if(c <= d) onTime++;
  });
  const days = done6.map(t=> (new Date(t.completed_at) - new Date(t.created_at)) / 864e5).filter(x=>x >= 0);
  const avg = days.length ? days.reduce((a,b)=>a+b,0) / days.length : null;
  const stale = tasksCache
    .filter(t=> t.status !== 'เสร็จแล้ว' && t.status !== HOLD && (now - new Date(t.created_at)) / 864e5 > 30)
    .sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  return {
    onTime, total: withDl.length, rate: withDl.length ? Math.round(onTime / withDl.length * 100) : null,
    avg, stale
  };
}

// ---------- กราฟ ----------
const overviewPlugin = {
  id: 'overviewDecor',
  beforeDraw(chart){
    const { ctx, chartArea, scales } = chart;
    const n = chart.data.labels.length;
    const w = chartArea.width / n;
    const x = scales.x.getPixelForValue(n - 1);
    ctx.save();
    ctx.fillStyle = '#FFF1CC';
    ctx.beginPath();
    const rx = x - w/2 + 4, ry = chartArea.top - 6, rw = w - 8, rh = chart.height - ry - 4;
    if(ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, 12); else ctx.rect(rx, ry, rw, rh);
    ctx.fill();
    ctx.restore();
  },
  afterDatasetsDraw(chart){
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 12px 'Plus Jakarta Sans','Noto Sans Thai',sans-serif";
    chart.data.datasets.forEach((ds, di)=>{
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((el, i)=>{
        const v = ds.data[i];
        if(ds.type === 'line'){
          const cy = el.y - 17;
          ctx.beginPath(); ctx.arc(el.x, cy, 10, 0, Math.PI*2);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#D9731B'; ctx.stroke();
          ctx.fillStyle = '#B35A10'; ctx.fillText(v, el.x, cy + 0.5);
        } else {
          const h = chartArea.bottom - el.y;
          if(h >= 18){ ctx.fillStyle = di === 0 ? '#fff' : '#1F3A24'; ctx.fillText(v, el.x, el.y + 10); }
          else { ctx.fillStyle = '#26365E'; ctx.fillText(v, el.x, el.y - 9); }
        }
      });
    });
    ctx.restore();
  }
};

function renderOverviewChart(){
  const canvas = document.getElementById('overview-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  const d = computeOverview(homeTrendMonths);
  if(homeOverviewChart){ homeOverviewChart.destroy(); homeOverviewChart = null; }
  const top = Math.max(...d.created, ...d.done, ...d.carry, 1);
  homeOverviewChart = new Chart(canvas, {
    data: {
      labels: d.labels,
      datasets: [
        { type:'bar', label:'งานใหม่', data:d.created, backgroundColor:'#4A74D0', borderRadius:5, categoryPercentage:.78, barPercentage:.95, order:2 },
        { type:'bar', label:'เสร็จ', data:d.done, backgroundColor:'#5FB46A', borderRadius:5, categoryPercentage:.78, barPercentage:.95, order:2 },
        { type:'line', label:'ยกไปเดือนถัดไป', data:d.carry, borderColor:'#D9731B', backgroundColor:'#fff', borderWidth:3,
          pointRadius:5, pointBackgroundColor:'#fff', pointBorderColor:'#D9731B', pointBorderWidth:3, tension:0, order:1 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:30 } },
      plugins:{ legend:{ display:false } },
      scales:{
        y:{ beginAtZero:true, suggestedMax: top + 2, ticks:{ precision:0, color:'#5F6F94' }, grid:{ color:'#E6ECF7' }, border:{ display:false } },
        x:{ ticks:{ color:'#26365E', font:{ weight:'700', size:12 } }, grid:{ display:false } }
      }
    },
    plugins:[overviewPlugin]
  });
}

// ---------- รายการงานค้างเกิน 30 วัน ----------
function showStaleTasks(list){
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h2>งานค้างเกิน 30 วัน (${list.length})</h2><button type="button" class="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="mini-list">${list.map(t=>`
          <div class="mini-item" data-id="${t.id}">
            <span class="mtitle">${escapeHtml(t.title)}</span>
            <span class="tag tag-cat" style="background:${colorForCategory(t.category)}22;color:${colorForCategory(t.category)};">${escapeHtml(t.category)}</span>
            <span class="mmeta">ค้าง ${Math.floor((Date.now() - new Date(t.created_at)) / 864e5)} วัน</span>
          </div>`).join('')}</div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = ()=> ov.remove();
  ov.querySelector('.modal-close').addEventListener('click', close);
  ov.addEventListener('mousedown', (e)=>{ if(e.target === ov) close(); });
  ov.querySelectorAll('.mini-item').forEach(it=> it.addEventListener('click', ()=>{
    const id = it.dataset.id; close();
    switchView('work'); setTimeout(()=>openTaskModal(id), 50);
  }));
}

// ---------- RENDER: HOME (แทนของเดิม) ----------
function renderHome(){
  const el = $('#home-view');
  const counted = tasksCache.filter(t=>t.status !== HOLD);
  const held = tasksCache.length - counted.length;
  const live = counted.filter(t=>t.status !== 'เสร็จแล้ว');
  const rangeStart = getRangeStart();
  const completedInRange = counted.filter(t=> t.status === 'เสร็จแล้ว' && t.completed_at && (!rangeStart || new Date(t.completed_at) >= rangeStart));

  const soon = live.filter(t=> t.deadline && daysUntil(t.deadline) <= 5)
                   .sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));
  const lateN = live.filter(isOverdue).length;
  const delta = computePeriodDelta();
  const kpi = computeKpis();
  const today = new Date().toLocaleDateString('th-TH',{weekday:'long', day:'numeric', month:'long'});

  const deltaHtml = delta ? `
    <div class="stat-delta ${delta.delta>0?'up':delta.delta<0?'down':'flat'}">
      ${delta.delta>0?'▲':delta.delta<0?'▼':'―'} ${Math.abs(delta.delta)}% จาก${homeRange==='month'?'เดือนก่อน':'ไตรมาสก่อน'}
    </div>` : '';

  const soonHtml = soon.length ? `
    <div class="panel soon-panel">
      <h3>ใกล้ครบกำหนด</h3>
      ${soon.map(t=>`
        <div class="soon-row" data-id="${t.id}">
          <button type="button" class="row-check" data-check="${t.id}" title="ทำเสร็จ" aria-label="ทำเสร็จ"></button>
          <span class="mtitle">${escapeHtml(t.title)}</span>
          <span class="tag tag-cat" style="background:${colorForCategory(t.category)}22;color:${colorForCategory(t.category)};">${escapeHtml(t.category)}</span>
          <span class="soon-when ${daysUntil(t.deadline) <= 0 ? 'hot' : ''}">${deadlineText(t)}</span>
        </div>`).join('')}
    </div>` : '';

  const avgTxt = kpi.avg == null ? '–' : (Math.round(kpi.avg * 10) / 10).toString();

  el.innerHTML = `
    <div class="view-header">
      <div><h1>วันนี้ต้องทำอะไรบ้าง</h1><div class="view-sub">${userProfile.name ? 'สวัสดี '+escapeHtml(userProfile.name)+' · ' : ''}${escapeHtml(today)} · ค้างอยู่ ${live.length} งาน</div></div>
      <div class="header-actions">
        <div class="range-toggle" id="range-toggle">
          <button data-r="month" class="${homeRange==='month'?'active':''}">เดือนนี้</button>
          <button data-r="quarter" class="${homeRange==='quarter'?'active':''}">ไตรมาสนี้</button>
          <button data-r="all" class="${homeRange==='all'?'active':''}">ทั้งหมด</button>
        </div>
        <button type="button" class="btn-export" id="export-csv-btn">⬇ Export CSV</button>
      </div>
    </div>

    <div class="quick-add">
      <input type="text" id="qa-title" placeholder="พิมพ์ชื่องานแล้วกด Enter เพื่อเพิ่มเร็วๆ...">
      <select id="qa-cat" aria-label="หมวดหมู่">${allKnownCategories().map(c=>`<option value="${escapeHtml(c)}" ${c===getLastCat()?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
      <button type="button" class="btn-add" id="qa-btn">เพิ่ม</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-num">${live.length}</div><div class="stat-label">งานค้าง</div>
        <div class="stat-sub">${held ? 'ไม่รวมพักไว้ '+held+' งาน' : 'ยังไม่มีงานที่พักไว้'}</div>
      </div>
      <div class="stat-card ${lateN?'accent-coral':''}">
        <div class="stat-num">${soon.length}</div><div class="stat-label">ใกล้ครบกำหนด / เลยกำหนด</div>
        <div class="stat-sub">${lateN ? 'เลยกำหนด '+lateN+' งาน' : 'ไม่มีงานเลยกำหนด'}</div>
      </div>
      <div class="stat-card accent-mint">
        <div class="stat-num">${completedInRange.length}</div><div class="stat-label">เสร็จ (ช่วงที่เลือก)</div>
        ${deltaHtml}
      </div>
    </div>

    ${soonHtml}

    <div class="ov-grid">
      <div class="panel">
        <div class="ov-head">
          <h3>ภาพรวมงานรายเดือน</h3>
          <div class="ov-toggle" id="ov-toggle">
            ${[3,6,12].map(n=>`<button data-n="${n}" class="${homeTrendMonths===n?'on':''}">${n} เดือน</button>`).join('')}
          </div>
        </div>
        <div class="ov-legend">
          <span><i style="background:#4A74D0"></i>งานใหม่</span>
          <span><i style="background:#5FB46A"></i>เสร็จ</span>
          <span><i class="line"></i>ยกไปเดือนถัดไป (เดือนนี้ = คงเหลือตอนนี้)</span>
        </div>
        <div class="ov-chart"><canvas id="overview-chart"></canvas></div>
      </div>

      <div class="panel">
        <h3>ตัวชี้วัด</h3>
        <div class="kpi">
          <div class="kpi-label">ส่งตรงเวลา</div>
          <div class="kpi-big">${kpi.rate == null ? '–' : kpi.rate + '%'}${kpi.total ? `<small>· ${kpi.onTime}/${kpi.total} งาน</small>` : ''}</div>
          <div class="kpi-bar"><i style="width:${kpi.rate || 0}%"></i></div>
        </div>
        <div class="kpi">
          <div class="kpi-label">เวลาเฉลี่ยที่ใช้ปิดงาน</div>
          <div class="kpi-big">${avgTxt}${kpi.avg == null ? '' : '<small>วัน</small>'}</div>
          <div class="kpi-sub">จากงานที่เสร็จใน 6 เดือนล่าสุด</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">งานค้างที่อายุเกิน 30 วัน</div>
          <div class="kpi-big ${kpi.stale.length ? 'red' : ''}">${kpi.stale.length}<small>งาน</small></div>
          ${kpi.stale.length ? '<button type="button" class="kpi-link" id="stale-detail">รายละเอียด ›</button>' : ''}
        </div>
      </div>
    </div>
  `;

  $('#range-toggle').addEventListener('click', (e)=>{
    if(e.target.tagName !== 'BUTTON') return;
    homeRange = e.target.dataset.r;
    renderHome();
  });
  $('#ov-toggle').addEventListener('click', (e)=>{
    if(e.target.tagName !== 'BUTTON') return;
    homeTrendMonths = parseInt(e.target.dataset.n, 10);
    $all('#ov-toggle button').forEach(b=>b.classList.toggle('on', b === e.target));
    renderOverviewChart();
  });
  $all('.soon-row[data-id]').forEach(it=> it.addEventListener('click', (e)=>{
    if(e.target.closest('.row-check')) return;
    switchView('work'); setTimeout(()=>openTaskModal(it.dataset.id), 50);
  }));
  $all('.row-check').forEach(b=> b.addEventListener('click', (e)=>{
    e.stopPropagation();
    setTaskStatus(b.dataset.check, 'เสร็จแล้ว');
  }));
  const sd = $('#stale-detail');
  if(sd) sd.addEventListener('click', ()=> showStaleTasks(kpi.stale));

  const qaTitle = $('#qa-title');
  const doQuickAdd = ()=> quickAddTask(qaTitle.value, $('#qa-cat').value);
  $('#qa-btn').addEventListener('click', doQuickAdd);
  qaTitle.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); doQuickAdd(); } });
  $('#export-csv-btn').addEventListener('click', exportSummaryCSV);

  renderOverviewChart();
}
