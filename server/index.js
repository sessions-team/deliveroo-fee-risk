// Deliveroo Fee Risk Analysis — internal web app.
//
// A THIN wrapper around the existing audit pipeline (modelled on the weekly-platform-kpi
// server, same VM): it serves the self-contained HTML reports the pipeline already produces
// (05_reports/Deliveroo_Q3_Rate_Tracker.html + Deliveroo_PfP_Risk_Mockup.html) behind a small
// status bar with "Refresh now", an /inputs upload page for the quarterly Deliveroo files,
// and a daily 08:00 Europe/London auto-refresh (node-cron). All the number-crunching stays in
// the untouched scripts/*.js — the server only shells out to scripts/run_refresh.js.
//
// Binds to 127.0.0.1 only. Locally (no .env) it runs with NO authentication. On the VM it
// sits behind Caddy with Google OAuth + allowed-emails.json enforced by server/auth.js —
// enabled automatically when GOOGLE_CLIENT_ID is set.
//
// Usage: npm start   (== node server/index.js)

require('dotenv').config({ quiet: true }); // VM: .env holds OAuth + session secrets; local: no .env, no-op
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const cron = require('node-cron');
const Busboy = require('busboy');
const auth = require('./auth');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, '05_reports');
const SOURCE = path.join(ROOT, '03_source-data');
const RATES = path.join(ROOT, '02_menu-rates');
const LOGS = path.join(ROOT, 'logs');
const UPLOADS = path.join(ROOT, 'uploads');
const TRACKER = path.join(REPORTS, 'Deliveroo_Q3_Rate_Tracker.html');
const RISK = path.join(REPORTS, 'Deliveroo_PfP_Risk_Mockup.html');
const XLSX = path.join(REPORTS, 'Deliveroo_Q3_Rate_Tracker.xlsx');
const STATUS = path.join(LOGS, 'status.json');
const LOCK = path.join(LOGS, 'refresh.lock');

const PORT = process.env.PORT || 4700;
const HOST = '127.0.0.1';
const PORTAL_URL = process.env.PORTAL_URL || 'http://portal.34.13.22.38.nip.io/';
const SCHED = {
  cron: process.env.SCHEDULE_CRON || '0 8 * * *', // daily 08:00
  timezone: process.env.SCHEDULE_TZ || 'Europe/London',
};

fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

// In-process guard: set synchronously the moment we spawn, cleared when the child exits
// (closes the double-click race the on-disk lockfile alone can't — it lags spawn by ~100ms).
let activeChild = null;
function lockFresh() {
  try {
    const l = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    return Date.now() - (l.startedMs || 0) < 2 * 60 * 60 * 1000;
  } catch { return false; }
}
function isRunning() { return !!activeChild || lockFresh(); }
function readStatus() { try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch { return null; } }

// Kick off scripts/run_refresh.js in the background. Returns false if one is already running.
// The child writes its own log + updates logs/status.json; we don't capture its output here.
function startRefresh(reason, extraArgs = []) {
  if (isRunning()) return false;
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'run_refresh.js'), ...extraArgs], {
    cwd: ROOT, detached: false, stdio: 'ignore',
  });
  activeChild = child;
  child.on('exit', () => { if (activeChild === child) activeChild = null; });
  console.log(`[${new Date().toISOString()}] refresh started (${reason}${extraArgs.length ? ' ' + extraArgs.join(' ') : ''}), pid ${child.pid}`);
  return true;
}

const app = express();

// Google OAuth + allow-list gate (server/auth.js). MUST be attached before the routes below so
// its middleware guards them. No-op locally (GOOGLE_CLIENT_ID unset).
const authState = auth.attach(app);
console.log(`Auth: ${authState.enabled ? `ENABLED (Google OAuth, callback ${authState.redirectUri})` : 'disabled — local unauthenticated mode'}`);

// ---- API ----
app.get('/api/status', (_req, res) => {
  res.json({ running: isRunning(), hasTracker: fs.existsSync(TRACKER), status: readStatus(), schedule: SCHED });
});

app.post('/api/refresh', (req, res) => {
  // a refresh rebuilds the one shared report for ALL viewers — "refresh" tier only
  if (!authState.canRefresh(req)) return res.status(403).json({ error: 'refresh not permitted (view-only account)' });
  const ok = startRefresh('manual');
  res.status(ok ? 202 : 409).json(ok ? { started: true } : { started: false, error: 'A refresh is already running.' });
});

