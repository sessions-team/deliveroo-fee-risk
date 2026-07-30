// Build the PfP Adjustment Risk mockup — flags menus at risk of a platform-fee increase next quarter.
//
// The contract's three PfP adjustment metrics (CONTRACTED-RATES.md §1b, Marketer Ads excluded) are
// re-measured by Deliveroo every quarter and set next quarter's rate. This script computes each
// site's quarter-to-date metrics from BigQuery, maps them onto the contract band tables, and
// compares the projected next-quarter adjustment with the adjustment currently applied
// (04_analysis/Q3_existing-sites_BY-SITE.csv).
//
// Metric sources (project sessions-core-data, dataset deliveroo), validated against the raw
// per-site values on Deliveroo's Q3 Commission Output:
//   1. Rider wait      s3_core_orders_staging.rider_wait_time — the export's wait clock runs long
//                      vs Deliveroo's "Rider Held Time"; a >8:00 threshold reproduces Deliveroo's
//                      measured %s (exact on several sites, ±2pp typical). Directional proxy.
//   2. Missing items   s3_core_missing_or_incorrect_items_staging — distinct orders with a claim
//                      ÷ delivered orders. Matches Deliveroo to ~0.1pp.
//   3. Open at peak    daily_reports_report_five_staging, hours 17–20 —
//                      open_minutes ÷ zone_scheduled_minutes. Matches Deliveroo to ~0.3pp.
//
// Auth: Application Default Credentials (gcloud auth application-default login), same as the
// Platform-weekly-dashboard fetch. BQ client is borrowed from that project's node_modules.
//
// Usage: node scripts/build_pfp_risk.js
// Writes 04_analysis/q3_pfp_risk_data.json and 05_reports/Deliveroo_PfP_Risk_Mockup.html.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '04_analysis');
const REPORTS = path.join(ROOT, '05_reports');

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'sessions-core-data';
const LOCATION = process.env.BQ_LOCATION || 'europe-west2';
const Q_START = '2026-07-01', Q_END = '2026-09-30', Q_DAYS = 92;
const QUARTER = 'Q3 2026', NEXT_QUARTER = 'Q4 2026';
const LOW_VOLUME = 30; // delivered orders below which metrics are marked low-confidence

// ---- contract band tables (CONTRACTED-RATES.md §1b) ----
// Bands are [lower, upper+step): Deliveroo put 2.744% in the "2.5–2.74" band, i.e. < 2.75.
function rwtAdj(p) { // % of delivery orders with rider held > 5 min
  if (p == null) return null;
  if (p < 3) return -2.0;
  if (p >= 16) return 0.8;
  return Math.round((-2.0 + 0.2 * (Math.floor(p - 3) + 1)) * 10) / 10; // 1pp bands, +0.2 each
}
function miAdj(p) { // % of orders with a missing/incorrect-item claim
  if (p == null) return null;
  if (p < 1) return -2.4;
  if (p >= 5.75) return 1.6;
  return Math.round((-2.2 + 0.2 * Math.floor((p - 1) / 0.25)) * 10) / 10; // 0.25pp bands
}
function ohAdj(p) { // % of peak hours (17:00–20:59) actually open
  if (p == null) return null;
  if (p > 99) return -1.2;
  if (p > 98) return -1.0;
  if (p > 96) return -0.8;
  if (p > 94) return -0.6;
  if (p > 92) return -0.4;
  if (p > 90) return -0.2;
  return 0;
}

const SQL = `
WITH orders AS (
  SELECT CAST(site_id AS INT64) AS rid,
    ANY_VALUE(restaurant_name) AS name,
    COUNT(*) AS delivered,
    ROUND(SUM(CAST(order_value AS FLOAT64)) / 100, 2) AS gmv,  -- order_value arrives in pence
    COUNTIF(rider_wait_time IS NOT NULL) AS rwt_n,
    COUNTIF(SAFE.PARSE_TIME('%H:%M:%S', rider_wait_time) > TIME '00:08:00') AS rwt_over,
    MAX(DATE(order_datetime)) AS max_d
  FROM \`${PROJECT_ID}.deliveroo.s3_core_orders_staging\`
  WHERE DATE(order_datetime) BETWEEN '${Q_START}' AND '${Q_END}'
    AND order_fulfillment_type = 'DELIVERY' AND order_status = 'DELIVERED'
  GROUP BY 1
),
claims AS (
  SELECT CAST(restaurant_id AS INT64) AS rid, COUNT(DISTINCT order_id) AS claim_orders
  FROM \`${PROJECT_ID}.deliveroo.s3_core_missing_or_incorrect_items_staging\`
  WHERE order_date BETWEEN '${Q_START}' AND '${Q_END}'
  GROUP BY 1
),
open_pk AS (
  SELECT restaurant_id AS rid,
    SUM(open_minutes_raw) AS open_min,
    SUM(zone_scheduled_minutes) AS zone_min
  FROM \`${PROJECT_ID}.deliveroo.daily_reports_report_five_staging\`
  WHERE date BETWEEN '${Q_START}' AND '${Q_END}' AND hour BETWEEN 17 AND 20
  GROUP BY 1
)
SELECT o.rid, o.name, o.delivered, o.gmv, o.rwt_n, o.rwt_over, o.max_d,
  c.claim_orders, p.open_min, p.zone_min
FROM orders o
LEFT JOIN claims c USING (rid)
LEFT JOIN open_pk p USING (rid)
ORDER BY o.gmv DESC`;

