// Build a self-contained interactive HTML dashboard for the Q3 rate tracker.
// Q3 sibling of build_q2_html.js — reads 04_analysis/q3_dashboard_data.json (from build_q3_views.js). No external libs.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '04_analysis');
const REPORTS = path.join(__dirname, '..', '05_reports');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'q3_dashboard_data.json'), 'utf8'));
// Optional: PfP fee-risk dataset (scripts/build_pfp_risk.js). Tab shows a how-to note if absent.
let pfp = null;
try { pfp = JSON.parse(fs.readFileSync(path.join(OUT, 'q3_pfp_risk_data.json'), 'utf8')); } catch (e) {}

const CSS = `
*{box-sizing:border-box} body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16242b;background:#f4f6f7}
header{background:#0e1b1f;color:#fff;padding:18px 26px;border-bottom:4px solid #00ccbc}
header h1{margin:0;font-size:20px} header .sub{color:#9fb3b8;font-size:13px;margin-top:3px}
.wrap{max-width:1500px;margin:0 auto;padding:20px 26px}
.banner{background:#fff8e1;border:1px solid #f2d492;color:#8a5a00;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13.5px}
.kpis{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.kpi{background:#fff;border:1px solid #e2e8ea;border-radius:10px;padding:14px 18px;min-width:160px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.kpi .n{font-size:26px;font-weight:700} .kpi .l{color:#5b6b71;font-size:12px;margin-top:2px}
.kpi.good .n{color:#1a7f37} .kpi.warn .n{color:#b54708}
.tabs{display:flex;gap:6px;border-bottom:2px solid #dfe6e8;margin-bottom:16px;flex-wrap:wrap}
.tabs button{border:0;background:none;padding:10px 16px;font-size:14px;font-weight:600;color:#5b6b71;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}
.tabs button.on{color:#0e1b1f;border-bottom-color:#00ccbc}
.panel{display:none} .panel.on{display:block}
.controls{display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.controls input[type=search]{padding:8px 10px;border:1px solid #cfd8da;border-radius:8px;width:320px;font-size:14px}
.controls label{font-size:13px;color:#3a4a50;display:flex;gap:6px;align-items:center}
.muted{color:#5b6b71;font-size:12.5px;margin:4px 0 12px}
.tablewrap{overflow:auto;max-height:72vh;border:1px solid #e2e8ea;border-radius:10px;background:#fff}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:7px 10px;text-align:right;white-space:nowrap}
th{position:sticky;top:0;background:#26383e;color:#fff;font-weight:600;z-index:2}
td.l,th.l{text-align:left}
tbody tr:nth-child(even){background:#fafbfb}
.menu{max-width:380px;overflow:hidden;text-overflow:ellipsis}
.ok{background:#d7f5e0!important;color:#0f5132} .bad{background:#ffd6d6!important;color:#9b1c1c}
td .act{font-weight:600;font-size:13px} td .exp{font-size:11px;opacity:.8;margin-top:1px}
.bad .exp{font-weight:600;opacity:1}
.tick{font-weight:700;color:#1a7f37;text-align:center} .cross{font-weight:700;color:#c00;text-align:center}
.pill{display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600}
.pill.new{background:#eef2ff;color:#3538cd} .pill.var{background:#fff4e5;color:#b54708}
.heat td{font-variant-numeric:tabular-nums}
.ctitle{font-weight:700;font-size:14px;margin:6px 0 4px}
.chart{background:#fff;border:1px solid #e2e8ea;border-radius:10px;padding:12px 14px 6px;margin-bottom:16px}
.legend{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:6px;font-size:12px;color:#3a4a50}
.legend span{display:flex;align-items:center;gap:5px} .legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
footer{color:#7a8a90;font-size:12px;padding:14px 26px}
/* ---- Fee-risk (PfP) tab ---- */
.explain{background:#eef7f6;border:1px solid #bfe3df;border-radius:10px;padding:14px 18px;margin-bottom:18px;font-size:13.5px}
.explain b{color:#0a5c54}
.explain .steps{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.explain .step{flex:1;min-width:220px;background:#fff;border:1px solid #d8e8e6;border-radius:8px;padding:10px 12px}
.explain .step .t{font-weight:700;margin-bottom:3px;color:#0e1b1f}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-bottom:18px}
.card{background:#fff;border:1px solid #e2e8ea;border-radius:10px;padding:16px 18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.card .name{font-weight:700;font-size:15px} .card .contract{color:#7a8a90;font-size:11.5px;margin-top:1px}
.card .hero{font-size:34px;font-weight:700;margin:8px 0 0} .card .hero small{font-size:15px;font-weight:600;color:#5b6b71}
.card .meaning{color:#3a4a50;font-size:12.5px;margin:6px 0 10px;min-height:34px}
.scale{position:relative;height:10px;border-radius:5px;margin:16px 6px 22px;background:linear-gradient(90deg,#7fd6a4 0%,#c9e9d4 45%,#e7ebec 60%,#f6c6c6 78%,#ef9c9c 100%)}
.scale .zone{position:absolute;top:14px;font-size:10.5px;color:#7a8a90}
.scale .mk{position:absolute;top:-7px;width:2px;height:24px;background:#16242b;border-radius:1px}
.scale .mk:after{content:attr(data-l);position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:10.5px;font-weight:700;white-space:nowrap}
.scale .mk.ghost{background:#8fa3a9} .scale .mk.ghost:after{display:none}
.nowline{display:flex;justify-content:space-between;font-size:12.5px;margin-top:6px;color:#3a4a50}
.nowline b{font-size:13px}
.dir{display:inline-block;font-weight:700;border-radius:9px;padding:1px 8px;font-size:11.5px;margin-left:6px}
.dir.up{background:#ffd6d6;color:#9b1c1c} .dir.down{background:#d7f5e0;color:#0f5132} .dir.flat{background:#e7ebec;color:#5b6b71}
.card .action{font-size:12px;color:#0a5c54;background:#eef7f6;border-radius:7px;padding:6px 9px;margin-top:10px}
details.bands{margin-top:10px;font-size:12px;color:#5b6b71}
details.bands table{font-size:11.5px;margin-top:6px;border-collapse:collapse;width:auto}
details.bands td,details.bands th{border:1px solid #e2e8ea;padding:2px 8px;text-align:right;background:#fff;color:#16242b;position:static}
.kpi.bad .n{color:#9b1c1c}
.chip{display:inline-block;border-radius:9px;padding:1px 8px;font-size:11.5px;font-weight:700}
.chip.up{background:#ffd6d6;color:#9b1c1c} .chip.down{background:#d7f5e0;color:#0f5132} .chip.flat{background:#e7ebec;color:#5b6b71}
.imp.up{color:#9b1c1c;font-weight:700} .imp.down{color:#0f5132;font-weight:700} .imp.flat{color:#5b6b71}
.pill.low{background:#f2f4f5;color:#6b7a80} .pill.grp{background:#fff4e5;color:#b54708}
.v{font-weight:700} .sub2{font-size:11px;color:#5b6b71;margin-top:1px}
.worse{color:#9b1c1c} .better{color:#0f5132}
.methnote{color:#7a8a90;font-size:12px;margin-top:12px}
.methnote b{color:#5b6b71}
/* ---- Fee-risk: what-if planner, top-10 £ tables, bucket breakdown ---- */
.info{cursor:help;color:#7a8a90;font-size:13px;font-weight:400;margin-left:2px}
.bandnote{margin:6px 0 2px;color:#3a4a50;font-size:12px}
.bandnote b{color:#0a5c54}
tr.empty td{color:#b9c4c8!important}
.slidebox{margin-top:10px;background:#fff;border:1px dashed #7fc9c2;border-radius:7px;padding:8px 10px}
.slidebox label{font-size:12px;color:#3a4a50;display:block;margin-bottom:4px}
.slidebox input[type=range]{width:100%;accent-color:#00ccbc;margin:2px 0 4px}
.slout{font-size:12.5px;color:#16242b}
.worstgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px;margin-bottom:18px}
.worstgrid .card{overflow-x:auto}
.worstgrid table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
.worstgrid th,.worstgrid td{position:static;padding:4px 6px;border-bottom:1px solid #eef2f3;white-space:nowrap;text-align:right}
.worstgrid th{background:#f2f5f6;color:#3a4a50;font-weight:600;z-index:auto;white-space:normal}
.worstgrid th.l,.worstgrid td.l{text-align:left}
.worstgrid td.l{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
details.bands{overflow-x:auto}
`;