// Quarterly inputs: multipart upload of the Deliveroo Commission Output CSV (+ optional
// new-sites rate card .md). Saves canonical copies into the pipeline's input folders,
// archives the raw upload under uploads/, then triggers a FULL refresh (validator included).
app.post('/api/upload', (req, res) => {
  if (!authState.canRefresh(req)) return res.status(403).json({ error: 'upload not permitted (view-only account)' });
  if (isRunning()) return res.status(409).json({ error: 'A refresh is running — try again when it finishes.' });

  const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024, files: 2, fields: 5 } });
  const fields = {};
  const saved = {}; // { commission_csv: tmpPath, rate_card: tmpPath }
  const writes = []; // busboy's 'close' fires when PARSING ends — the write streams may still be flushing
  const stamp = new Date().toISOString().slice(0, 10);
  let failed = null;

  bb.on('field', (name, val) => { fields[name] = String(val); });
  bb.on('file', (name, file, info) => {
    // browsers send empty file inputs as zero-byte parts with no filename — skip those too
    if ((name !== 'commission_csv' && name !== 'rate_card') || !info.filename) { file.resume(); return; }
    const safe = path.basename(info.filename).replace(/[^\w.\- ]+/g, '_');
    const tmp = path.join(UPLOADS, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safe}`);
    const ws = fs.createWriteStream(tmp);
    file.pipe(ws);
    file.on('limit', () => { failed = 'file too large (25 MB limit)'; ws.destroy(); try { fs.unlinkSync(tmp); } catch { } });
    writes.push(new Promise(resolve => ws.on('close', () => { if (!failed) saved[name] = tmp; resolve(); })
      .on('error', () => { failed = failed || 'could not store the upload'; resolve(); })));
  });
  bb.on('close', async () => {
    try {
      await Promise.all(writes);
      if (failed) return res.status(400).json({ error: failed });
      const quarter = /^Q[1-4]$/.test(fields.quarter || '') ? fields.quarter : 'Q3';
      const year = new Date().getFullYear();
      const out = { archived: [], installed: [] };

      if (saved.commission_csv) {
        // sanity-check the header before installing — reject the wrong kind of CSV outright
        const head = fs.readFileSync(saved.commission_csv, 'utf8').slice(0, 4000).split(/\r?\n/)[0] || '';
        const need = ['Restaurant ID', 'Headline Commission', 'New Commission'];
        const miss = need.filter(c => !head.includes(c));
        if (miss.length) {
          return res.status(400).json({ error: `That doesn't look like a Commission Output CSV — header is missing: ${miss.join(', ')}` });
        }
        const dest = path.join(SOURCE, `${quarter}_existing-sites_commission_output_${stamp}.csv`);
        fs.copyFileSync(saved.commission_csv, dest);
        out.installed.push(path.relative(ROOT, dest));
      }
      if (saved.rate_card) {
        const dest = path.join(RATES, `${quarter}-${year}_new-sites_rates.md`);
        fs.copyFileSync(saved.rate_card, dest);
        out.installed.push(path.relative(ROOT, dest));
      }
      out.archived = Object.values(saved).map(p => path.relative(ROOT, p));
      if (!out.installed.length) return res.status(400).json({ error: 'No file received — attach the Commission Output CSV (and/or the rate card).' });

      // The per-quarter scripts are Q3's; other quarters are stored for the rollover but not built.
      if (quarter === 'Q3' && saved.commission_csv) {
        startRefresh('upload', ['--full']);
        out.refresh = 'full refresh started (validate → views → BigQuery → HTML)';
      } else if (saved.commission_csv) {
        out.refresh = `stored only — the pipeline currently builds Q3; ${quarter} scripts are the quarterly-rollover step (see CLAUDE.md)`;
      } else {
        out.refresh = 'rate card stored (reference input — no rebuild needed)';
      }
      console.log(`upload: ${out.installed.join(', ')} (${quarter})`);
      res.json(out);
    } catch (e) {
      console.error(`upload failed: ${e.message}`);
      res.status(500).json({ error: `Upload failed: ${e.message}` });
    }
  });
  req.pipe(bb);
});

