// One-command refresh — the headless orchestrator behind the web app + daily scheduler.
// (Modelled on Platform-weekly-dashboard's scripts/run_refresh.js — same lock/log/status.json
// contract, different stages.)
//
// Default (daily cron / "Refresh now" button) — data refresh only:
//   1. scripts/build_q3_views.js     — rolling-4 rate check + distributions (weekly statements)
//   2. scripts/build_pfp_risk.js     — quarter-to-date PfP metrics from BigQuery (ADC)
//   3. scripts/build_q3_html.js (+ build_pfp_risk_html.js) — rebuild the HTML reports
//
// --full (after a quarterly Commission Output upload, or first deploy) prepends:
//   0a. scripts/build_id_name_map.js         — refresh the Roo Hub ID→name registry (BigQuery)
//   0b. Validate-Q3ExistingSites.ps1 (pwsh)  — validate the newest commission CSV vs contract,
//       writing 04_analysis/Q3_existing-sites_BY-SITE.csv (explicit args: the script's default
//       param paths are Windows-style and must not be relied on under Linux).
//
// Safety: single-run lock (logs/refresh.lock), per-run log (logs/refresh-<ts>.log), compact
// summary for the web UI in logs/status.json. Stage-2 BigQuery failure is NON-fatal: the HTML
// rebuilds with the previous q3_pfp_risk_data.json rather than serving nothing.
//
// Usage: node scripts/run_refresh.js [--full]

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, '03_source-data');
const ANALYSIS = path.join(ROOT, '04_analysis');
const LOGS = path.join(ROOT, 'logs');
const LOCK = path.join(LOGS, 'refresh.lock');
const STATUS = path.join(LOGS, 'status.json');
const PFP_JSON = path.join(ANALYSIS, 'q3_pfp_risk_data.json');

const LOCK_STALE_MS = 2 * 60 * 60 * 1000; // a run older than 2h is treated as hung
const full = process.argv.includes('--full');

fs.mkdirSync(LOGS, { recursive: true });

// ---- lock ----
function readLock() { try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch { return null; } }
function acquireLock(runId) {
  const cur = readLock();
  if (cur && Date.now() - (cur.startedMs || 0) < LOCK_STALE_MS) {
    console.error(`Another refresh is already running (started ${cur.startedAt}, pid ${cur.pid}). Aborting.`);
    process.exit(3);
  }
  if (cur) console.error(`! Overriding a stale lock from ${cur.startedAt} (pid ${cur.pid}).`);
  fs.writeFileSync(LOCK, JSON.stringify({ runId, pid: process.pid, startedAt: new Date().toISOString(), startedMs: Date.now() }) + '\n');
}
function releaseLock() { try { fs.unlinkSync(LOCK); } catch { /* already gone */ } }

// ---- run id + log ----
const startedMs = Date.now();
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.join(LOGS, `refresh-${runId}.log`);
// Append synchronously so the log is complete even though we end with process.exit().
function out(s) { process.stdout.write(s); try { fs.appendFileSync(logPath, s); } catch { /* best-effort */ } }
function hr(t) { out('\n' + '='.repeat(78) + '\n' + t + '\n' + '='.repeat(78) + '\n'); }

// run a command, tee its output to console + log, return { code }
function runCmd(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  out((r.stdout || '') + (r.stderr || ''));
  if (r.error) out(`\n! spawn error for ${label}: ${r.error.message}\n`);
  return { code: r.status == null ? 1 : r.status };
}
const runNode = (script) => runCmd(process.execPath, [path.join(__dirname, script)], script);