function shell(){ return `
<header><h1>Deliveroo — Q3 2026 Rate Tracker</h1>
<div class="sub">Charged rate vs the Q3 update file · all Deliveroo accounts · rolling 4 weeks + full Q3 distributions</div></header>
<div class="wrap">
  <div id="banner"></div>
  <div class="kpis" id="kpis"></div>
  <div class="tabs">
    <button data-t="pfp" class="on">Fee risk next quarter</button>
    <button data-t="check">Rate check by menu</button>
    <button data-t="launched">Menus launched in Q3</button>
    <button data-t="count">Menus by rate / week</button>
    <button data-t="gmv">GMV by rate / week</button>
  </div>
  <div id="pfp" class="panel on"></div>
  <div id="check" class="panel"></div>
  <div id="launched" class="panel"></div>
  <div id="count" class="panel"></div>
  <div id="gmv" class="panel"></div>
</div>
<footer id="foot"></footer>`; }

// ---- client app (serialized) ----
function q3App(){
  const D = window.__Q3__;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pc = (v,d=1) => v==null||v===''?'':Number(v).toFixed(d)+'%';
  const gbp = n => n==null?'':'£'+Math.round(n).toLocaleString('en-GB');
  const adjp = a => (a>0?'+':'')+Number(a).toFixed(2);

  // awaiting-data banner
  if(D.awaitingData){
    $('#banner').innerHTML='<div class="banner"><b>Q3 rates load complete — rate-check awaiting weekly data.</b> '
      +'The Q3 Adjusted Core Services Rate is effective from <b>'+D.effectiveFrom+'</b> (10th business day after Q2 end). '
      +'No weekly statements on/after that date have been loaded yet (first full Q3-rate week ends 19 Jul 2026), so the '
      +'per-menu rate-check and launched-menu tabs are empty. The distribution tabs below show the '+D.kpis.q2weeks+' Q3 week(s) already in. '
      +'Re-run <code>build_q3_views.js</code> then <code>build_q3_html.js</code> once new weeks land and everything populates automatically.</div>';
  }

  // KPIs
  $('#kpis').innerHTML = [
    ['good', D.kpis.allAgree+' / '+D.kpis.menusChecked, 'Existing menus agree with Q3 file (all 4 wks)'],
    [D.kpis.allAgree===D.kpis.menusChecked?'good':'warn', (D.kpis.menusChecked-D.kpis.allAgree), 'Existing menus needing review'],
    [D.kpis.launchedOk===D.kpis.launched?'good':'warn', D.kpis.launchedOk+' / '+D.kpis.launched, 'Q3-launched menus on New Q3 rate card'],
    ['', D.kpis.q2weeks, 'Q3 weeks analysed'],
  ].map(k=>`<div class="kpi ${k[0]}"><div class="n">${k[1]}</div><div class="l">${k[2]}</div></div>`).join('');

  // ---- Tab: rate check by menu ----
  function renderCheck(){
    const q=($('#chkSearch').value||'').toLowerCase(); const only=$('#chkOnly').checked;
    const rows=D.rateCheck.filter(r=>(!only||!r.ok) && (!q || (r.m+' '+r.a).toLowerCase().includes(q)));
    let h='<table><thead><tr><th class="l">Account</th><th class="l">Menu</th>';
    D.rolling.forEach(w=>h+='<th>'+w+'</th>'); h+='<th>All weeks agree?</th></tr></thead><tbody>';
    for(const r of rows){
      h+='<tr><td class="l">'+esc(r.a)+'</td><td class="l menu" title="'+esc(r.m)+'">'+esc(r.m)+'</td>';
      r.w.forEach(w=>{ if(!w){ h+='<td>·</td>'; return; }
        const tip = w.ok ? 'Charged rate matches the Q3 update file' : ('Over/(under)charged £'+w.v.toFixed(2)+' this week vs Q3 file');
        h+='<td class="'+(w.ok?'ok':'bad')+'" title="'+tip+'"><div class="act">'+pc(w.e)+'</div>'
          +'<div class="exp">should be '+pc(w.exp)+(w.ok?' ✓':'')+'</div></td>';
      });
      h+='<td class="'+(r.ok?'tick':'cross')+'">'+(r.ok?'✓':'✗')+'</td></tr>';
    }
    h+='</tbody></table>';
    $('#chkTable').innerHTML=h; $('#chkCount').textContent=rows.length+' menus shown';
  }
  $('#check').innerHTML='<div class="controls"><input type="search" id="chkSearch" placeholder="Filter menu or account…">'
    +'<label><input type="checkbox" id="chkOnly"> show only menus needing review</label><span class="muted" id="chkCount"></span></div>'
    +'<div class="muted">Each cell shows the week’s <b>actual</b> effective rate (commission ÷ GMV) with the <b>“should be”</b> rate beneath it — the Q3 update file’s agreed rate applied to that week’s orders. They match when the menu is charged correctly (green ✓); <b>red</b> = they differ (hover for the £ impact); <b>·</b> = no trade. The rate is banded by order value, so it moves a little with basket mix each week — what matters is actual = should-be.</div>'
    +'<div class="tablewrap" id="chkTable"></div>';
  $('#chkSearch').oninput=renderCheck; $('#chkOnly').onchange=renderCheck; renderCheck();

  // ---- Tab: menus launched in Q3 (checked vs New Q3 rate card) ----
  function renderLaunched(){
    const q=($('#lSearch').value||'').toLowerCase(); const only=$('#lOnly').checked;
    const rows=D.launched.filter(r=>(!only||!r.ok) && (!q || (r.m+' '+r.a).toLowerCase().includes(q)));
    let h='<table><thead><tr><th class="l">Account</th><th class="l">Menu</th>';
    D.rolling.forEach(w=>h+='<th>'+w+'</th>'); h+='<th>All weeks match card?</th></tr></thead><tbody>';
    for(const r of rows){
      const pill=r.variant?' <span class="pill var">possible variant</span>':' <span class="pill new">new site</span>';
      h+='<tr><td class="l">'+esc(r.a)+'</td><td class="l menu" title="'+esc(r.m)+'">'+esc(r.m)+pill+'</td>';
      r.w.forEach(w=>{ if(!w){ h+='<td>·</td>'; return; }
        const tip = w.ok ? 'Charged rate matches the New Q3 rate card' : ('Over/(under)charged £'+w.v.toFixed(2)+' this week vs the New Q3 rate card');
        h+='<td class="'+(w.ok?'ok':'bad')+'" title="'+tip+'"><div class="act">'+pc(w.e)+'</div><div class="exp">should be '+pc(w.exp)+(w.ok?' ✓':'')+'</div></td>';
      });
      h+='<td class="'+(r.ok?'tick':'cross')+'">'+(r.ok?'✓':'✗')+'</td></tr>';
    }
    h+='</tbody></table>'; $('#lTable').innerHTML=h; $('#lCount').textContent=rows.length+' menus shown';
  }
  $('#launched').innerHTML='<div class="controls"><input type="search" id="lSearch" placeholder="Filter menu or account…">'
    +'<label><input type="checkbox" id="lOnly"> show only menus needing review</label><span class="muted" id="lCount"></span></div>'
    +'<div class="muted">Menus that launched after the start of Q3 (not in the existing-site Q3 file), checked against the <b>New Q3 rate card</b> — contract headline <b>− 1.50%</b> (−0.50 JBP + −1.00 Ops; identical to Q2). Each cell = the week’s actual effective rate with the <b>“should be”</b> card rate beneath; green ✓ = matches the card, <b>red</b> = differs (hover for £ impact). Hawkins (flat-rate brand) is excluded; “possible variant” = name resembles an existing site — verify it isn’t already on the existing-site rate.</div>'
    +'<div class="tablewrap" id="lTable"></div>';
  $('#lSearch').oninput=renderLaunched; $('#lOnly').onchange=renderLaunched; renderLaunched();

  // ---- trend chart (rate tiers over weeks) ----
  const TIERS=[
    {n:'≤ 21.5%', c:'#9aa7ab', t:r=>r<=21.5},
    {n:'22–23.5%', c:'#3aa0ff', t:r=>r>=22&&r<=23.5},
    {n:'24–25.5%', c:'#00ccbc', t:r=>r>=24&&r<=25.5},
    {n:'26–27.5%', c:'#f2a900', t:r=>r>=26&&r<=27.5},
    {n:'≥ 28%', c:'#e0556e', t:r=>r>=28},
  ];
  function tierSeries(rows){ return TIERS.map(T=>({name:T.n,color:T.c,
    values:D.q2weeks.map((_,wi)=>rows.reduce((s,r)=>s+(T.t(parseFloat(r.rate))?(r.vals[wi]||0):0),0))})); }
  function lineChart(weeks, series, fmt){
    const W=1440,H=340,ml=78,mr=18,mt=16,mb=46, iw=W-ml-mr, ih=H-mt-mb;
    let max=0; series.forEach(s=>s.values.forEach(v=>{if(v>max)max=v;})); if(max<=0)max=1;
    const X=i=>ml+(weeks.length>1? i*iw/(weeks.length-1):iw/2), Y=v=>mt+ih-(v/max)*ih;
    let g='<svg viewBox="0 0 '+W+' '+H+'" width="100%" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%">';
    for(let k=0;k<=4;k++){ const v=max*k/4, yy=Y(v);
      g+='<line x1="'+ml+'" y1="'+yy+'" x2="'+(W-mr)+'" y2="'+yy+'" stroke="#e6ecee"/>'
        +'<text x="'+(ml-8)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11" fill="#7a8a90">'+fmt(v)+'</text>'; }
    weeks.forEach((w,i)=>{ g+='<text x="'+X(i)+'" y="'+(H-mb+18)+'" text-anchor="middle" font-size="11" fill="#7a8a90">'+w+'</text>'; });
    series.forEach(s=>{ let d=''; s.values.forEach((v,i)=>{ d+=(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1); });
      g+='<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2.5"/>';
      s.values.forEach((v,i)=>{ g+='<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="2.6" fill="'+s.color+'"/>'; }); });
    g+='</svg>';
    const lg='<div class="legend">'+series.map(s=>'<span><i style="background:'+s.color+'"></i>'+s.name+'</span>').join('')+'</div>';
    return '<div class="chart">'+g+lg+'</div>';
  }

  // ---- heatmap tables (count + gmv), each with a trend chart on top ----
  function heat(elId, rows, weeks, fmt, hint, chartTitle){
    let max=0; rows.forEach(r=>r.vals.forEach(v=>{if(v>max)max=v;}));
    let h='<div class="muted">'+hint+'</div>';
    h+='<div class="ctitle">'+chartTitle+'</div>'+lineChart(weeks, tierSeries(rows), fmt);
    h+='<div class="tablewrap"><table class="heat"><thead><tr><th class="l">Effective rate</th>';
    weeks.forEach(w=>h+='<th>'+w+'</th>'); h+='<th>Total</th></tr></thead><tbody>';
    for(const r of rows){
      h+='<tr><td class="l"><b>'+r.rate+'</b></td>';
      r.vals.forEach(v=>{ const a=max?v/max:0; const bg='rgba(0,204,188,'+(a*0.85).toFixed(3)+')';
        h+='<td style="background:'+(v?bg:'transparent')+'">'+(v?fmt(v):'')+'</td>'; });
      h+='<td><b>'+fmt(r.total)+'</b></td></tr>';
    }
    h+='</tbody></table></div>'; $(elId).innerHTML=h;
  }
  heat('#count', D.countByRate.rows, D.q2weeks, v=>Math.round(v).toLocaleString('en-GB'),
    'Number of menus in each effective-rate band (0.5% buckets), per Q3 week. Darker = more menus. The ~19.5% band is the Hawkins flat-rate brand.',
    'Trend — number of menus by rate tier');
  heat('#gmv', D.gmvByRate.rows, D.q2weeks, v=>gbp(v),
    'GMV (£) of orders in each effective-rate band (0.5% buckets), per Q3 week. Darker = more GMV.',
    'Trend — GMV by rate tier');

  // ---- Tab: fee risk next quarter (the contract's 3 PfP adjustment metrics) ----
  (function pfpTab(){
    const P = window.__PFP__;
    if(!P){
      $('#pfp').innerHTML='<div class="banner"><b>Fee-risk data not built yet.</b> Run <code>node scripts/build_pfp_risk.js</code> '
        +'(BigQuery pull + contract banding) and then rebuild this page with <code>node scripts/build_q3_html.js</code>.</div>';
      return;
    }
    const adjTxt = a => a==null ? 'new' : (a>0?'+':a<0?'−':'') + Math.abs(a).toFixed(1)+'%';
    const gbpAbs = n => '£'+Math.round(Math.abs(n)).toLocaleString('en-GB');
    const METRICS=[
      { key:'rwt', name:'Riders kept waiting', contract:'Contract metric: “Rider Wait Time Past Target”',
        meaning:'How often a rider turns up and the food isn’t ready — the share of orders where the rider is held more than 5 minutes. Riders hate waiting, so Deliveroo rewards fast handover.',
        action:'Fix: have orders bagged and ready before the rider arrives — biggest wins at Friday/Saturday dinner.',
        min:-2.0, max:0.8,
        bands:[['Under 3%','−2.0%'],['3–12.9%','−1.8% … −0.2% (0.2 steps)'],['12–12.9%','0 (no effect)'],['13–15.9%','+0.2% … +0.6%'],['16% or more','+0.8%']] },
      { key:'mi', name:'Missing or wrong items', contract:'Contract metric: “Missing Items”',
        meaning:'The share of orders where the customer reported something missing or wrong. Every claim costs Deliveroo a refund, so accurate orders earn a discount.',
        action:'Fix: check every bag against the ticket before sealing — sauces, sides and drinks are the usual culprits.',
        min:-2.4, max:1.6,
        bands:[['Under 1%','−2.4%'],['1–3.74%','−2.2% … −0.2% (0.25 steps)'],['3.75–3.99%','0 (no effect)'],['4–5.74%','+0.2% … +1.4%'],['5.75% or more','+1.6%']] },
      { key:'oh', name:'Open at peak times', contract:'Contract metric: “Open Hours at Peak” (5pm–9pm)',
        meaning:'How much of the 5pm–9pm dinner window the menu is actually open and taking orders. Going offline at dinner loses Deliveroo sales, so staying open earns a discount.',
        action:'Fix: keep tablets on and avoid “busy mode” switch-offs between 5pm and 9pm.',
        min:-1.2, max:0,
        bands:[['Over 99%','−1.2%'],['Over 98%','−1.0%'],['Over 96%','−0.8%'],['Over 94%','−0.6%'],['Over 92%','−0.4%'],['Over 90%','−0.2%'],['90% or less','0 (no effect)']] },
    ];
    // ---- £ quantification of improvement ----
    // One contract band step = 0.2% of commission rate on all three metrics. "Improved one band"
    // = the menu's projected adjustment moves one 0.2 step towards the metric's best (min) value.
    const BANDMIN={rwt:-2.0,mi:-2.4,oh:-1.2}, STEP=0.2;
    const oneBandGbp = s => s.gmvQuarter*STEP/100;                       // £/qtr from one band better
    const toBestGbp = (s,k) => s.gmvQuarter*(s.proj[k]-BANDMIN[k])/100;  // £/qtr if metric hit best band
    // Menus with room to improve on each metric: measurable, not low-data, not already in the best band.
    // Sorted biggest sales first — a one-band improvement is worth 0.2% of a menu's sales, so
    // GMV order = biggest-£-saving order.
    const improvable={};
    METRICS.forEach(m=>{ improvable[m.key]=P.sites
      .filter(s=>!s.lowVolume && s[m.key]!=null && s.proj[m.key]!=null && s.proj[m.key]>BANDMIN[m.key])
      .sort((a,b)=>b.gmvQuarter-a.gmvQuarter); });
    // Counts for the planner wording — recomputed from the data on every rebuild.
    const atBest={};
    METRICS.forEach(m=>{ atBest[m.key]=P.sites
      .filter(s=>!s.lowVolume && s[m.key]!=null && s.proj[m.key]!=null && s.proj[m.key]<=BANDMIN[m.key]).length; });
    const lowVolN = P.sites.filter(s=>s.lowVolume).length;
    const lowVolThresh = P.lowVolumeThreshold || 30;
    // Bucket = the contract band a menu's quarter-to-date score lands in (one row per 0.2 adjustment step).
    function bandLabel(key,a){
      if(key==='rwt'){ if(a<=-2) return 'Under 3%'; if(a>=0.8) return '16% or more';
        const k=Math.round((a+2)/0.2); return (2+k)+'–'+(2+k)+'.9%'; }
      if(key==='mi'){ if(a<=-2.4) return 'Under 1%'; if(a>=1.6) return '5.75% or more';
        const k=Math.round((a+2.2)/0.2); const lo=1+0.25*k; return lo.toFixed(2)+'–'+(lo+0.24).toFixed(2)+'%'; }
      return ({'-1.2':'Over 99%','-1':'98–99%','-0.8':'96–98%','-0.6':'94–96%','-0.4':'92–94%','-0.2':'90–92%','0':'90% or less'})[String(a)]||String(a);
    }
    // Every contract band for a metric (adjustment steps of 0.2), best band first.
    function bandSteps(key){
      if(key==='oh') return [-1.2,-1,-0.8,-0.6,-0.4,-0.2,0];
      const max = key==='rwt' ? 0.8 : 1.6, out=[];
      for(let a=BANDMIN[key]; a<=max+1e-9; a+=STEP) out.push(Math.round(a*10)/10);
      return out;
    }
    function bucketTable(m){
      const groups=new Map();
      for(const s of P.sites){ if(s.lowVolume||s[m.key]==null||s.proj[m.key]==null) continue;
        const a=s.proj[m.key]; const g=groups.get(a)||{n:0,gmv:0,save:0};
        g.n++; g.gmv+=s.gmvQuarter; if(a>BANDMIN[m.key]) g.save+=oneBandGbp(s); groups.set(a,g); }
      let h='<table><tr><th>Score this qtr</th><th>Adjustment</th><th>Menus</th><th>Sales / qtr</th><th>£ / qtr if bucket improves one band</th></tr>';
      for(const a of bandSteps(m.key)){
        const g=groups.get(a);
        if(!g){ h+='<tr class="empty"><td>'+bandLabel(m.key,a)+'</td><td>'+adjTxt(a)+'</td><td>—</td><td>—</td><td>—</td></tr>'; continue; }
        h+='<tr><td>'+bandLabel(m.key,a)+'</td><td>'+adjTxt(a)+'</td><td>'+g.n.toLocaleString()+'</td>'
          +'<td>£'+Math.round(g.gmv).toLocaleString()+'</td><td>'+(a>BANDMIN[m.key]?'<span class="better">−£'+Math.round(g.save).toLocaleString()+'</span>':'— (best bucket)')+'</td></tr>';
      }
      return h+'</table>';
    }
    function scaleBar(m, curAdj, projAdj){
      const pos = a => Math.max(4, Math.min(96, Math.round(100*(a-m.min)/(m.max-m.min))));
      let h='<div class="scale">';
      if(curAdj!=null) h+='<div class="mk ghost" style="left:'+pos(curAdj)+'%" title="now: '+adjTxt(curAdj)+'"></div>';
      if(projAdj!=null) h+='<div class="mk" style="left:'+pos(projAdj)+'%" data-l="'+adjTxt(projAdj)+'"></div>';
      return h+'<div class="zone" style="left:0">← bigger discount</div><div class="zone" style="right:0">penalty →</div></div>';
    }
    function metricCard(m){
      const val=P.portfolio[m.key], projAdj=P.portfolio.adj[m.key], curAdj=P.groupNow.adj[m.key];
      const dir = projAdj==null||curAdj==null ? 'flat' : projAdj>curAdj ? 'up' : projAdj<curAdj ? 'down' : 'flat';
      const dirTxt={up:'▲ fees heading up',down:'▼ fees heading down',flat:'= holding steady'}[dir];
      return '<div class="card"><div class="name">'+m.name+' <span class="dir '+dir+'">'+dirTxt+'</span>'
        +' <span class="info" title="'+esc(m.meaning+' '+m.action)+'">ⓘ</span></div>'
        +'<div class="contract">'+m.contract+'</div>'
        +'<div class="hero">'+(val==null?'—':val.toFixed(1)+'%')+' <small>across all menus, '+P.quarter+' so far</small></div>'
        +scaleBar(m,curAdj,projAdj)
        +'<div class="nowline"><span>Earning now (set last quarter): <b>'+adjTxt(curAdj)+'</b></span>'
        +'<span>If the quarter ended today: <b>'+adjTxt(projAdj)+'</b></span></div>'
        +'<details class="bands"><summary>Contract bands & where our menus sit — £ per bucket</summary>'
        +'<div class="bandnote">'+m.meaning+'<br><b>'+m.action+'</b></div>'
        +bucketTable(m)
        +'<div style="margin-top:4px">Greyed bands hold no menus. Low-data menus excluded. £ = platform-fee change over a full quarter at current run-rate.</div></details></div>';
    }
    function plannerBox(m){
      const L=improvable[m.key];
      const allOne=L.reduce((a,s)=>a+oneBandGbp(s),0), allBest=L.reduce((a,s)=>a+toBestGbp(s,m.key),0);
      return '<div class="card"><div class="name">'+m.name+'</div>'
        +'<div class="slidebox"><label>Improve one band at <b id="pct_'+m.key+'">25%</b> of the '+L.length.toLocaleString()
        +' eligible menus <b>(a further '+atBest[m.key].toLocaleString()+' menus already earn this metric’s top discount — no band left to gain)</b>'
        +' — biggest sales first, regardless of current score</label>'
        +'<input type="range" min="0" max="100" step="5" value="25" id="sl_'+m.key+'">'
        +'<div class="slout" id="out_'+m.key+'"></div></div>'
        +'<div class="sub2" style="margin-top:6px">Max: <b>−£'+Math.round(allOne).toLocaleString()+'</b>/qtr if all improved one band · <b>−£'
        +Math.round(allBest).toLocaleString()+'</b>/qtr if all hit the best band</div></div>';
    }
    function worstTable(m){
      const rows=improvable[m.key].slice(0,10);
      let h='<div class="card"><div class="name">'+m.name+'</div><div class="contract">top 10 menus by £ at stake, '+P.quarter+' so far</div>'
        +'<table><tr><th class="l">Menu</th><th>Score</th><th>Sales / qtr</th><th>£/qtr, 1 band better</th><th>£/qtr, best bucket</th></tr>';
      for(const s of rows){
        h+='<tr><td class="l" title="'+esc(s.name)+'">'+esc(s.name)+'</td><td>'+s[m.key].toFixed(1)+'%</td>'
          +'<td>£'+Math.round(s.gmvQuarter).toLocaleString()+'</td>'
          +'<td><span class="better">−£'+Math.round(oneBandGbp(s)).toLocaleString()+'</span></td>'
          +'<td><span class="better">−£'+Math.round(toBestGbp(s,m.key)).toLocaleString()+'</span></td></tr>';
      }
      return h+'</table></div>';
    }
    const K=P.kpis;
    $('#pfp').innerHTML=
      '<div class="explain"><b>How Deliveroo sets our commission rate:</b> every menu starts from the same headline rate, and Deliveroo then moves it '
      +'<b>down</b> (a discount) or <b>up</b> (a penalty) based on three service measurements. What we score <b>this quarter decides the rate we pay all next quarter</b> '
      +'— so a bad quarter of service makes every order more expensive for three months. This tab shows how '+P.quarter+' is tracking, menu by menu, while there is still time to fix it.'
      +'<div class="steps">'
      +'<div class="step"><div class="t">1 · Deliveroo measures</div>Rider waiting, missing items and peak-time opening, for every menu, all quarter.</div>'
      +'<div class="step"><div class="t">2 · Each score maps to a rate move</div>Good scores earn up to <b>−5.6%</b> off the headline commission; poor scores add up to <b>+2.4%</b> on top.</div>'
      +'<div class="step"><div class="t">3 · Applied next quarter</div>The new rate kicks in ~2 weeks after quarter end and lasts the full quarter. (The separate −0.5% Marketer Ads discount is unaffected by these metrics.)</div>'
      +'</div></div>'
      +'<div class="cards">'+METRICS.map(metricCard).join('')+'</div>'
      +'<div class="ctitle">What-if planner — what improving each metric is worth</div>'
      +'<div class="muted">Each slider improves its metric by <b>one contract band</b> (−0.2% commission on a menu’s sales) at the chosen share of menus, '
      +'<b>biggest sales first regardless of current score</b> — a well-run high-GMV menu moving up one band beats a badly-scoring small one, so the £ builds fastest at low percentages. '
      +'Excluded only: menus already at the metric’s best band (count shown on each tile) and <b>'+lowVolN.toLocaleString()
      +' low-volume menus — fewer than '+lowVolThresh+' delivered orders so far this quarter, too little data for a reliable score</b>. '
      +'These counts are recalculated from the data every time the report is refreshed. '
      +'£ = platform-fee change next quarter at current run-rate.</div>'
      +'<div class="cards">'+METRICS.map(plannerBox).join('')+'</div>'
      +'<div class="ctitle">Biggest £ wins on each metric — top 10 menus by £ at stake</div>'
      +'<div class="muted">Ranked by the saving a one-band improvement is worth (i.e. by sales). Low-data menus excluded. “1 band better” = the menu moves one contract bucket '
      +'(−0.2% commission on its sales); “best bucket” = the menu reaches the metric’s maximum discount. £ = change in platform fees over a full quarter at current run-rate.</div>'
      +'<div class="worstgrid">'+METRICS.map(worstTable).join('')+'</div>'
      +'<div class="kpis">'
      +'<div class="kpi"><div class="n">'+K.measurable.toLocaleString()+'</div><div class="l">menus measured so far (of the '+K.sites.toLocaleString()+' rate-checked menus; excludes low-volume)</div></div>'
      +'<div class="kpi bad"><div class="n">'+K.atRisk.toLocaleString()+'</div><div class="l">heading for a HIGHER rate next quarter</div></div>'
      +'<div class="kpi good"><div class="n">'+K.improving.toLocaleString()+'</div><div class="l">heading for a LOWER rate next quarter</div></div>'
      +'<div class="kpi bad"><div class="n">£'+Math.round(K.riskGbp).toLocaleString()+'</div><div class="l">extra fees next quarter if nothing changes</div></div>'
      +'<div class="kpi good"><div class="n">£'+Math.round(K.oppGbp).toLocaleString()+'</div><div class="l">fee savings already in reach from improving menus</div></div>'
      +(function(){const net=K.riskGbp-K.oppGbp;
        return '<div class="kpi '+(net>0?'bad':'good')+'"><div class="n">'+(net>0?'+':'−')+'£'+Math.abs(Math.round(net)).toLocaleString()+'</div><div class="l">net effect next quarter (extra fees minus savings)</div></div>';})()
      +'</div>'
      +'<div class="controls"><input type="search" id="pfpQ" placeholder="Find a menu or site…">'
      +'<label><input type="checkbox" id="pfpOnly"> only menus heading for an increase</label>'
      +'<label>sort by <select id="pfpSort"><option value="impact">£ at stake</option><option value="delta">biggest rate move</option>'
      +'<option value="gmv">sales</option><option value="name">name</option></select></label>'
      +'<span class="muted" id="pfpCount"></span></div>'
      +'<div class="muted">Each metric cell shows the menu’s <b>score this quarter so far</b>, and underneath, the rate adjustment moving <b>from → to</b> '
      +'(what it earns now → what today’s score would earn next quarter). <span class="worse">Red</span> = getting more expensive, '
      +'<span class="better">green</span> = getting cheaper. “£ next quarter” is the extra cost (or saving) on a full quarter of sales at current run-rate if the quarter ended today.</div>'
      +'<div class="tablewrap" id="pfpTbl"></div>'
      +'<div class="methnote"><b>Methodology & caveats.</b> Metrics computed from our BigQuery copies of Deliveroo’s operational feeds (orders, missing-item claims, hourly opening) for '
      +P.qStart+' to '+K.maxD+' ('+K.elapsed+' of 92 days). Missing items and peak opening reproduce Deliveroo’s own quarterly measurements almost exactly (validated against the Q3 Commission Output); '
      +'rider waiting is a calibrated proxy (tuned threshold, ±2pp for most sites) — treat as directional. “Group score” = Deliveroo measured that menu on the shared group value last quarter. '
      +'Covers the same menus as the rate-check tab (matched to the Q3 commission file and trading in the check window). The Marketer Ads −0.5% is excluded throughout. Built '+P.generated+'.</div>';

    function metricCell(val, curA, projA, low){
      if(val==null) return '<td>·</td>';
      const dir = curA==null||projA==null ? 'flat' : projA>curA ? 'up' : projA<curA ? 'down' : 'flat';
      const cls = low ? 'flat' : dir;
      return '<td><div class="v"'+(low?' style="color:#8fa3a9"':'')+'>'+val.toFixed(1)+'%</div>'
        +'<div class="sub2 '+(cls==='up'?'worse':cls==='down'?'better':'')+'">'+adjTxt(curA)+' → '+adjTxt(projA)+'</div></td>';
    }
    function renderPfp(){
      const q=($('#pfpQ').value||'').toLowerCase(), only=$('#pfpOnly').checked, sort=$('#pfpSort').value;
      const rows=P.sites.filter(s=>(!q||s.name.toLowerCase().includes(q)) && (!only||(s.delta!=null&&s.delta>0&&!s.lowVolume)));
      rows.sort((a,b)=> sort==='name' ? a.name.localeCompare(b.name)
        : sort==='gmv' ? b.gmv-a.gmv
        : sort==='delta' ? ((b.delta==null?-99:b.delta)-(a.delta==null?-99:a.delta))
        : ((b.impact==null?-1e15:b.impact)-(a.impact==null?-1e15:a.impact)));
      let h='<table><thead><tr><th class="l">Menu</th><th>Orders</th><th>Sales so far</th>'
        +'<th>Riders kept waiting</th><th>Missing / wrong items</th><th>Open at peak (5–9pm)</th>'
        +'<th>Rate move if qtr ended today</th><th>£ next quarter</th></tr></thead><tbody>';
      for(const s of rows){
        const pills=(s.isNew?' <span class="pill new">new in Q3</span>':'')
          +(s.lowVolume?' <span class="pill low" title="Fewer than 30 delivered orders so far — scores can swing a lot">low data</span>':'')
          +(s.onGroupRate?' <span class="pill grp" title="Deliveroo measured this menu on the shared group score last quarter, not its own">group score</span>':'');
        const deltaChip = s.delta==null ? '<span class="chip flat">not measurable</span>'
          : s.delta>0 ? '<span class="chip up">▲ +'+s.delta.toFixed(1)+'% — more fees</span>'
          : s.delta<0 ? '<span class="chip down">▼ −'+Math.abs(s.delta).toFixed(1)+'% — less fees</span>'
          : '<span class="chip flat">= no change</span>';
        const imp = s.impact==null ? '<span class="imp flat">·</span>'
          : s.impact>0 ? '<span class="imp up">'+gbpAbs(s.impact)+' extra</span>'
          : s.impact<0 ? '<span class="imp down">'+gbpAbs(s.impact)+' saved</span>'
          : '<span class="imp flat">£0</span>';
        const c=s.cur||{rwt:null,mi:null,oh:null};
        h+='<tr><td class="l menu" title="'+esc(s.name)+'">'+esc(s.name)+pills+'</td>'
          +'<td>'+s.delivered.toLocaleString()+'</td><td>£'+Math.round(s.gmv).toLocaleString()+'</td>'
          +metricCell(s.rwt,c.rwt,s.proj.rwt,s.lowVolume)
          +metricCell(s.mi,c.mi,s.proj.mi,s.lowVolume)
          +metricCell(s.oh,c.oh,s.proj.oh,s.lowVolume)
          +'<td>'+deltaChip+'</td><td>'+imp+'</td></tr>';
      }
      $('#pfpTbl').innerHTML=h+'</tbody></table>';
      $('#pfpCount').textContent=rows.length.toLocaleString()+' menus shown';
    }
    $('#pfpQ').oninput=renderPfp; $('#pfpOnly').onchange=renderPfp; $('#pfpSort').onchange=renderPfp;
    renderPfp();
    // what-if sliders on the metric cards
    METRICS.forEach(m=>{
      const sl=$('#sl_'+m.key); if(!sl) return;
      const L=improvable[m.key];
      const upd=()=>{
        const pct=+sl.value, n=Math.round(L.length*pct/100);
        const sav=L.slice(0,n).reduce((a,s)=>a+oneBandGbp(s),0);
        $('#pct_'+m.key).textContent=pct+'%';
        $('#out_'+m.key).innerHTML='<b>'+n.toLocaleString()+'</b> menus improved → <b class="better">−£'
          +Math.round(sav).toLocaleString()+'</b> platform fees next quarter';
      };
      sl.oninput=upd; upd();
    });
  })();

  // ---- tabs ----
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id===b.dataset.t));
  });
  $('#foot').textContent='Generated from weekly Deliveroo statements (read in place from the Finance shared drive). Latest week ending '+D.generated+'. Q3 rates effective '+D.effectiveFrom+'. Rolling-4 (Q3-effective) weeks: '+(D.rolling.length?D.rolling.join(', '):'none yet')+'.';
}

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Deliveroo Q3 Rate Tracker</title><style>'+CSS+'</style></head><body>'
  + shell()
  + '<script>window.__Q3__='+JSON.stringify(data)+';window.__PFP__='+JSON.stringify(pfp)+';</script>'
  + '<script>('+q3App.toString()+')();<\/script>'
  + '</body></html>';

function writeWithFallback(){
  const base=path.join(REPORTS,'Deliveroo_Q3_Rate_Tracker');
  for(const f of [base+'.html', base+'_v2.html']){
    try{ fs.writeFileSync(f, html); console.log('Saved: '+f); return; }
    catch(e){ if(e.code==='EBUSY'){ console.log('  (locked) '+path.basename(f)); continue; } throw e; }
  }
}
fs.mkdirSync(REPORTS,{recursive:true});
writeWithFallback();
