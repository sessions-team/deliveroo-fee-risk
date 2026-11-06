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
| `data/reference/contract/` | The signed Deliveroo contract (PDF + text extraction) and `CONTRACTED-RATES.md`. The source of truth for *agreed* rates. |
| `data/reference/` | Cross-quarter masters: `menu_aliases.csv` (curated statement → file name matches) and `deliveroo_id_name_map.csv` (Roo Hub ID → name registry). |
| `data/raw/menu-rates/` | The quarterly **new-sites rate cards** as received from Deliveroo (`Q{n}-2026_new-sites_rates.md`). |
| `data/raw/commission-output/` | The quarterly **existing-sites Commission Output CSVs** as received. Never edit these. |
| `output/analysis/` | Working files rebuilt by the pipeline: validated by-site rates, rate checks, dashboard JSON (gitignored). |
| `output/reports/` | Finished, shareable outputs: the Q{n} Rate Tracker `.html` / `.xlsx` and the PfP risk page (gitignored). |
| `scripts/` | The pipeline — per-quarter build scripts, the PowerShell validators, `run_refresh.js` (see `CLAUDE.md`). |

Standard pipeline layout (see `../CLAUDE.md`), adopted 2026-09-25 — before that the same
content lived in numbered `01_contract/ … 05_reports/` folders.

## Goal

Produce a report showing, per menu:
- Contracted rate (from `data/reference/contract`)
- Actual rate charged (from `data/raw/menu-rates`)
- Variance (£ and %)
- Flag where actual ≠ contracted (potential overcharge)

## Quarterly refresh (per-quarter pipeline)

Each quarter Deliveroo sends (a) a **new-sites rate card** by email and (b) an **existing-sites Commission Output CSV**. Scripts are duplicated per quarter so prior quarters stay intact as history (`Validate-Q{n}...`, `build_q{n}_views.js`, `build_q{n}_html.js`). The quarter-agnostic parts (`run_refresh.js`, the web server, `build_pfp_risk.js` / `build_pfp_risk_html.js`) read **which quarter is current** from `scripts/lib/current_quarter.js` — the one file to edit at a rollover once the new quarter's scripts exist.

To load a new quarter (Q4 2026 shown — loaded 2026-10-06):
1. Save the email rate card as `data/raw/menu-rates/Q{n}-2026_new-sites_rates.md` (reconcile every bracket to contract headline − 1.50%).
2. Drop the Commission Output CSV into `data/raw/commission-output/Q{n}_existing-sites_commission_output_<date>.csv` (never edit source files).
3. `node scripts/build_id_name_map.js` → refresh the Roo Hub ID→name registry (files from Q3 2026 on arrive with blank names — see below).
4. `powershell scripts/Validate-Q{n}ExistingSites.ps1` → validates every row vs contract, writes `output/analysis/Q{n}_existing-sites_BY-SITE.csv` (+ `_FINDINGS`, `_UNNAMED`). `_UNNAMED` must be empty.
5. `node scripts/build_q{n}_views.js` → rolling-4 rate-check, launched-menu check (menus launched after quarter start → New rate card), rate distributions, `q{n}_dashboard_data.json`, and `output/reports/Deliveroo_Q{n}_Rate_Tracker.xlsx`.
6. `node scripts/build_q{n}_html.js` → `output/reports/Deliveroo_Q{n}_Rate_Tracker.html`.
7. (optional, any time mid-quarter) `node scripts/build_pfp_risk.js` then re-run `build_q{n}_html.js` → populates the tracker's **"Fee risk next quarter"** tab with quarter-to-date PfP metrics from BigQuery (see below). Without the JSON the tab shows a how-to note.

Steps 3–7 are what `npm run refresh:full` runs (the daily refresh and the "Refresh now" button run 5–7).

**Timing:** a quarter's Adjusted rate is effective from the **10th business day after the previous quarter ends** (Q3 2026 = 2026-07-14, Q4 2026 = 2026-10-14). The rate-check only compares weeks on/after that date; earlier weeks are still on the previous quarter's rate. The tracker shows an "awaiting data" banner until the first Q{n}-effective week lands (Q4 2026: the week ending Sun 18 Oct).

