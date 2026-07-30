// Build a self-contained interactive HTML dashboard for the Q2 rate tracker.
// Reads 04_analysis/q2_dashboard_data.json (produced by build_q2_views.js). No external libs.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '04_analysis');
const REPORTS = path.join(__dirname, '..', '05_reports');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'q2_dashboard_data.json'), 'utf8'));

const CSS = `
*{box-sizing:border-box} body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16242b;background:#f4f6f7}
header{background:#0e1b1f;color:#fff;padding:18px 26px;border-bottom:4px solid #00ccbc}
header h1{margin:0;font-size:20px} header .sub{color:#9fb3b8;font-size:13px;margin-top:3px}
.wrap{max-width:1500px;margin:0 auto;padding:20px 26px}
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
`;

function shell(){ return `
<header><h1>Deliveroo — Q2 2026 Rate Tracker</h1>
<div class="sub">Charged rate vs the Q2 update file · all Deliveroo accounts · rolling 4 weeks + full Q2 distributions</div></header>
<div class="wrap">
  <div class="kpis" id="kpis"></div>
  <div class="tabs">
    <button data-t="check" class="on">Rate check by menu</button>
    <button data-t="launched">Menus launched in Q2</button>
    <button data-t="count">Menus by rate / week</button>
    <button data-t="gmv">GMV by rate / week</button>
  </div>
  <div id="check" class="panel on"></div>
  <div id="launched" class="panel"></div>
  <div id="count" class="panel"></div>
  <div id="gmv" class="panel"></div>
</div>
<footer id="foot"></footer>`; }

// ---- client app (serialized) ----
function q2App(){
  const D = window.__Q2__;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pc = (v,d=1) => v==null||v===''?'':Number(v).toFixed(d)+'%';
  const gbp = n => n==null?'':'£'+Math.round(n).toLocaleString('en-GB');
  const adjp = a => (a>0?'+':'')+Number(a).toFixed(2);

  // KPIs
  $('#kpis').innerHTML = [
    ['good', D.kpis.allAgree+' / '+D.kpis.menusChecked, 'Existing menus agree with Q2 file (all 4 wks)'],
    [D.kpis.allAgree===D.kpis.menusChecked?'good':'warn', (D.kpis.menusChecked-D.kpis.allAgree), 'Existing menus needing review'],
    [D.kpis.launchedOk===D.kpis.launched?'good':'warn', D.kpis.launchedOk+' / '+D.kpis.launched, 'Q2-launched menus on New Q2 rate card'],
    ['', D.kpis.q2weeks, 'Q2 weeks analysed'],
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
        const tip = w.ok ? 'Charged rate matches the Q2 update file' : ('Over/(under)charged £'+w.v.toFixed(2)+' this week vs Q2 file');
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
    +'<div class="muted">Each cell shows the week’s <b>actual</b> effective rate (commission ÷ GMV) with the <b>“should be”</b> rate beneath it — the Q2 update file’s agreed rate applied to that week’s orders. They match when the menu is charged correctly (green ✓); <b>red</b> = they differ (hover for the £ impact); <b>·</b> = no trade. The rate is banded by order value, so it moves a little with basket mix each week — what matters is actual = should-be.</div>'
    +'<div class="tablewrap" id="chkTable"></div>';
  $('#chkSearch').oninput=renderCheck; $('#chkOnly').onchange=renderCheck; renderCheck();

  // ---- Tab: menus launched in Q2 (checked vs New Q2 rate card) ----
  function renderLaunched(){
    const q=($('#lSearch').value||'').toLowerCase(); const only=$('#lOnly').checked;
    const rows=D.launched.filter(r=>(!only||!r.ok) && (!q || (r.m+' '+r.a).toLowerCase().includes(q)));
    let h='<table><thead><tr><th class="l">Account</th><th class="l">Menu</th>';
    D.rolling.forEach(w=>h+='<th>'+w+'</th>'); h+='<th>All weeks match card?</th></tr></thead><tbody>';
    for(const r of rows){
      const pill=r.variant?' <span class="pill var">possible variant</span>':' <span class="pill new">new site</span>';
      h+='<tr><td class="l">'+esc(r.a)+'</td><td class="l menu" title="'+esc(r.m)+'">'+esc(r.m)+pill+'</td>';
      r.w.forEach(w=>{ if(!w){ h+='<td>·</td>'; return; }
        const tip = w.ok ? 'Charged rate matches the New Q2 rate card' : ('Over/(under)charged £'+w.v.toFixed(2)+' this week vs the New Q2 rate card');
        h+='<td class="'+(w.ok?'ok':'bad')+'" title="'+tip+'"><div class="act">'+pc(w.e)+'</div><div class="exp">should be '+pc(w.exp)+(w.ok?' ✓':'')+'</div></td>';
      });
      h+='<td class="'+(r.ok?'tick':'cross')+'">'+(r.ok?'✓':'✗')+'</td></tr>';
    }
    h+='</tbody></table>'; $('#lTable').innerHTML=h; $('#lCount').textContent=rows.length+' menus shown';
  }
  $('#launched').innerHTML='<div class="controls"><input type="search" id="lSearch" placeholder="Filter menu or account…">'
    +'<label><input type="checkbox" id="lOnly"> show only menus needing review</label><span class="muted" id="lCount"></span></div>'
    +'<div class="muted">Menus that launched in Q2 (not in the existing-site Q2 file), checked against the <b>New Q2 rate card</b> — contract headline <b>− 1.50%</b> (−0.50 JBP + −1.00 Ops). Each cell = the week’s actual effective rate with the <b>“should be”</b> card rate beneath; green ✓ = matches the card, <b>red</b> = differs (hover for £ impact). Hawkins (flat-rate brand) is excluded; “possible variant” = name resembles an existing site — verify it isn’t already on the existing-site rate.</div>'
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
    'Number of menus in each effective-rate band (0.5% buckets), per Q2 week. Darker = more menus. The 19.5% band is the Hawkins flat-rate brand.',
    'Trend — number of menus by rate tier');
  heat('#gmv', D.gmvByRate.rows, D.q2weeks, v=>gbp(v),
    'GMV (£) of orders in each effective-rate band (0.5% buckets), per Q2 week. Darker = more GMV.',
    'Trend — GMV by rate tier');

  // ---- tabs ----
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
    document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id===b.dataset.t));
  });
  $('#foot').textContent='Generated from weekly Deliveroo statements (read in place from the Finance shared drive). Latest week ending '+D.generated+'. Rolling-4 weeks: '+D.rolling.join(', ')+'.';
}

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Deliveroo Q2 Rate Tracker</title><style>'+CSS+'</style></head><body>'
  + shell()
  + '<script>window.__Q2__='+JSON.stringify(data)+';</script>'
  + '<script>('+q2App.toString()+')();<\/script>'
  + '</body></html>';

function writeWithFallback(){
  const base=path.join(REPORTS,'Deliveroo_Q2_Rate_Tracker');
  for(const f of [base+'.html', base+'_v2.html']){
    try{ fs.writeFileSync(f, html); console.log('Saved: '+f); return; }
    catch(e){ if(e.code==='EBUSY'){ console.log('  (locked) '+path.basename(f)); continue; } throw e; }
  }
}
fs.mkdirSync(REPORTS,{recursive:true});
writeWithFallback();
