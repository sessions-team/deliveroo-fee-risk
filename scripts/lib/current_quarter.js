// The quarter the pipeline currently BUILDS — the one place to update at a quarterly rollover
// (CLAUDE.md §9). The per-quarter scripts (Validate-Q{n}ExistingSites.ps1, build_q{n}_views.js,
// build_q{n}_html.js) carry their own dates by design — they are frozen history. Everything
// quarter-agnostic (run_refresh.js, server/index.js, build_pfp_risk.js, build_pfp_risk_html.js)
// reads this file instead of hard-coding "Q3".
//
// effectiveFrom = the 10th business day after the previous quarter ends (contract: the Adjusted
// Core Services Rate is effective from the 10th Business Day after the preceding quarter ends).
// Rollover history: Q3 2026 effective 2026-07-14 · Q4 2026 effective 2026-10-14.
module.exports = {
  QN: 'Q4', qn: 'q4', year: 2026,
  label: 'Q4 2026',
  nextQN: 'Q1', nextLabel: 'Q1 2027',
  start: '2026-10-01', end: '2026-12-31', days: 92,
  effectiveFrom: '2026-10-14', // Thu 1 Oct → Wed 14 Oct 2026; no UK bank holidays in the window
  // The last Commission Output that carried Site names — the validators backfill names from it
  // (Q3 onward arrive with Site/Brand blank), then from data/reference/deliveroo_id_name_map.csv.
  nameMapCsv: 'Q2_existing-sites_commission_output_2026-04-08.csv',
};