// PowerShell binary: pwsh on the VM (installed via the Microsoft apt repo); Windows
// PowerShell as the local-dev fallback so the pipeline also runs on Tristan's machine.
function pwshBin() {
  for (const c of ['pwsh', process.platform === 'win32' ? 'powershell' : null].filter(Boolean)) {
    const r = spawnSync(c, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

// Newest quarterly Commission Output CSV (uploads land with the date in the name).
function newestCommissionCsv() {
  const re = /^Q3_existing-sites_commission_output_.*\.csv$/;
  const hits = fs.readdirSync(SOURCE).filter(n => re.test(n)).sort();
  return hits.length ? path.join(SOURCE, hits[hits.length - 1]) : null;
}

// compact status for the web UI — headline numbers come from the PfP risk JSON the pipeline
// just (re)built, not from log scraping
function buildStatus(base) {
  const status = { runId, logFile: path.basename(logPath), lastRun: new Date().toISOString(), durationMs: Date.now() - startedMs, ...base };
  try {
    const d = JSON.parse(fs.readFileSync(PFP_JSON, 'utf8'));
    status.pfp = {
      quarter: d.quarter, generated: d.generated,
      atRisk: d.kpis.atRisk, riskGbp: d.kpis.riskGbp,
      improving: d.kpis.improving, oppGbp: d.kpis.oppGbp,
      measurable: d.kpis.measurable, sites: d.kpis.sites,
      elapsed: d.kpis.elapsed, dataThrough: d.kpis.maxD,
    };
  } catch { /* PfP JSON not built yet */ }
  return status;
}
function writeStatus(s) { try { fs.writeFileSync(STATUS, JSON.stringify(s, null, 2) + '\n'); } catch (e) { out(`! could not write status.json: ${e.message}\n`); } }

// ---- run ----
acquireLock(runId);
let exitCode = 0;
const warnings = [];
try {
  hr(`FEE-RISK REFRESH — run ${runId}${full ? ' (--full: name map + contract validation first)' : ''}`);

  if (full) {
    // Stage 0a — Roo Hub ID→name registry (BigQuery). New sites appear here as they onboard;
    // a failure only degrades name backfill, so warn and continue.
    hr('STAGE 0a — refresh ID→name registry (scripts/build_id_name_map.js)');
    const nm = runNode('build_id_name_map.js');
    if (nm.code !== 0) { warnings.push('ID→name registry refresh failed — validation will fall back to the previous quarter\'s map only'); out(`\n⚠ ${warnings.at(-1)}\n`); }

    // Stage 0b — contract validation of the newest Commission Output CSV
    hr('STAGE 0b — validate commission output vs contract (Validate-Q3ExistingSites.ps1)');
    const input = newestCommissionCsv();
    if (!input) throw fail('error', 'No Q3 Commission Output CSV found in 03_source-data/ — upload one via /inputs.', 'validate');
    const ps = pwshBin();
    if (!ps) throw fail('error', 'PowerShell (pwsh) is not installed — cannot run the contract validator.', 'validate');
    out(`validator: ${ps}  input: ${path.basename(input)}\n`);
    // -ExecutionPolicy Bypass is process-scoped: Windows PowerShell blocks -File otherwise;
    // pwsh on Linux accepts and ignores it.
    const v = runCmd(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'Validate-Q3ExistingSites.ps1'),
      '-InputCsv', input,
      '-NameMapCsv', path.join(SOURCE, 'Q2_existing-sites_commission_output_2026-04-08.csv'),
      '-HubMapCsv', path.join(ROOT, 'reference', 'deliveroo_id_name_map.csv'),
      '-OutDir', ANALYSIS,
    ], 'Validate-Q3ExistingSites.ps1');
    if (v.code !== 0) throw fail('error', `Contract validation failed (exit ${v.code}) — see the run log.`, 'validate');
  }

  // Stage 1 — rate-check views + Excel (weekly statements via PLATFORM_KPI_DIR / drive mirror)
  hr('STAGE 1 — rate-check views (scripts/build_q3_views.js)');
  const views = runNode('build_q3_views.js');
  if (views.code !== 0) throw fail('error', `build_q3_views.js failed (exit ${views.code}) — statements mirror reachable? BY-SITE built?`, 'views');

  // Stage 2 — PfP metrics from BigQuery. Non-fatal: keep serving the previous JSON.
  hr('STAGE 2 — PfP fee-risk metrics from BigQuery (scripts/build_pfp_risk.js)');
  const pfp = runNode('build_pfp_risk.js');
  if (pfp.code !== 0) { warnings.push('BigQuery PfP refresh failed — fee-risk tab keeps the previous data'); out(`\n⚠ ${warnings.at(-1)}\n`); }

  // Stage 3 — HTML reports
  hr('STAGE 3 — rebuild HTML (scripts/build_q3_html.js + build_pfp_risk_html.js)');
  const html = runNode('build_q3_html.js');
  if (html.code !== 0) throw fail('error', `build_q3_html.js failed (exit ${html.code})`, 'html');
  const riskHtml = runNode('build_pfp_risk_html.js');
  if (riskHtml.code !== 0) { warnings.push('standalone fee-risk page rebuild failed (tracker tab is fine)'); out(`\n⚠ ${warnings.at(-1)}\n`); }

  const result = warnings.length ? 'warnings' : 'ok';
  writeStatus(buildStatus({ result, built: true, full, warnings, message: warnings.join('; ') || 'Built cleanly' }));
  hr(`DONE — result: ${result} (built) in ${((Date.now() - startedMs) / 1000).toFixed(1)}s`);
} catch (e) {
  if (e && e.handled) {
    writeStatus(buildStatus({ result: 'error', built: false, full, warnings, message: e.message, stage: e.stage }));
    exitCode = 1;
  } else {
    out(`\nFATAL (unexpected): ${e.stack || e.message}\n`);
    writeStatus(buildStatus({ result: 'error', built: false, full, warnings, message: e.message }));
    exitCode = 1;
  }
} finally {
  releaseLock();
}
process.exit(exitCode);

function fail(result, message, stage) {
  out(`\nFATAL: ${message}\n`);
  const e = new Error(message);
  e.handled = true; e.stage = stage;
  return e;
}
