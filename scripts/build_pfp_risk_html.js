// Build the PfP Adjustment Risk mockup HTML — reads 04_analysis/q3_pfp_risk_data.json
// (from build_pfp_risk.js). Self-contained, no external libs, house style of the Q2/Q3 trackers.
// Written for readers who are not finance people: every number is paired with what it means.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '04_analysis');
const REPORTS = path.join(__dirname, '..', '05_reports');
const data = JSON.parse(fs.readFileSync(path.join(OUT, 'q3_pfp_risk_data.json'), 'utf8'));

const CSS = `
*{box-sizing:border-box} body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16242b;background:#f4f6f7}
header{background:#0e1b1f;color:#fff;padding:18px 26px;border-bottom:4px solid #00ccbc}
header h1{margin:0;font-size:20px} header .sub{color:#9fb3b8;font-size:13px;margin-top:3px}
.mock{display:inline-block;background:#00ccbc;color:#04302c;font-size:11px;font-weight:700;border-radius:9px;padding:2px 8px;vertical-align:3px;margin-left:10px}
.wrap{max-width:1500px;margin:0 auto;padding:20px 26px}
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
details.bands table{font-size:11.5px;margin-top:6px;border-collapse:collapse}
details.bands td,details.bands th{border:1px solid #e2e8ea;padding:2px 8px;text-align:right;background:#fff;color:#16242b}
.kpis{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.kpi{background:#fff;border:1px solid #e2e8ea;border-radius:10px;padding:14px 18px;min-width:170px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.kpi .n{font-size:26px;font-weight:700} .kpi .l{color:#5b6b71;font-size:12px;margin-top:2px;max-width:190px}
.kpi.good .n{color:#1a7f37} .kpi.warn .n{color:#b54708} .kpi.bad .n{color:#9b1c1c}
.controls{display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
.controls input[type=search]{padding:8px 10px;border:1px solid #cfd8da;border-radius:8px;width:320px;font-size:14px}
.controls label,.controls select{font-size:13px;color:#3a4a50;display:flex;gap:6px;align-items:center}
.controls select{padding:6px 8px;border:1px solid #cfd8da;border-radius:8px;background:#fff}
.muted{color:#5b6b71;font-size:12.5px;margin:4px 0 12px}
.tablewrap{overflow:auto;max-height:70vh;border:1px solid #e2e8ea;border-radius:10px;background:#fff}
table.main{border-collapse:collapse;width:100%;font-size:13px}
table.main th,table.main td{padding:7px 10px;text-align:right;white-space:nowrap}
table.main th{position:sticky;top:0;background:#26383e;color:#fff;font-weight:600;z-index:2}
table.main td.l,table.main th.l{text-align:left}
table.main tbody tr:nth-child(even){background:#fafbfb}
.menu{max-width:360px;overflow:hidden;text-overflow:ellipsis}
.v{font-weight:700} .sub2{font-size:11px;color:#5b6b71;margin-top:1px}
.chip{display:inline-block;border-radius:9px;padding:1px 8px;font-size:11.5px;font-weight:700}
.chip.up{background:#ffd6d6;color:#9b1c1c} .chip.down{background:#d7f5e0;color:#0f5132} .chip.flat{background:#e7ebec;color:#5b6b71}
.imp.up{color:#9b1c1c;font-weight:700} .imp.down{color:#0f5132;font-weight:700} .imp.flat{color:#5b6b71}
.pill{display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;margin-left:6px}
.pill.new{background:#eef2ff;color:#3538cd} .pill.low{background:#f2f4f5;color:#6b7a80} .pill.grp{background:#fff4e5;color:#b54708}
.worse{color:#9b1c1c} .better{color:#0f5132}
footer{color:#7a8a90;font-size:12px;padding:14px 26px;max-width:1500px;margin:0 auto}
footer b{color:#5b6b71}
`;

// ---- server-side helpers ----
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const adjTxt = a => a == null ? '—' : (a > 0 ? '+' : a < 0 ? '−' : '') + Math.abs(a).toFixed(1) + '%';
const P = data.portfolio, G = data.groupNow, K = data.kpis;