## PfP adjustment early-warning (fee-increase risk)

The contract's three PfP metrics (Rider Wait Time, Missing Items, Open Hours at Peak — `CONTRACTED-RATES.md` §1b) are re-measured by Deliveroo each quarter and set next quarter's rate. Two scripts flag menus heading for a rate increase while there's still time to fix it:

1. `node scripts/build_pfp_risk.js` → queries BigQuery (`sessions-core-data.deliveroo`: `s3_core_orders_staging`, `s3_core_missing_or_incorrect_items_staging`, `daily_reports_report_five_staging`) for quarter-to-date per-site metrics, maps them onto the contract band tables, compares vs the adjustments currently applied (`Q{n}_existing-sites_BY-SITE.csv`), writes `output/analysis/q{n}_pfp_risk_data.json` (quarter from `scripts/lib/current_quarter.js`). Uses ADC auth. **Universe:** restricted to the same menus as the rolling-4 rate check (`q{n}_rolling4_rate_check_by_menu.csv`), so both tracker tabs quote one menu total; sites outside that set (mid-quarter launches, menus not matched to the quarter's file) are dropped — run `build_q{n}_views.js` first. **Before the quarter's rates are effective** (its first ~2 weeks) the rate-check has no weeks, so the script falls back to every named site on the Commission Output (the JSON's `universe` field says which) and narrows itself once the first effective week lands.
2. The **"Fee risk next quarter" tab on the current quarter's tracker** renders this JSON (rebuild with `build_q{n}_html.js` after refreshing it). `scripts/build_pfp_risk_html.js` also still writes the standalone page (`output/reports/Deliveroo_PfP_Risk_Mockup.html`) if a shareable single-purpose version is wanted.

Methodology notes (validated against the raw per-site values on Deliveroo's Q3 Commission Output):
- **Missing items** = distinct orders with a claim ÷ delivered orders — matches Deliveroo to ~0.1pp.
- **Open at peak** = open minutes ÷ **zone**_scheduled_minutes, hours 17–20 — matches to ~0.3pp.
- **Rider wait** is a calibrated proxy: our export's `rider_wait_time` runs long vs Deliveroo's "Rider Held Time"; a **>8 min** threshold reproduces Deliveroo's measured %s (exact on several sites, ±2pp typical). Directional only.
- `order_value` in `s3_core_orders_staging` is in **pence**.
- Deliveroo scores some sites on a shared **group-level** value (the most common Raw_* triple in the BY-SITE file) rather than individually.

### Blank Site/Brand columns (Q3 2026 onward)
From Q3, Deliveroo's Commission Output arrives with **`Site`/`Brand` blank** — menus are identified only by numeric `Restaurant ID` (weekly statements key on name, not ID, so they can't help). The Q{n} validator backfills names from two sources, in order:
1. the **previous quarter's** Commission Output ID→name map (keeps established sites on their statement spelling);
2. `data/reference/deliveroo_id_name_map.csv` — the **Roo Hub restaurant registry** exported from BigQuery (`sessions-core-data.deliveroo.roo_hub_sessions_restaurants_unique_staging`, `id` → `name`). Refresh with `node scripts/build_id_name_map.js` before validating a new quarter; new sites appear in the registry as they're onboarded.

With both sources the Q3 file resolves 1,810/1,810 names (the registry covered all 340 IDs that were new since Q2) and the Q4 file 2,067/2,067 (423 IDs new since Q3; 134 of them only appeared in the registry after refreshing it). Anything still unresolved lands in `Q{n}_existing-sites_UNNAMED.csv`.

The Q4 2026 file also changed shape cosmetically: 4-decimal numbers (`26.4000%`, `-0.4000`) and a trailing comma on every line (an unnamed 17th column). `Validate-Q4ExistingSites.ps1` trims the header's trailing comma before parsing so Windows PowerShell 5.1 and pwsh 7 see the same 16 columns.