app.get('/api/runs', (_req, res) => {
  let runs = [];
  try {
    runs = fs.readdirSync(LOGS)
      .filter(n => /^refresh-.*\.log$/.test(n))
      .map(n => ({ file: n, mtime: fs.statSync(path.join(LOGS, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime).slice(0, 30)
      .map(r => ({ file: r.file, at: new Date(r.mtime).toISOString() }));
  } catch { /* no logs yet */ }
  res.json(runs);
});

// Serve a specific run log (read-only; guard against path traversal).
app.get('/api/logs/:file', (req, res) => {
  const name = path.basename(req.params.file);
  if (!/^refresh-.*\.log$/.test(name)) return res.status(400).send('bad log name');
  const p = path.join(LOGS, name);
  if (!fs.existsSync(p)) return res.status(404).send('not found');
  res.type('text/plain').send(fs.readFileSync(p, 'utf8'));
});

// ---- reports + downloads ----
app.get('/tracker', (_req, res) => {
  if (!fs.existsSync(TRACKER)) return res.status(404).type('text/plain').send('Tracker not built yet — run a refresh.');
  res.type('html').send(fs.readFileSync(TRACKER, 'utf8'));
});
app.get('/risk', (_req, res) => {
  if (!fs.existsSync(RISK)) return res.status(404).type('text/plain').send('Fee-risk page not built yet — run a refresh.');
  res.type('html').send(fs.readFileSync(RISK, 'utf8'));
});
app.get('/download/xlsx', (_req, res) => {
  if (!fs.existsSync(XLSX)) return res.status(404).send('not built yet');
  res.download(XLSX, 'Deliveroo_Q3_Rate_Tracker.xlsx');
});

// ---- pages ----
app.get('/', (req, res) => res.type('html').send(wrapper(req.session && req.session.user, authState.canRefresh(req))));
app.get('/inputs', (req, res) => res.type('html').send(inputsPage(req.session && req.session.user, authState.canRefresh(req))));

const server = app.listen(PORT, HOST, () => {
  console.log(`Deliveroo Fee Risk Analysis running at http://${HOST}:${PORT}/`);
  console.log(`Tracker built: ${fs.existsSync(TRACKER) ? 'yes' : 'no (run a refresh)'}`);
  // Auto-refresh runs wherever the server runs; on the VM that's daily 08:00 Europe/London.
  // Disable explicitly with SCHEDULE_ENABLED=false (e.g. for local dev without BQ access).
  const schedEnabled = process.env.SCHEDULE_ENABLED != null
    ? process.env.SCHEDULE_ENABLED === 'true'
    : authState.enabled; // default: on where auth is on (the VM), off for plain local dev
  if (schedEnabled && cron.validate(SCHED.cron)) {
    cron.schedule(SCHED.cron, () => startRefresh('scheduled'), { timezone: SCHED.timezone });
    console.log(`Scheduled auto-refresh: "${SCHED.cron}" (${SCHED.timezone})`);
  } else {
    console.log(`Scheduled auto-refresh: disabled${schedEnabled ? ` (invalid cron "${SCHED.cron}")` : ''}`);
  }
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));

// ---- the only HTML we author ----
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHROME_CSS = `
  :root { color-scheme: light dark; --bg:#0f1115; --bar:#161a21; --line:#2a2f3a; --fg:#e6e9ef; --mut:#9aa4b2;
          --ok:#2fbf71; --warn:#e0a92a; --err:#e05a5a; --accent:#4f8cff; }
  * { box-sizing: border-box; }
  html,body { margin:0; height:100%; background:var(--bg); color:var(--fg);
              font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  #bar { display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:10px 16px;
         background:var(--bar); border-bottom:1px solid var(--line); }
  #bar h1 { font-size:15px; margin:0; font-weight:600; white-space:nowrap; }
  .badge { padding:2px 9px; border-radius:999px; font-weight:600; font-size:12px; }
  .b-ok{background:rgba(47,191,113,.15);color:var(--ok)} .b-warn{background:rgba(224,169,42,.15);color:var(--warn)}
  .b-err{background:rgba(224,90,90,.15);color:var(--err)} .b-run{background:rgba(79,140,255,.15);color:var(--accent)}
  .b-idle{background:rgba(154,164,178,.15);color:var(--mut)}
  #meta { color:var(--mut); display:flex; gap:14px; flex-wrap:wrap; }
  #meta b { color:var(--fg); font-weight:600; }
  #spacer { flex:1 1 auto; }
  button, a.btn { font:inherit; cursor:pointer; border:1px solid var(--line); background:#20262f; color:var(--fg);
          padding:6px 12px; border-radius:7px; text-decoration:none; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
  button:disabled { opacity:.5; cursor:default; }
  a.btn:hover, button:hover:not(:disabled){ filter:brightness(1.1); }
  #who { color:var(--mut); font-size:12px; } #who a { color:var(--mut); }`;

const wrapper = (user, canRefresh) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deliveroo Fee Risk Analysis</title>
<style>${CHROME_CSS}
  #frame { border:0; width:100%; height:calc(100vh - 52px); display:block; background:#fff; }
  #empty { padding:40px; color:var(--mut); text-align:center; }
</style></head>
<body>
  <div id="bar">
    <a class="btn" href="${esc(PORTAL_URL)}" title="Back to the Sessions portal">&larr; Portal</a>
    <h1>Deliveroo Fee Risk Analysis</h1>
    <span id="state" class="badge b-idle">…</span>
    <div id="meta"></div>
    <span id="spacer"></span>
    <button id="refresh" class="primary"${canRefresh ? '' : ' disabled data-viewonly="1" title="View-only account — refresh access is limited (ask Finance)"'}>Refresh now</button>
    <a class="btn" href="/inputs">Quarterly inputs</a>
    <a class="btn" href="/risk" target="_blank" rel="noopener">Fee-risk page</a>
    <a class="btn" href="/download/xlsx">Excel</a>
    <a class="btn" href="/tracker" target="_blank" rel="noopener">Open ↗</a>
    ${user ? `<span id="who">${esc(user.email)} · <a href="/auth/logout">Sign out</a></span>` : ''}
  </div>
  <iframe id="frame" src="/tracker" title="rate tracker"></iframe>
  <div id="empty" hidden>Tracker not built yet — click <b>Refresh now</b> to build the first one.</div>

<script>
const $ = s => document.querySelector(s);
const fmtAgo = iso => { if(!iso) return '—'; const s=(Date.now()-new Date(iso))/1000;
  if(s<90) return Math.round(s)+'s ago'; if(s<5400) return Math.round(s/60)+'m ago';
  if(s<172800) return Math.round(s/3600)+'h ago'; return Math.round(s/86400)+'d ago'; };
const gbp = n => n==null ? '—' : '£'+Math.round(n).toLocaleString();
let wasRunning = false;

function badge(st, running){
  const el=$('#state');
  if(running){ el.className='badge b-run'; el.textContent='Refreshing…'; return; }
  const r = st && st.result;
  const map={ok:['b-ok','Ready'],warnings:['b-warn','Ready (warnings)'],error:['b-err','Error']};
  const [cls,txt]= map[r] || ['b-idle','No run yet'];
  el.className='badge '+cls; el.textContent=txt;
}

async function tick(){
  let d; try { d = await (await fetch('/api/status')).json(); } catch { return; }
  const st = d.status || {};
  badge(st, d.running);
  const parts = [];
  parts.push('<span>Last refreshed <b>'+fmtAgo(st.lastRun)+'</b></span>');
  const p = st.pfp || {};
  if(p.elapsed) parts.push('<span>Q3 day <b>'+p.elapsed+'</b> of 92</span>');
  if(p.atRisk!=null) parts.push('<span><b>'+p.atRisk+'</b> menus at risk · <b>'+gbp(p.riskGbp)+'</b>/qtr exposure</span>');
  if(p.improving!=null) parts.push('<span><b>'+p.improving+'</b> improving · <b>'+gbp(p.oppGbp)+'</b>/qtr opportunity</span>');
  if(st.message && st.result==='error') parts.push('<span style="color:var(--err)">'+st.message+'</span>');
  $('#meta').innerHTML = parts.join('');

  const viewOnly = $('#refresh').dataset.viewonly === '1'; // server-rendered; polling must not re-enable
  $('#refresh').disabled = d.running || viewOnly;
  $('#refresh').textContent = d.running ? 'Refreshing…' : 'Refresh now';
  $('#frame').hidden = !d.hasTracker; $('#empty').hidden = d.hasTracker;

  if(wasRunning && !d.running){ if(st.built) $('#frame').contentWindow.location.reload(); }
  wasRunning = d.running;
}

$('#refresh').addEventListener('click', async ()=>{
  $('#refresh').disabled=true; $('#refresh').textContent='Starting…';
  const r = await fetch('/api/refresh',{method:'POST'});
  if(r.status===409){ alert('A refresh is already running.'); }
  setTimeout(tick, 500);
});
tick(); setInterval(tick, 4000);
</script>
</body></html>`;

// The quarterly-inputs page: upload the Commission Output CSV (and optionally the new-sites
// rate card email saved as .md). A successful CSV upload triggers the FULL pipeline.
const inputsPage = (user, canRefresh) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quarterly inputs — Deliveroo Fee Risk Analysis</title>
<style>${CHROME_CSS}
  main { max-width:640px; margin:32px auto; padding:0 16px; }
  .card { background:var(--bar); border:1px solid var(--line); border-radius:12px; padding:24px; }
  h2 { font-size:16px; margin:0 0 6px; } p.hint { color:var(--mut); margin:4px 0 16px; }
  label { display:block; margin:14px 0 6px; font-weight:600; }
  input[type=file], select { width:100%; padding:8px; background:#0f1115; color:var(--fg);
    border:1px solid var(--line); border-radius:7px; font:inherit; }
  #result { margin-top:16px; padding:12px; border-radius:8px; display:none; white-space:pre-wrap; }
  #result.ok { display:block; background:rgba(47,191,113,.12); color:var(--ok); }
  #result.err { display:block; background:rgba(224,90,90,.12); color:var(--err); }
  form.disabled { opacity:.5; pointer-events:none; }
</style></head>
<body>
  <div id="bar">
    <a class="btn" href="/">&larr; Tracker</a>
    <h1>Quarterly inputs</h1>
    <span id="spacer"></span>
    ${user ? `<span id="who">${esc(user.email)} · <a href="/auth/logout">Sign out</a></span>` : ''}
  </div>
  <main><div class="card">
    <h2>Pass the new quarter's rates into the tool</h2>
    <p class="hint">Each quarter Deliveroo sends an <b>existing-sites Commission Output CSV</b> and a
    <b>new-sites rate card</b> (by email — save it as .md). Upload them here: the CSV is validated
    against the contract and the whole tracker rebuilds automatically (a few minutes).</p>
    ${canRefresh ? '' : '<p class="hint" style="color:var(--warn)">Your account is view-only — uploading is limited to the refresh tier (ask Finance).</p>'}
    <form id="f"${canRefresh ? '' : ' class="disabled"'}>
      <label>Quarter</label>
      <select name="quarter"><option>Q3</option><option>Q4</option></select>
      <label>Commission Output CSV (existing sites)</label>
      <input type="file" name="commission_csv" accept=".csv">
      <label>New-sites rate card (.md, optional)</label>
      <input type="file" name="rate_card" accept=".md,.txt">
      <p class="hint" style="margin-top:16px">Files are archived under <code>uploads/</code> on the server;
      the canonical copies land in <code>03_source-data/</code> / <code>02_menu-rates/</code>.</p>
      <button class="primary" type="submit">Upload &amp; rebuild</button>
    </form>
    <div id="result"></div>
  </div></main>
<script>
const f=document.getElementById('f'), out=document.getElementById('result');
f.addEventListener('submit', async e=>{
  e.preventDefault();
  const btn=f.querySelector('button'); btn.disabled=true; btn.textContent='Uploading…';
  out.className=''; out.style.display='none';
  try{
    const r=await fetch('/api/upload',{method:'POST',body:new FormData(f)});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    out.className='ok';
    out.textContent='Done. Installed: '+d.installed.join(', ')+(d.refresh?'\\n'+d.refresh:'')+
      '\\n\\nWatch progress on the tracker page (the badge shows "Refreshing…").';
  }catch(err){ out.className='err'; out.textContent=err.message; }
  btn.disabled=false; btn.textContent='Upload & rebuild';
});
</script>
</body></html>`;
