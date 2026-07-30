// Builds reference/deliveroo_id_name_map.csv: Restaurant ID -> site name, from the
// Deliveroo Hub restaurant registry in BigQuery (roo_hub_sessions_restaurants_unique_staging).
// This is the "ID->name reference" the quarterly validators use to name restaurants that
// arrive in the Commission Output with blank Site/Brand (all IDs from Q3 2026 onward) and
// that are too new to appear in the previous quarter's output.
//
// Quarter-agnostic: re-run any time to refresh the map (new sites appear in the registry
// as they are onboarded). Names here are the Hub's site names, which match the weekly
// statements' "Restaurant Name" spelling on every ID checked so far.
//
// Auth: Application Default Credentials (same pattern as build_pfp_risk.js).
//
// Usage: node scripts/build_id_name_map.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REF = path.join(ROOT, 'reference');

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'sessions-core-data';
const LOCATION = process.env.BQ_LOCATION || 'europe-west2';

const SQL = `
SELECT CAST(id AS INT64) AS rid,
  ANY_VALUE(TRIM(name)) AS name,
  COUNT(DISTINCT TRIM(name)) AS name_variants
FROM \`sessions-core-data.deliveroo.roo_hub_sessions_restaurants_unique_staging\`
WHERE TRIM(IFNULL(name, '')) != '' AND SAFE_CAST(id AS INT64) IS NOT NULL
GROUP BY rid
ORDER BY rid`;

const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

async function main() {
  const { BigQuery } = require('@google-cloud/bigquery');
  const bq = new BigQuery({ projectId: PROJECT_ID, location: LOCATION,
    ...(process.env.BIGQUERY_KEY_FILE ? { keyFilename: process.env.BIGQUERY_KEY_FILE } : {}) });
  console.log(`BigQuery: ${PROJECT_ID} (${LOCATION}) — Roo Hub restaurant registry`);
  const [rows] = await bq.query({ query: SQL, location: LOCATION });

  const dupes = rows.filter(r => Number(r.name_variants) > 1);
  if (dupes.length) {
    console.log(`  NOTE: ${dupes.length} IDs carry more than one name in the registry (first kept):`);
    for (const d of dupes.slice(0, 10)) console.log(`    ${d.rid}: ${d.name}`);
  }

  const out = ['restaurant_id,name'];
  for (const r of rows) out.push(`${r.rid},${csvCell(r.name)}`);
  const p = path.join(REF, 'deliveroo_id_name_map.csv');
  fs.writeFileSync(p, out.join('\n'));
  console.log(`  ${rows.length} Restaurant IDs -> names written to ${p}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
