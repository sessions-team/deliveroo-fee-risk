# Deliveroo Rate Audit

Tracks and compares the commission/rates we are actually being charged per menu against the rates our contract with Deliveroo states.

## Web app (Deliveroo Fee Risk Analysis)

The pipeline is deployed as an internal web app on the Sessions VM: **http://feerisk.34.13.22.38.nip.io/**
(Google sign-in, allow-listed emails) — full rate tracker at `/`, standalone fee-risk page at
`/risk`, quarterly file uploads at `/inputs`, auto-refresh daily at 08:00 London. Run it locally
with `npm start` (no `.env` = auth off, http://127.0.0.1:4700/). Stack, deployment and the
quarterly runbook are documented in `CLAUDE.md`.

## Folder structure

| Folder | Purpose |
|--------|---------|
| `01_contract/` | The signed Deliveroo contract(s) and any rate schedules / amendments. The source of truth for *agreed* rates. |
| `02_menu-rates/` | The actual rates being charged per menu (e.g. invoices, statements, per-site/per-menu rate exports). |
| `03_source-data/` | Raw, untouched source files as received (PDFs, CSVs, statements). Never edit these — copies get cleaned into `04_analysis`. |
| `04_analysis/` | Working files: cleaned data, the comparison workbook, variance calculations. |
| `05_reports/` | Finished, shareable outputs (the comparison report, summaries). |
| `scripts/` | Any reusable scripts for parsing/cleaning source data. |

## Goal

Produce a report showing, per menu:
- Contracted rate (from `01_contract`)
- Actual rate charged (from `02_menu-rates`)
- Variance (£ and %)
- Flag where actual ≠ contracted (potential overcharge)

## Quarterly refresh (per-quarter pipeline)

Each quarter Deliveroo sends (a) a **new-sites rate card** by email and (b) an **existing-sites Commission Output CSV**. Scripts are duplicated per quarter so prior quarters stay intact as history (`Validate-Q{n}...`, `build_q{n}_views.js`, `build_q{n}_html.js`).

To load a new quarter (Q3 shown):
1. Save the email rate card as `02_menu-rates/Q{n}-2026_new-sites_rates.md` (reconcile every bracket to contract headline − 1.50%).
2. Drop the Commission Output CSV into `03_source-data/Q{n}_existing-sites_commission_output_<date>.csv` (never edit source files).
3. `powershell scripts/Validate-Q{n}ExistingSites.ps1` → validates every row vs contract, writes `04_analysis/Q{n}_existing-sites_BY-SITE.csv` (+ `_FINDINGS`, `_UNNAMED`).
4. `node scripts/build_q{n}_views.js` → rolling-4 rate-check, launched-menu check (menus launched after quarter start → New rate card), rate distributions, `q{n}_dashboard_data.json`, and `05_reports/Deliveroo_Q{n}_Rate_Tracker.xlsx`.
5. `node scripts/build_q{n}_html.js` → `05_reports/Deliveroo_Q{n}_Rate_Tracker.html`.
6. (optional, any time mid-quarter) `node scripts/build_pfp_risk.js` then re-run `build_q{n}_html.js` → populates the tracker's **"Fee risk next quarter"** tab with quarter-to-date PfP metrics from BigQuery (see below). Without the JSON the tab shows a how-to note.

**Timing:** a quarter's Adjusted rate is effective from the **10th business day after the previous quarter ends** (Q3 2026 = 2026-07-14). The rate-check only compares weeks on/after that date; earlier weeks are still on the previous quarter's rate. The tracker shows an "awaiting data" banner until the first Q{n}-effective week lands.

## PfP adjustment early-warning (fee-increase risk)

The contract's three PfP metrics (Rider Wait Time, Missing Items, Open Hours at Peak — `CONTRACTED-RATES.md` §1b) are re-measured by Deliveroo each quarter and set next quarter's rate. Two scripts flag menus heading for a rate increase while there's still time to fix it:

1. `node scripts/build_pfp_risk.js` → queries BigQuery (`sessions-core-data.deliveroo`: `s3_core_orders_staging`, `s3_core_missing_or_incorrect_items_staging`, `daily_reports_report_five_staging`) for quarter-to-date per-site metrics, maps them onto the contract band tables, compares vs the adjustments currently applied (`Q3_existing-sites_BY-SITE.csv`), writes `04_analysis/q3_pfp_risk_data.json`. Uses ADC auth + the BQ client from Platform-weekly-dashboard's node_modules. **Universe:** restricted to the same menus as the rolling-4 rate check (`q3_rolling4_rate_check_by_menu.csv`), so both tracker tabs quote one menu total; sites outside that set (mid-quarter launches, menus not matched to the Q3 file) are dropped — run `build_q{n}_views.js` first.
2. The **"Fee risk next quarter" tab on the Q3 tracker** renders this JSON (rebuild with `build_q3_html.js` after refreshing it). `scripts/build_pfp_risk_html.js` also still writes the standalone page (`05_reports/Deliveroo_PfP_Risk_Mockup.html`) if a shareable single-purpose version is wanted.

Methodology notes (validated against the raw per-site values on Deliveroo's Q3 Commission Output):
- **Missing items** = distinct orders with a claim ÷ delivered orders — matches Deliveroo to ~0.1pp.
- **Open at peak** = open minutes ÷ **zone**_scheduled_minutes, hours 17–20 — matches to ~0.3pp.
- **Rider wait** is a calibrated proxy: our export's `rider_wait_time` runs long vs Deliveroo's "Rider Held Time"; a **>8 min** threshold reproduces Deliveroo's measured %s (exact on several sites, ±2pp typical). Directional only.
- `order_value` in `s3_core_orders_staging` is in **pence**.
- Deliveroo scores some sites on a shared **group-level** value (the most common Raw_* triple in the BY-SITE file) rather than individually.

### Blank Site/Brand columns (Q3 2026 onward)
From Q3, Deliveroo's Commission Output arrives with **`Site`/`Brand` blank** — menus are identified only by numeric `Restaurant ID` (weekly statements key on name, not ID, so they can't help). The Q{n} validator backfills names from two sources, in order:
1. the **previous quarter's** Commission Output ID→name map (keeps established sites on their statement spelling);
2. `reference/deliveroo_id_name_map.csv` — the **Roo Hub restaurant registry** exported from BigQuery (`sessions-core-data.deliveroo.roo_hub_sessions_restaurants_unique_staging`, `id` → `name`). Refresh with `node scripts/build_id_name_map.js` before validating a new quarter; new sites appear in the registry as they're onboarded.

With both sources the Q3 file resolves 1,810/1,810 names (the registry covered all 340 IDs that were new since Q2). Anything still unresolved lands in `Q{n}_existing-sites_UNNAMED.csv`.