// metric metadata: adj range for positioning markers on the scale bar
const METRICS = [
  {
    key: 'rwt', name: 'Riders kept waiting', contract: 'Contract metric: “Rider Wait Time Past Target”',
    meaning: 'How often a rider turns up and the food isn’t ready — measured as the share of orders where the rider is held more than 5 minutes. Riders hate waiting, so Deliveroo rewards fast handover.',
    action: 'Fix: have orders bagged and ready before the rider arrives — biggest wins at Friday/Saturday dinner.',
    min: -2.0, max: 0.8,
    bands: [['Under 3%', '−2.0%'], ['3–12.9%', '−1.8% … −0.2% (0.2 steps)'], ['12–12.9%', '0 (no effect)'], ['13–15.9%', '+0.2% … +0.6%'], ['16% or more', '+0.8%']],
  },
  {
    key: 'mi', name: 'Missing or wrong items', contract: 'Contract metric: “Missing Items”',
    meaning: 'The share of orders where the customer reported something missing or wrong. Every claim costs Deliveroo a refund, so accurate orders earn a discount.',
    action: 'Fix: check every bag against the ticket before sealing — sauces, sides and drinks are the usual culprits.',
    min: -2.4, max: 1.6,
    bands: [['Under 1%', '−2.4%'], ['1–3.74%', '−2.2% … −0.2% (0.25 steps)'], ['3.75–3.99%', '0 (no effect)'], ['4–5.74%', '+0.2% … +1.4%'], ['5.75% or more', '+1.6%']],
  },
  {
    key: 'oh', name: 'Open at peak times', contract: 'Contract metric: “Open Hours at Peak” (5pm–9pm)',
    meaning: 'How much of the 5pm–9pm dinner window the menu is actually open and taking orders. Going offline at dinner loses Deliveroo sales, so staying open earns a discount.',
    action: 'Fix: keep tablets on and avoid “busy mode” switch-offs between 5pm and 9pm.',
    min: -1.2, max: 0,
    bands: [['Over 99%', '−1.2%'], ['Over 98%', '−1.0%'], ['Over 96%', '−0.8%'], ['Over 94%', '−0.6%'], ['Over 92%', '−0.4%'], ['Over 90%', '−0.2%'], ['90% or less', '0 (no effect)']],
  },
];

function scaleBar(m, curAdj, projAdj) {
  const pos = a => Math.max(4, Math.min(96, Math.round(100 * (a - m.min) / (m.max - m.min))));
  let h = '<div class="scale">';
  if (curAdj != null) h += `<div class="mk ghost" style="left:${pos(curAdj)}%" title="now: ${adjTxt(curAdj)}"></div>`;
  if (projAdj != null) h += `<div class="mk" style="left:${pos(projAdj)}%" data-l="${adjTxt(projAdj)}"></div>`;
  h += '<div class="zone" style="left:0">← bigger discount</div><div class="zone" style="right:0">penalty →</div></div>';
  return h;
}

function metricCard(m) {
  const val = P[m.key], projAdj = P.adj[m.key], curAdj = G.adj[m.key];
  const dir = projAdj == null || curAdj == null ? 'flat' : projAdj > curAdj ? 'up' : projAdj < curAdj ? 'down' : 'flat';
  const dirTxt = { up: '▲ fees heading up', down: '▼ fees heading down', flat: '= holding steady' }[dir];
  const bandRows = m.bands.map(b => `<tr><td>${b[0]}</td><td>${b[1]}</td></tr>`).join('');
  return `<div class="card">
    <div class="name">${m.name} <span class="dir ${dir}">${dirTxt}</span></div>
    <div class="contract">${m.contract}</div>
    <div class="hero">${val == null ? '—' : val.toFixed(1) + '%'} <small>across all menus, ${data.quarter} so far</small></div>
    <div class="meaning">${m.meaning}</div>
    ${scaleBar(m, curAdj, projAdj)}
    <div class="nowline"><span>Earning now (set last quarter): <b>${adjTxt(curAdj)}</b></span>
    <span>If the quarter ended today: <b>${adjTxt(projAdj)}</b></span></div>
    <div class="action">${m.action}</div>
    <details class="bands"><summary>See the full contract band table</summary>
      <table><tr><th>Measured value</th><th>Rate adjustment</th></tr>${bandRows}</table></details>
  </div>`;
}

