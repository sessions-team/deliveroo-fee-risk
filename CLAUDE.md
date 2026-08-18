# Deliveroo Fee Risk Analysis — Project Documentation (CLAUDE.md)

Tracks the commission rates Deliveroo actually charges per menu against the contracted rates,
and flags menus heading for a PfP fee increase next quarter while there's still time to fix it.
A thin Express server wraps the existing audit pipeline: status bar + iframe of the built
Q3 Rate Tracker, a standalone fee-risk page, an /inputs upload form for the quarterly Deliveroo
files, "Refresh now", and a daily 08:00 auto-refresh.

**Deployed as `deliveroo-fee-risk` on the GCP VM `vm-claude-code` (34.13.22.38), port 8085,**
**behind the Mozart portal at http://feerisk.34.13.22.38.nip.io/.** Analysis methodology lives
in `README.md`; the contract's band tables in `01_contract/CONTRACTED-RATES.md`.

## 1. Stack

| Layer | Technology |
|---|---|
| Server | Node.js (plain Express 4, no framework) — `server/index.js` |
| Auth | Google OAuth 2.0 code flow, hand-rolled in `server/auth.js` (global fetch) + `cookie-session` |
| Scheduler | `node-cron` inside the server process (no OS cron on the VM) — daily 08:00 Europe/London |
| Pipeline | Node scripts under `scripts/` + the quarterly PowerShell validator (`pwsh` on the VM) |
| Uploads | `busboy` multipart → `03_source-data/` + archive in `uploads/` |
| BigQuery | `@google-cloud/bigquery` on ADC (VM: attached service account, read-only; no key file) |
| Statements | read from the **weekly-platform-kpi** app's Drive mirror (see §6) |
| Process manager (VM) | PM2 under root (`ecosystem.config.js`), persisted via `pm2-root.service` |
| Reverse proxy (VM) | Caddy (`/etc/caddy/Caddyfile`) — `http://feerisk.34.13.22.38.nip.io → 127.0.0.1:8085` |

No TypeScript, no build step — keep it that way unless asked.

## 2. Two modes, one codebase

