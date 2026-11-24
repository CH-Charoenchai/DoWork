/* DoWork — home.js
   แทนที่ renderHome() เดิม · วางไว้ข้าง index.html แล้วเพิ่ม <script src="home.js"></script> เป็นตัวสุดท้าย (หลัง tour.js)
   ข้อมูลในกราฟ/ตัวชี้วัด/การ์ดเสร็จ/Export ใช้ตัวกรองด้านบน (ปี + เดือนนี้/ไตรมาสนี้/ทั้งหมด) */

let homeYear = new Date().getFullYear();
let homeOverviewChart = null;
const OV_COLOR = { carry:'#FFC53D', added:'#4A74D0', done:'#5FB46A' };

(function injectHomeCss(){
  const st = document.createElement('style');
  st.textContent = `
  /* ---------- ธีม dropdown ทั้งแอป ---------- */
  select:not([multiple]){
    -webkit-appearance:none;appearance:none;cursor:pointer;font-family:var(--font-body);font-weight:600;color:var(--navy-deep);
    padding-right:30px !important;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%232B3F6B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
    background-repeat:no-repeat !important;background-position:right 12px center !important;background-size:12px 8px !important;
    transition:background-color .12s,box-shadow .12s;
  }
  select:not([multiple]):hover:not(:disabled){background-color:var(--yellow-soft) !important;}
  select:not([multiple]):focus{box-shadow:0 0 0 3px rgba(255,197,61,.6);}
  select:disabled{opacity:.55;cursor:not-allowed;}
  select option{background:#fff;color:var(--ink);font-weight:600;}
  .year-select{padding:7px 14px;border-radius:999px;border:1.5px solid var(--navy);background:#fff;font-weight:700;font-size:13px;color:var(--navy-deep);outline:none;}
  .soon-panel{margin-bottom:16px;}
  .soon-row{display:flex;align-items:center;gap:14px;padding:11px 4px;cursor:pointer;}
  .soon-row+.soon-row{border-top:1px solid var(--border);}
  .soon-row:hover{background:var(--yellow-soft);}
  .soon-row .mtitle{flex:1;min-width:0;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .soon-row .tag{flex-shrink:0;}
  .soon-when{flex-shrink:0;width:74px;text-align:right;font-size:12.5px;color:var(--ink-soft);}
  .soon-when.hot{color:var(--danger);font-weight:800;}
  .ov-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;margin-bottom:16px;}
  .ov-panel h3{margin:0;}
  .ov-legend{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 6px;font-size:11.5px;font-weight:700;color:var(--ink);}
  .ov-legend span{display:inline-flex;align-items:center;gap:6px;}
  .ov-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;}
  .ov-legend .hint{color:var(--ink-soft);font-weight:600;}
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
  document.head.appendChild(st);
})();

// ---------- ช่วงเวลาตามตัวกรอง (ปี + เดือนนี้/ไตรมาสนี้/ทั้งหมด) ----------
const ovIsDone = t => t.status === 'เสร็จแล้ว';
const ovDoneDate = t => new Date(t.completed_at || t.created_at);
const ovDoneIn = (list, s, e) => list.filter(t => ovIsDone(t) && ovDoneDate(t) >= s && ovDoneDate(t) < e).length;

function homePeriod(){
  const m = new Date().getMonth(), Y = homeYear;
  if(homeRange === 'month') return { s:new Date(Y, m, 1), e:new Date(Y, m+1, 1) };
  if(homeRange === 'quarter'){ const q = Math.floor(m/3)*3; return { s:new Date(Y, q, 1), e:new Date(Y, q+3, 1) }; }
  return { s:new Date(Y, 0, 1), e:new Date(Y+1, 0, 1) };
}

function computeOverview(per){
  const tasks = tasksCache.filter(t => t.status !== HOLD), now = new Date(), b = [];
  for(let d = new Date(per.s); d < per.e && d <= now; d = new Date(d.getFullYear(), d.getMonth()+1, 1)){
    b.push({ s:d, e:new Date(d.getFullYear(), d.getMonth()+1, 1) });
  }
  const cur = b.findIndex(x => now >= x.s && now < x.e);
  return {
    cur,
    labels: b.map(x => [x.s.toLocaleDateString('th-TH',{month:'short'}), String(x.s.getFullYear())]),
    // ยกมา = ค้างอยู่ ณ ต้นเดือน · เพิ่ม = สร้างในเดือน · เสร็จ = เสร็จในเดือน
    carry: b.map(x => tasks.filter(t => new Date(t.created_at) < x.s && !(ovIsDone(t) && ovDoneDate(t) < x.s)).length),
    added: b.map(x => tasks.filter(t => { const c = new Date(t.created_at); return c >= x.s && c < x.e; }).length),
    done:  b.map(x => ovDoneIn(tasks, x.s, x.e))
  };
}

function computeKpis(per){
  const tasks = tasksCache.filter(t => t.status !== HOLD), now = new Date();
  const asOf = per.e < now ? per.e : now;
  const total = tasks.filter(t => new Date(t.created_at) < per.e && !(ovIsDone(t) && ovDoneDate(t) < per.s)).length;
  const doneList = tasks.filter(t => ovIsDone(t) && ovDoneDate(t) >= per.s && ovDoneDate(t) < per.e);
  const days = doneList.filter(t => t.completed_at).map(t => (new Date(t.completed_at) - new Date(t.created_at)) / 864e5).filter(x => x >= 0);
  const stale = tasks
    .filter(t => (asOf - new Date(t.created_at)) / 864e5 > 30 && !(ovIsDone(t) && ovDoneDate(t) <= asOf))
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  return {
    total, done: doneList.length, pct: total ? Math.round(doneList.length / total * 100) : null,
    avg: days.length ? days.reduce((a,b) => a+b, 0) / days.length : null,
    stale, asOf
  };
}

// ---------- กราฟ ----------
const overviewPlugin = {
  id: 'overviewDecor',
  beforeDraw(chart, args, opt){
    if(opt.cur < 0) return;
    const { ctx, chartArea, scales } = chart;
    const w = chartArea.width / chart.data.labels.length;
    const x = scales.x.getPixelForValue(opt.cur);
    ctx.save();
    ctx.fillStyle = '#FFF1CC';
    ctx.beginPath();
    const rx = x - w/2 + 4, ry = chartArea.top - 6, rw = w - 8, rh = chart.height - ry - 4;
    if(ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, 12); else ctx.rect(rx, ry, rw, rh);
    ctx.fill();
    ctx.restore();
  },
  afterDatasetsDraw(chart){
    const { ctx } = chart, ds = chart.data.datasets;
    const m = [0,1,2].map(i => chart.getDatasetMeta(i));
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "700 12px 'Plus Jakarta Sans','Noto Sans Thai',sans-serif";
    chart.data.labels.forEach((_, i) => {
      // ตัวเลขในแต่ละช่วงสีของแท่งค้าง
      [0,1].forEach(k => {
        const v = ds[k].data[i], el = m[k].data[i], h = el.base - el.y;
        if(v > 0 && h >= 16){ ctx.fillStyle = k === 1 ? '#2B3F6B' : '#fff'; ctx.fillText(v, el.x, el.y + h/2); }
      });
      // ยอดรวมแท่งค้าง
      const total = ds[0].data[i] + ds[1].data[i];  // 0 = เพิ่มเดือนนี้ (ล่าง), 1 = ยกมา (บน)
      if(total > 0){
        const top = Math.min(...[0,1].filter(k => ds[k].data[i] > 0).map(k => m[k].data[i].y));
        ctx.fillStyle = '#26365E'; ctx.fillText(total, m[1].data[i].x, top - 10);
      }
      // ตัวเลขแท่งเสร็จ
      const dv = ds[2].data[i];
      if(dv > 0){ ctx.fillStyle = '#26365E'; ctx.fillText(dv, m[2].data[i].x, m[2].data[i].y - 10); }
    });
    ctx.restore();
  }
};

function renderOverviewChart(per){
  const canvas = document.getElementById('overview-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  const d = computeOverview(per);
  if(homeOverviewChart){ homeOverviewChart.destroy(); homeOverviewChart = null; }
  const top = Math.max(...d.carry.map((c,i) => c + d.added[i]), ...d.done, 1);
  const bar = { categoryPercentage:.8, barPercentage:.92, maxBarThickness:56 };
  const rad = { topLeft:5, topRight:5 };
  homeOverviewChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [
        { ...bar, label:'เพิ่มเดือนนี้', data:d.added, backgroundColor:OV_COLOR.added, stack:'open' },
        { ...bar, label:'ยกมาจากเดือนก่อน', data:d.carry, backgroundColor:OV_COLOR.carry, stack:'open', borderRadius:rad },
        { ...bar, label:'เสร็จ', data:d.done, backgroundColor:OV_COLOR.done, stack:'done', borderRadius:rad }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:30 } },
      plugins:{ legend:{ display:false }, overviewDecor:{ cur:d.cur } },
      scales:{
        y:{ stacked:true, beginAtZero:true, suggestedMax:top + 2, ticks:{ precision:0, color:'#5F6F94' }, grid:{ color:'#E6ECF7' }, border:{ display:false } },
        x:{ stacked:true, ticks:{ color:'#26365E', font:{ weight:'700', size:12 } }, grid:{ display:false } }
      }
    },
    plugins:[overviewPlugin]
  });
}

// ---------- รายการงานค้างเกิน 30 วัน ----------
function showStaleTasks(list, asOf){
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
            <span class="mmeta">ค้าง ${Math.floor((asOf - new Date(t.created_at)) / 864e5)} วัน</span>
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

// ---------- Export CSV (ตามตัวกรอง) ----------
function exportSummaryCSV(){
  const per = homePeriod();
  const list = tasksCache.filter(t=>{
    const ref = ovIsDone(t) ? ovDoneDate(t) : new Date(t.created_at);
    return ref >= per.s && ref < per.e;
  });
  const rows = [['ชื่องาน','หมวดหมู่','สถานะ','urgency','Impact','Deadline','วันที่เสร็จ','วันที่สร้าง']];
  list.forEach(t=> rows.push([
    t.title, t.category, t.status, t.urgency, t.impact,
    t.deadline || '', t.completed_at ? fmtDate(t.completed_at) : '', fmtDate(t.created_at)
  ]));
  const csv = rows.map(r=> r.map(v=> `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `DoWork-summary-${homeYear}-${homeRange}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('ดาวน์โหลดสรุปแล้ว 📄');
}

// ข้อความกำหนดส่งของลูทีน (ข้อมูลมาจาก routine.js ผ่าน window.DWRoutine)
function rtWhen(s){
  if(s.days < 0) return `เลย ${-s.days} วัน`;
  if(s.days === 0) return 'วันนี้';
  const mon = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay()+6)%7)).getTime();
  return mon(s.due) === mon(new Date())
    ? s.due.toLocaleDateString('th-TH',{weekday:'long'}).replace('วัน','') + 'นี้'
    : `อีก ${s.days} วัน`;
}

// ---------- RENDER: HOME (แทนของเดิม) ----------
function renderHome(){
  const el = $('#home-view');
  const nowD = new Date();
  const minY = 2026, maxY = Math.max(minY, nowD.getFullYear());
  homeYear = Math.min(maxY, Math.max(minY, homeYear));
  const per = homePeriod();
  const isPast = per.e <= nowD;
  const asOf = isPast ? per.e : nowD;

  const counted = tasksCache.filter(t=>t.status !== HOLD);
  const held = tasksCache.length - counted.length;
  const live = counted.filter(t=>!ovIsDone(t));                       // ตอนนี้
  const openAsOf = counted.filter(t=> new Date(t.created_at) < asOf && !(ovIsDone(t) && ovDoneDate(t) <= asOf)).length;
  const doneN = ovDoneIn(counted, per.s, per.e);
  const kpi = computeKpis(per);

  const soon = live.filter(t=> t.deadline && daysUntil(t.deadline) <= 5);
  const lateN = live.filter(isOverdue).length;
  const today = nowD.toLocaleDateString('th-TH',{weekday:'long', day:'numeric', month:'long'});

  // เทียบช่วงก่อนหน้า (ไม่มีเมื่อเลือก "ทั้งหมด")
  let deltaHtml = '';
  if(homeRange !== 'all'){
    const n = homeRange === 'month' ? 1 : 3;
    const prevN = ovDoneIn(counted, new Date(per.s.getFullYear(), per.s.getMonth()-n, 1), per.s);
    const dl = prevN === 0 ? (doneN > 0 ? 100 : 0) : Math.round((doneN - prevN) / prevN * 100);
    deltaHtml = `<div class="stat-delta ${dl>0?'up':dl<0?'down':'flat'}">${dl>0?'▲':dl<0?'▼':'―'} ${Math.abs(dl)}% จาก${homeRange==='month'?'เดือนก่อน':'ไตรมาสก่อน'}</div>`;
  }

  // ลูทีน (จาก routine.js)
  const RT = window.DWRoutine;
  const rtAct = RT ? RT.active() : [];
  const rtDone = RT ? rtAct.filter(r=>RT.isDone(r)).length : 0;
  const rtSoon = RT ? rtAct.filter(r=>!RT.isDone(r)).map(r=>({ r, s:RT.st(r) })).filter(x=>x.s.state==='overdue' || x.s.state==='soon') : [];
  const rows = [
    ...soon.map(t=>({ kind:'task', id:t.id, title:t.title, cat:t.category, color:colorForCategory(t.category), days:daysUntil(t.deadline), when:deadlineText(t) })),
    ...rtSoon.map(({r,s})=>({ kind:'routine', id:r.id, title:'ลูทีน: '+r.title, cat:'ลูทีน', color:'#2F7A3B', days:s.days, when:rtWhen(s) }))
  ].sort((a,b)=>a.days-b.days);
  const rtCard = !RT ? '' : (rtAct.length
    ? `<div class="stat-card accent-mint" id="rt-card" style="cursor:pointer;"><div class="stat-num">${rtDone}/${rtAct.length}</div><div class="stat-label">ลูทีนรอบนี้</div><div class="bar-track" style="margin-top:8px;"><div class="bar-fill" style="width:${Math.round(rtDone/rtAct.length*100)}%;background:var(--mint);"></div></div></div>`
    : `<div class="stat-card accent-mint" id="rt-card" style="cursor:pointer;"><div class="stat-num">–</div><div class="stat-label">ลูทีน</div><div class="stat-sub">ยังไม่มีลูทีน</div></div>`);

  const soonHtml = rows.length ? `
    <div class="panel soon-panel">
      <h3>ใกล้ครบกำหนด</h3>
      ${rows.map(x=>`
        <div class="soon-row" data-kind="${x.kind}" data-id="${x.id}">
          <button type="button" class="row-check" title="ทำเสร็จ" aria-label="ทำเสร็จ"></button>
          <span class="mtitle">${escapeHtml(x.title)}</span>
          <span class="tag tag-cat" style="background:${x.color}22;color:${x.color};">${escapeHtml(x.cat)}</span>
          <span class="soon-when ${x.days <= 0 ? 'hot' : ''}">${x.when}</span>
        </div>`).join('')}
    </div>` : '';

  const avgTxt = kpi.avg == null ? '–' : (Math.round(kpi.avg * 10) / 10).toString();
  const yearOpts = Array.from({ length:maxY - minY + 1 }, (_,i)=> minY + i)
    .map(y=>`<option value="${y}" ${y===homeYear?'selected':''}>${y}</option>`).join('');

  el.innerHTML = `
    <div class="view-header">
      <div><h1>วันนี้ต้องทำอะไรบ้าง</h1><div class="view-sub">${userProfile.name ? 'สวัสดี '+escapeHtml(userProfile.name)+' · ' : ''}${escapeHtml(today)} · ค้างอยู่ ${live.length} งาน</div></div>
      <div class="header-actions">
        <select id="year-select" class="year-select" aria-label="ปี">${yearOpts}</select>
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
        <div class="stat-num">${openAsOf}</div><div class="stat-label">งานค้าง</div>
        <div class="stat-sub">${isPast ? 'ณ สิ้นช่วงที่เลือก' : (held ? 'ไม่รวมพักไว้ '+held+' งาน' : 'ยังไม่มีงานที่พักไว้')}</div>
      </div>
      <div class="stat-card ${lateN?'accent-coral':''}">
        <div class="stat-num">${soon.length}</div><div class="stat-label">ใกล้ครบกำหนด / เลยกำหนด</div>
        <div class="stat-sub">${lateN ? 'เลยกำหนด '+lateN+' งาน' : 'ไม่มีงานเลยกำหนด'}</div>
      </div>
      <div class="stat-card accent-mint">
        <div class="stat-num">${doneN}</div><div class="stat-label">เสร็จ (ช่วงที่เลือก)</div>
        ${deltaHtml}
      </div>
      ${rtCard}
    </div>

    ${soonHtml}

    <div class="ov-grid">
      <div class="panel ov-panel">
        <h3>ภาพรวมงานรายเดือน</h3>
        <div class="ov-legend">
          <span><i style="background:${OV_COLOR.carry}"></i>ยกมาจากเดือนก่อน</span>
          <span><i style="background:${OV_COLOR.added}"></i>เพิ่มเดือนนี้</span>
          <span><i style="background:${OV_COLOR.done}"></i>เสร็จ</span>
          <span class="hint">· แท่งซ้าย = งานค้างทั้งหมดในเดือน (ตัวเลขบนสุดคือยอดรวม)</span>
        </div>
        <div class="ov-chart"><canvas id="overview-chart"></canvas></div>
      </div>

      <div class="panel">
        <h3>ตัวชี้วัด</h3>
        <div class="kpi">
          <div class="kpi-label">งานที่เสร็จเทียบกับงานทั้งหมด</div>
          <div class="kpi-big">${kpi.pct == null ? '–' : kpi.pct + '%'}${kpi.total ? `<small>· เสร็จ ${kpi.done} จาก ${kpi.total} งาน</small>` : ''}</div>
          <div class="kpi-bar"><i style="width:${kpi.pct || 0}%"></i></div>
          <div class="kpi-sub">งานทั้งหมด ${kpi.total} · เสร็จ ${kpi.done} · ยังไม่เสร็จ ${Math.max(0, kpi.total - kpi.done)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">เวลาเฉลี่ยที่ใช้ปิดงาน</div>
          <div class="kpi-big">${avgTxt}${kpi.avg == null ? '' : '<small>วัน</small>'}</div>
          <div class="kpi-sub">จากงานที่เสร็จในช่วงที่เลือก</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">งานค้างที่อายุเกิน 30 วัน</div>
          <div class="kpi-big ${kpi.stale.length ? 'red' : ''}">${kpi.stale.length}<small>งาน</small></div>
          ${isPast ? '<div class="kpi-sub">นับ ณ สิ้นช่วงที่เลือก</div>' : ''}
          ${kpi.stale.length ? '<button type="button" class="kpi-link" id="stale-detail">รายละเอียด ›</button>' : ''}
        </div>
      </div>
    </div>
  `;

  $('#year-select').addEventListener('change', (e)=>{ homeYear = parseInt(e.target.value, 10); renderHome(); });
  $('#range-toggle').addEventListener('click', (e)=>{
    if(e.target.tagName !== 'BUTTON') return;
    homeRange = e.target.dataset.r;
    renderHome();
  });
  $all('.soon-row').forEach(it=> it.addEventListener('click', (e)=>{
    const chk = e.target.closest('.row-check');
    if(it.dataset.kind === 'routine'){ if(chk) RT.toggle(it.dataset.id); else RT.go(); return; }
    if(chk){ setTaskStatus(it.dataset.id, 'เสร็จแล้ว'); return; }
    switchView('work'); setTimeout(()=>openTaskModal(it.dataset.id), 50);
  }));
  const rc = $('#rt-card'); if(rc) rc.addEventListener('click', RT.go);
  const sd = $('#stale-detail');
  if(sd) sd.addEventListener('click', ()=> showStaleTasks(kpi.stale, kpi.asOf));

  const qaTitle = $('#qa-title');
  const doQuickAdd = ()=> quickAddTask(qaTitle.value, $('#qa-cat').value);
  $('#qa-btn').addEventListener('click', doQuickAdd);
  qaTitle.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); doQuickAdd(); } });
  $('#export-csv-btn').addEventListener('click', exportSummaryCSV);

  renderOverviewChart(per);
}