// ---- tiny CSV parser (quoted fields) ----
function parseCsv(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const head = rows.shift();
  if (head && head[0]) head[0] = head[0].replace(/^﻿/, '');
  return rows.filter(r => r.length === head.length)
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const num = v => (v == null || v === '' ? null : typeof v === 'object' && 'value' in v ? Number(v.value) : Number(v));
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);

// Same canonical name key + manual aliases as build_q3_views.js, so both tabs agree on
// which menu is which.
const canon = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
function loadAliasMap() {
  const map = {};
  const ap = path.join(ROOT, 'reference', 'menu_aliases.csv');
  if (fs.existsSync(ap)) {
    for (const r of parseCsv(fs.readFileSync(ap, 'utf8'))) {
      if (r.statement_name) map[canon(r.statement_name)] = canon(r.update_file_name);
    }
  }
  return map;
}

async function main() {
  const { BigQuery } = require('@google-cloud/bigquery');
  // ADC everywhere (VM: attached service account; local: gcloud user ADC).
  // BIGQUERY_KEY_FILE is a local-dev-only fallback — never used on the VM.
  const bq = new BigQuery({ projectId: PROJECT_ID, location: LOCATION,
    ...(process.env.BIGQUERY_KEY_FILE ? { keyFilename: process.env.BIGQUERY_KEY_FILE } : {}) });
  console.log(`BigQuery: ${PROJECT_ID} (${LOCATION}) — per-site PfP metrics ${Q_START}..${Q_END}`);
  const [rows] = await bq.query({ query: SQL, location: LOCATION });
  console.log(`  ${rows.length} sites with delivered orders`);

  // Current-quarter adjustments as applied by Deliveroo (from the Q3 Commission Output).
  const bySite = parseCsv(fs.readFileSync(path.join(OUT, 'Q3_existing-sites_BY-SITE.csv'), 'utf8'));
  const current = new Map(bySite.map(r => [String(Number(r.RestaurantID)), r]));

  // Restrict to the same menu universe as the rate-check tab (q3_rolling4_rate_check_by_menu.csv),
  // so both tabs quote the same total. Join: rate-check menu name -> alias/canon -> BY-SITE Site
  // name -> Restaurant ID -> BQ site.
  const aliasMap = loadAliasMap();
  const matchKey = s => aliasMap[canon(s)] || canon(s);
  const rateCheck = parseCsv(fs.readFileSync(path.join(OUT, 'q3_rolling4_rate_check_by_menu.csv'), 'utf8'));
  const wantedNames = new Set(rateCheck.map(r => matchKey(r.menu)));
  const allowedRids = new Set();
  const foundNames = new Set();
  for (const r of bySite) {
    const k = canon(r.Site);
    if (wantedNames.has(k)) { allowedRids.add(String(Number(r.RestaurantID))); foundNames.add(k); }
  }
  const unmapped = [...wantedNames].filter(k => !foundNames.has(k));
  if (unmapped.length) console.log(`  WARNING: ${unmapped.length} rate-check menus not found in BY-SITE (excluded): ${unmapped.slice(0, 5).join(', ')}`);
  const before = rows.length;
  const kept = rows.filter(r => allowedRids.has(String(num(r.rid))));
  const missingBq = allowedRids.size - kept.length;
  if (missingBq > 0) console.log(`  NOTE: ${missingBq} rate-checked menus have no delivered orders in BQ this quarter yet`);
  console.log(`  universe: ${rateCheck.length} rate-check menus -> ${allowedRids.size} Restaurant IDs -> ${kept.length} BQ sites (${before - kept.length} out-of-scope sites dropped)`);
  rows.length = 0; rows.push(...kept);
  // The most common Raw_* triple is Deliveroo's group-level fallback (sites without their own measurement).
  const tripleCount = new Map();
  for (const r of bySite) {
    const k = `${r.Raw_RWT_pct}|${r.Raw_OrderInacc_pct}|${r.Raw_OpenHours_pct}`;
    tripleCount.set(k, (tripleCount.get(k) || 0) + 1);
  }
  const groupTriple = [...tripleCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  let maxD = Q_START;
  const sites = [];
  for (const raw of rows) {
    const rid = String(num(raw.rid));
    const delivered = num(raw.delivered) || 0;
    const gmv = num(raw.gmv) || 0;
    const md = raw.max_d && (raw.max_d.value || raw.max_d);
    if (md && String(md) > maxD) maxD = String(md);

    const rwtN = num(raw.rwt_n) || 0;
    const rwt = rwtN ? r2(100 * (num(raw.rwt_over) || 0) / rwtN) : null;
    const mi = delivered ? r2(100 * (num(raw.claim_orders) || 0) / delivered) : null;
    const zoneMin = num(raw.zone_min);
    const oh = zoneMin ? r2(Math.min(100, 100 * (num(raw.open_min) || 0) / zoneMin)) : null;

    const proj = { rwt: rwtAdj(rwt), mi: miAdj(mi), oh: ohAdj(oh) };

    const cur = current.get(rid);
    const isNew = !cur;
    const curAdj = cur
      ? { rwt: num(cur.RWT), mi: num(cur.OrderInacc), oh: num(cur.OpenHours), jbp: num(cur.JBP) || 0, aov: num(cur.AOV) || 0 }
      // New-in-Q3 sites sit on the new-site rate card: headline −1.50 (−0.50 JBP + −1.00 ops).
      : { rwt: null, mi: null, oh: null, jbp: -0.5, aov: 0 };
    const curThree = cur ? r1(curAdj.rwt + curAdj.mi + curAdj.oh) : -1.0;
    const onGroupRate = !!cur && `${cur.Raw_RWT_pct}|${cur.Raw_OrderInacc_pct}|${cur.Raw_OpenHours_pct}` === groupTriple;

    const projThree = (proj.rwt == null || proj.mi == null || proj.oh == null)
      ? null : r1(proj.rwt + proj.mi + proj.oh);
    const delta = projThree == null ? null : r1(projThree - curThree);
    // £ impact per quarter: rate delta applied to this site's GMV run-rate over a full quarter.
    const gmvQuarter = gmv; // scaled below once elapsed days are known
    sites.push({
      rid, name: raw.name || (cur && cur.Site) || `Restaurant ${rid}`,
      delivered, gmv, gmvQuarter,
      rwt, mi, oh,
      cur: cur ? { rwt: curAdj.rwt, mi: curAdj.mi, oh: curAdj.oh } : null,
      curThree, proj, projThree, delta,
      lowVolume: delivered < LOW_VOLUME, isNew, onGroupRate,
    });
  }

  const elapsed = Math.max(1, Math.round((new Date(maxD) - new Date(Q_START)) / 86400000) + 1);
  const scale = Q_DAYS / elapsed;
  for (const s of sites) {
    s.gmvQuarter = Math.round(s.gmv * scale);
    s.impact = s.delta == null ? null : Math.round(s.gmvQuarter * s.delta / 100);
  }

  // Portfolio roll-up (order/GMV-weighted like Deliveroo's group measurement)
  const tot = (f) => sites.reduce((a, s) => a + f(s), 0);
  const rwtNum = tot(s => s.rwt != null ? s.rwt * s.delivered : 0), rwtDen = tot(s => s.rwt != null ? s.delivered : 0);
  const miNum = tot(s => s.mi != null ? s.mi * s.delivered : 0), miDen = tot(s => s.mi != null ? s.delivered : 0);
  const ohNum = tot(s => s.oh != null ? s.oh * s.delivered : 0), ohDen = tot(s => s.oh != null ? s.delivered : 0);
  const portfolio = {
    rwt: r2(rwtNum / rwtDen), mi: r2(miNum / miDen), oh: r2(ohNum / ohDen),
    orders: tot(s => s.delivered), gmv: Math.round(tot(s => s.gmv)),
  };
  portfolio.adj = { rwt: rwtAdj(portfolio.rwt), mi: miAdj(portfolio.mi), oh: ohAdj(portfolio.oh) };
  // Deliveroo's current group-level values (what fallback sites are on now)
  const [gRwt, gMi, gOh] = groupTriple.split('|').map(Number);
  const groupNow = { rwt: gRwt, mi: gMi, oh: gOh, adj: { rwt: rwtAdj(gRwt), mi: miAdj(gMi), oh: ohAdj(gOh) } };

  const measurable = sites.filter(s => s.delta != null && !s.lowVolume);
  const atRisk = measurable.filter(s => s.delta > 0);
  const improving = measurable.filter(s => s.delta < 0);
  const kpis = {
    sites: sites.length, measurable: measurable.length,
    atRisk: atRisk.length, improving: improving.length,
    flat: measurable.length - atRisk.length - improving.length,
    riskGbp: atRisk.reduce((a, s) => a + s.impact, 0),
    oppGbp: -improving.reduce((a, s) => a + s.impact, 0),
    elapsed, maxD,
  };

  const data = { quarter: QUARTER, nextQuarter: NEXT_QUARTER, qStart: Q_START, qEnd: Q_END,
    lowVolumeThreshold: LOW_VOLUME,
    generated: new Date().toISOString().slice(0, 10), portfolio, groupNow, kpis, sites };
  fs.writeFileSync(path.join(OUT, 'q3_pfp_risk_data.json'), JSON.stringify(data, null, 1));
  console.log(`  portfolio: rider wait ${portfolio.rwt}% | missing items ${portfolio.mi}% | open at peak ${portfolio.oh}%`);
  console.log(`  at risk: ${kpis.atRisk} sites (£${kpis.riskGbp.toLocaleString()}/qtr) | improving: ${kpis.improving} (£${kpis.oppGbp.toLocaleString()}/qtr)`);
  console.log(`  wrote 04_analysis/q3_pfp_risk_data.json — now run scripts/build_pfp_risk_html.js`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