function shell() {
  return `<header><h1>Deliveroo — Platform Fee Early-Warning <span class="mock">MOCKUP</span></h1>
<div class="sub">The three service metrics that set next quarter’s commission · measured ${data.quarter} (so far) · will set ${data.nextQuarter} rates · data to ${K.maxD}</div></header>
<div class="wrap">

  <div class="explain">
    <b>How Deliveroo sets our commission rate:</b> every menu starts from the same headline rate, and Deliveroo then
    moves it <b>down</b> (a discount) or <b>up</b> (a penalty) based on three service measurements. What we score
    <b>this quarter decides the rate we pay all next quarter</b> — so a bad quarter of service literally makes every
    order more expensive for three months. This page shows how the current quarter is tracking, menu by menu, while
    there is still time to fix it.
    <div class="steps">
      <div class="step"><div class="t">1 · Deliveroo measures</div>Rider waiting, missing items and peak-time opening, for every menu, all quarter.</div>
      <div class="step"><div class="t">2 · Each score maps to a rate move</div>Good scores earn up to <b>−5.6%</b> off the headline commission; poor scores add up to <b>+2.4%</b> on top.</div>
      <div class="step"><div class="t">3 · Applied next quarter</div>The new rate kicks in ~2 weeks after quarter end and lasts the full quarter. (The separate −0.5% Marketer Ads discount is unaffected by these metrics.)</div>
    </div>
  </div>

  <div class="cards">${METRICS.map(metricCard).join('')}</div>

  <div class="kpis">
    <div class="kpi"><div class="n">${K.measurable.toLocaleString()}</div><div class="l">menus measured so far (of the ${K.sites.toLocaleString()} rate-checked menus; excludes low-volume)</div></div>
    <div class="kpi bad"><div class="n">${K.atRisk.toLocaleString()}</div><div class="l">heading for a HIGHER rate next quarter</div></div>
    <div class="kpi good"><div class="n">${K.improving.toLocaleString()}</div><div class="l">heading for a LOWER rate next quarter</div></div>
    <div class="kpi bad"><div class="n">£${Math.round(K.riskGbp).toLocaleString()}</div><div class="l">extra fees next quarter if nothing changes</div></div>
    <div class="kpi good"><div class="n">£${Math.round(K.oppGbp).toLocaleString()}</div><div class="l">fee savings already in reach from improving menus</div></div>
    <div class="kpi ${K.riskGbp-K.oppGbp>0?'bad':'good'}"><div class="n">${K.riskGbp-K.oppGbp>0?'+':'−'}£${Math.abs(Math.round(K.riskGbp-K.oppGbp)).toLocaleString()}</div><div class="l">net effect next quarter (extra fees minus savings)</div></div>
  </div>

  <div class="controls">
    <input type="search" id="q" placeholder="Find a menu or site…">
    <label><input type="checkbox" id="onlyRisk"> only menus heading for an increase</label>
    <label>sort by <select id="sort">
      <option value="impact">£ at stake</option><option value="delta">biggest rate move</option>
      <option value="gmv">sales</option><option value="name">name</option></select></label>
    <span class="muted" id="count"></span>
  </div>
  <div class="muted">Each metric cell shows the menu’s <b>score this quarter so far</b>, and underneath, the rate adjustment
  moving <b>from → to</b> (what it earns now → what today’s score would earn next quarter). <span class="worse">Red</span> = getting more
  expensive, <span class="better">green</span> = getting cheaper. “£ next quarter” is the extra cost (or saving) on a full quarter
  of sales at current run-rate if the quarter ended today.</div>
  <div class="tablewrap" id="tbl"></div>
</div>
<footer id="foot"></footer>`;
}