- **Local (Tristan's Windows machine):** no `.env` → auth OFF, server open on 127.0.0.1:4700,
  scheduler OFF; statements come from the local Platform-weekly-dashboard checkout + Google
  Drive for Desktop (auto-resolved); the validator runs on Windows PowerShell; BigQuery needs
  user ADC (`gcloud auth application-default login`).
- **VM:** `.env` present → auth ON (every route except `/auth/*` requires a session; `/api/*`
  returns 401 JSON instead of redirecting), scheduler ON. Statements come from
  `/opt/weekly-platform-kpi/drive-mirror`; the validator runs on `pwsh`; BigQuery uses the
  VM's attached service account (ADC).

## 3. The pipeline (`npm run refresh` → `scripts/run_refresh.js`)

Daily / "Refresh now" (data refresh): `1` build_q3_views (rolling-4 rate check from weekly
statements) → `2` build_pfp_risk (quarter-to-date PfP metrics from BigQuery; failure is
NON-fatal — the tab keeps the previous data) → `3` build_q3_html + build_pfp_risk_html.

`--full` (after a quarterly upload, or first deploy) prepends: `0a` build_id_name_map
(Roo Hub registry from BigQuery; failure = warning) → `0b` `pwsh Validate-Q3ExistingSites.ps1`
with EXPLICIT `-InputCsv/-NameMapCsv/-HubMapCsv/-OutDir` args (the script's default param paths
are Windows-style `\` and must never be relied on under Linux). The validator input is the
NEWEST `03_source-data/Q3_existing-sites_commission_output_*.csv` by filename sort.

Safety: single-run lock `logs/refresh.lock`, per-run log `logs/refresh-<ts>.log`, UI summary in
`logs/status.json`. Blocker → the server keeps serving the last good output.

## 4. Env vars (see `.env.example`; real `.env` is VM-only, chmod 600, gitignored)

| Var | Purpose |
|---|---|
| `PORT` | 8085 on the VM (default 4700 locally) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client **"Sessions Deliveroo Fee Risk Analysis"** (sessions-core-data). Setting the ID is what turns auth on |
| `APP_BASE_URL` | `http://feerisk.34.13.22.38.nip.io` — redirect URI is `<APP_BASE_URL>/auth/callback`, registered on the client verbatim |
| `SESSION_SECRET` | signs the 30-day session cookie |
| `PORTAL_URL` | "← Portal" button target (default `http://portal.34.13.22.38.nip.io/`) |
| `PLATFORM_KPI_DIR` | Platform-weekly-dashboard checkout providing `scripts/weeks.js` (VM: `/opt/weekly-platform-kpi`) |
| `SESSIONS_FINANCE_DRIVE` | Finance-drive root for statements (VM: the weekly-kpi rclone mirror; local: unset → auto) |
| `BQ_PROJECT_ID` / `BQ_LOCATION` | default `sessions-core-data` / `europe-west2` |
| `SCHEDULE_CRON` / `SCHEDULE_TZ` / `SCHEDULE_ENABLED` | default `0 8 * * *` / `Europe/London` / on-when-auth-is-on |
| `BIGQUERY_KEY_FILE` | local-dev-only ADC fallback — never on the VM |

## 5. Access control

`allowed-emails.json` (repo root, **gitignored**, VM-only; example committed). Two shapes:
a plain JSON array (everyone listed may view AND refresh/upload), or two tiers —
`{ "emails": [viewers], "refresh": [who may rebuild or upload] }`. Re-read on **every request**
(the gate middleware) as well as at sign-in and on every refresh/upload attempt —
case-insensitive exact match, no domain fallback. **Add or remove a user = edit the file on the
VM. No restart needed, and no cookie to wait out:** a removed address loses access on its very
next request — the session is cleared and they get a 403 (JSON for `/api/*`, a page elsewhere),
never a redirect back through Google. If the file is unreadable the gate **fails closed** —
everyone is denied and the error is logged — so fix a broken edit promptly.

```
sudo nano /opt/deliveroo-fee-risk/allowed-emails.json
```

## 6. Cross-app dependency (weekly-platform-kpi)

The rolling-4 rate check reads the weekly Deliveroo statements through
`<PLATFORM_KPI_DIR>/scripts/weeks.js`, pointed at `SESSIONS_FINANCE_DRIVE`. On the VM both come
from the **weekly-platform-kpi** app: its checkout at `/opt/weekly-platform-kpi` and its rclone
Drive mirror at `/opt/weekly-platform-kpi/drive-mirror` (synced by THAT app on Wednesdays —
statements here are at most a week old, which matches their weekly cadence). If that app moves
or its mirror layout changes, update the two env vars here.

## 7. Deploy (VM)

Everything lives at `/opt/deliveroo-fee-risk`, cloned via the read-only deploy key
`/root/.ssh/id_ed25519_deliveroo-fee-risk` (`Host github-deliveroo-fee-risk` in
`/root/.ssh/config`) from the private repo `sessions-team/deliveroo-fee-risk`.

```bash
# routine redeploy
cd /opt/deliveroo-fee-risk && git pull && npm install --omit=dev && pm2 restart deliveroo-fee-risk

# first start (once)
pm2 start ecosystem.config.js && pm2 save

# logs / status
pm2 logs deliveroo-fee-risk --lines 100
tail -50 /opt/deliveroo-fee-risk/logs/refresh-*.log
```

VM-only files (never in git): `.env`, `allowed-emails.json`, `uploads/`, `logs/`,
`04_analysis/`, `05_reports/` (the last two are rebuilt by the pipeline).
System prerequisite: **PowerShell 7** (`pwsh`, Microsoft apt repo) for the quarterly validator.

## 8. VM conventions (shared with the other Sessions apps — verify, don't guess)

- **Ports:** 8080 dash · 8081 map · 8082 onboarding · 8083 triage · 8084 weekly-platform-kpi ·
  **8085 this app** · 9000 mozart. The server binds 127.0.0.1 only; no GCP firewall rule —
  Caddy on :80 is the only way in.
- **Caddy:** back up `/etc/caddy/Caddyfile` as `Caddyfile.bak.<desc>.<timestamp>` before edits;
  `caddy validate --config /etc/caddy/Caddyfile` then `systemctl reload caddy`.
- **Portal tile:** `SECTIONS` array in `/opt/mozart/src/app/dashboard.js` (owned by
  `paulaestevezcons`) — back up, edit, then rebuild + restart mozart **as that user**.
- **Secrets discipline:** never print, echo, or commit secret values; each app has its own
  OAuth client and its own allowed-emails.json.

## 9. Quarterly runbook (new quarter's rates)

1. Deliveroo email the **new-sites rate card** → save as `.md`; the **existing-sites Commission
   Output CSV** arrives alongside.
2. Open **http://feerisk.34.13.22.38.nip.io/inputs**, pick the quarter, upload both. The CSV's
   header is sanity-checked, canonical copies land in `03_source-data/` / `02_menu-rates/`, raw
   uploads are archived under `uploads/`, and a `--full` refresh runs automatically.
3. **Quarterly rollover (Claude session):** per repo convention scripts are duplicated per
   quarter (`Validate-Q{n}...`, `build_q{n}_views/html.js`) so history stays intact — generate
   the next quarter's set, update the constants (quarter dates, effective-from = 10th business
   day after quarter end), update `run_refresh.js`/`server/index.js` references, redeploy.
4. Check `04_analysis/Q{n}_existing-sites_UNNAMED.csv` is empty (registry names all new IDs).

## 10. Gotchas

- `order_value` in `s3_core_orders_staging` is in **pence**.
- Rider wait is a **calibrated proxy** (>8 min threshold reproduces Deliveroo's "Rider Held
  Time" %s, ±2pp typical) — directional only; missing items and open-at-peak match to ~0.1–0.3pp.
- Deliveroo scores some sites on a shared **group-level** metric triple (the most common Raw_*
  triple in the BY-SITE file) rather than individually.
- The PfP risk universe is restricted to the rate-check menus (`q3_rolling4_rate_check_by_menu.csv`)
  so both tracker tabs quote one menu total — `build_q3_views.js` must run before `build_pfp_risk.js`.
- The BY-SITE CSV is written by PowerShell: booleans serialise as `True`/`False` (capital T/F) —
  `build_q3_views.js` checks `Named !== 'True'`; keep that spelling if the validator is ever ported.
- A quarter's Adjusted rate is effective from the **10th business day** after the previous
  quarter ends (Q3 2026 = 2026-07-14); pre-effective weeks are checked against nothing.