function clientApp() {
  const D = window.__PFP__;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const adjTxt = a => a == null ? 'new' : (a > 0 ? '+' : a < 0 ? '−' : '') + Math.abs(a).toFixed(1) + '%';
  const gbp = n => '£' + Math.round(Math.abs(n)).toLocaleString('en-GB');

  function metricCell(val, curA, projA, low) {
    if (val == null) return '<td>·</td>';
    const dir = curA == null || projA == null ? 'flat' : projA > curA ? 'up' : projA < curA ? 'down' : 'flat';
    const cls = low ? 'flat' : dir;
    return `<td><div class="v${low ? '" style="color:#8fa3a9' : ''}">${val.toFixed(1)}%</div>
      <div class="sub2 ${cls === 'up' ? 'worse' : cls === 'down' ? 'better' : ''}">${adjTxt(curA)} → ${adjTxt(projA)}</div></td>`;
  }

  function render() {
    const q = ($('#q').value || '').toLowerCase();
    const only = $('#onlyRisk').checked;
    const sort = $('#sort').value;
    let rows = D.sites.filter(s => (!q || s.name.toLowerCase().includes(q)) && (!only || (s.delta != null && s.delta > 0 && !s.lowVolume)));
    rows.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'gmv' ? b.gmv - a.gmv
      : sort === 'delta' ? (b.delta ?? -99) - (a.delta ?? -99)
      : (b.impact ?? -1e15) - (a.impact ?? -1e15));

    let h = `<table class="main"><thead><tr>
      <th class="l">Menu</th><th>Orders</th><th>Sales so far</th>
      <th>Riders kept waiting</th><th>Missing / wrong items</th><th>Open at peak (5–9pm)</th>
      <th>Rate move if qtr ended today</th><th>£ next quarter</th></tr></thead><tbody>`;
    for (const s of rows) {
      const pills = (s.isNew ? ' <span class="pill new">new in Q3</span>' : '')
        + (s.lowVolume ? ' <span class="pill low" title="Fewer than 30 delivered orders so far — scores can swing a lot">low data</span>' : '')
        + (s.onGroupRate ? ' <span class="pill grp" title="Deliveroo measured this menu on the shared group score last quarter, not its own">group score</span>' : '');
      const dir = s.delta == null ? 'flat' : s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : 'flat';
      const deltaChip = s.delta == null ? '<span class="chip flat">not measurable</span>'
        : s.delta > 0 ? `<span class="chip up">▲ +${s.delta.toFixed(1)}% — more fees</span>`
        : s.delta < 0 ? `<span class="chip down">▼ −${Math.abs(s.delta).toFixed(1)}% — less fees</span>`
        : '<span class="chip flat">= no change</span>';
      const imp = s.impact == null ? '<span class="imp flat">·</span>'
        : s.impact > 0 ? `<span class="imp up">${gbp(s.impact)} extra</span>`
        : s.impact < 0 ? `<span class="imp down">${gbp(s.impact)} saved</span>`
        : '<span class="imp flat">£0</span>';
      const c = s.cur || { rwt: null, mi: null, oh: null };
      h += `<tr><td class="l menu" title="${esc(s.name)}">${esc(s.name)}${pills}</td>
        <td>${s.delivered.toLocaleString()}</td><td>£${Math.round(s.gmv).toLocaleString()}</td>
        ${metricCell(s.rwt, c.rwt, s.proj.rwt, s.lowVolume)}
        ${metricCell(s.mi, c.mi, s.proj.mi, s.lowVolume)}
        ${metricCell(s.oh, c.oh, s.proj.oh, s.lowVolume)}
        <td>${deltaChip}</td><td>${imp}</td></tr>`;
    }
    h += '</tbody></table>';
    $('#tbl').innerHTML = h;
    $('#count').textContent = rows.length.toLocaleString() + ' menus shown';
  }
  $('#q').oninput = render; $('#onlyRisk').onchange = render; $('#sort').onchange = render;
  render();

  $('#foot').innerHTML = `<b>Mockup — methodology & caveats.</b> Metrics computed from our BigQuery copies of Deliveroo's
  operational feeds (orders, missing-item claims, hourly opening) for ${D.qStart} to ${D.kpis.maxD}
  (${D.kpis.elapsed} of 92 days). “£ next quarter” = rate move × the menu's sales scaled to a full quarter.
  <b>Missing items</b> and <b>peak opening</b> reproduce Deliveroo's own quarterly measurements almost exactly
  (validated against the Q3 Commission Output). <b>Rider waiting</b> is a calibrated proxy — our order export's wait
  clock runs longer than Deliveroo's “Rider Held Time”, and a tuned threshold matches Deliveroo's measured
  values within ±2pp for most sites — treat it as directional. Sites Deliveroo scored at group level last quarter
  are marked “group score”; brand-new sites are compared against the new-site rate card (−1.5%). The Marketer Ads
  −0.5% is excluded throughout. Generated ${D.generated}.`;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deliveroo PfP Fee Early-Warning — ${data.quarter} (mockup)</title>
<style>${CSS}</style></head><body>
${shell()}
<script>window.__PFP__=${JSON.stringify(data)};(${clientApp.toString()})();</script>
</body></html>`;

const out = path.join(REPORTS, 'Deliveroo_PfP_Risk_Mockup.html');
fs.writeFileSync(out, html);
console.log(`wrote 05_reports/Deliveroo_PfP_Risk_Mockup.html (${(html.length / 1024).toFixed(0)} KB, ${data.sites.length} sites)`);
