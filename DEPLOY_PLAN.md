# DEPLOY_PLAN — deliveroo-fee-risk on vm-claude-code

> On approval this file is committed to the repo as `DEPLOY_PLAN.md` (same convention as
> Platform-weekly-dashboard's) and each step is ticked there as it completes, so a later
> session can resume cleanly. Executed strictly one step at a time.

Deploy this app to the GCP VM `vm-claude-code` (34.13.22.38) behind the Mozart portal, matching
the conventions of the existing Sessions apps (closest sibling: weekly-platform-kpi — same
Express-wrapper-around-a-pipeline shape; its auth/PM2/deploy patterns are copied).

**Values:** APP_NAME `deliveroo-fee-risk` · display name "Deliveroo Fee Risk Analysis" ·
SUBDOMAIN `feerisk` → http://feerisk.34.13.22.38.nip.io/ · PORT **8085** (verified free) ·
repo `tristansessions/deliveroo-fee-risk` (private — Tristan's account, same as
Platform-weekly-dashboard; decision 2026-07-30, supersedes the brief's `sessions-data` org) ·
OAuth client "Sessions Deliveroo Fee Risk Analysis" in `sessions-core-data` ·
redirect URI `http://feerisk.34.13.22.38.nip.io/auth/callback` ·
origin `http://feerisk.34.13.22.38.nip.io`.

**Verified VM facts (2026-07-29):** proxy = Caddy (`/etc/caddy/Caddyfile`, plain `http://` blocks,
backup `Caddyfile.bak.<desc>.<ts>`, `caddy validate` → `systemctl reload caddy`); portal tiles =
`SECTIONS` array in `/opt/mozart/src/app/dashboard.js` (mozart = Next.js on :9000 under user
`paulaestevezcons`'s PM2 — rebuild + restart as that user); root PM2 + `pm2-root.service` enabled;
deploy keys `/root/.ssh/id_ed25519_<app>` + Host alias in `/root/.ssh/config`; ports 8080–8084
taken (8084 = weekly-platform-kpi, deployed 28 Jul — the brief's "propose 8084" is stale),
**8085 free**; Node v24.14.1; `pwsh` NOT installed (needed for the quarterly validator);
the weekly Deliveroo statements this pipeline reads already live on the VM at
`/opt/weekly-platform-kpi/drive-mirror` (rclone, synced Wednesdays) and the `weeks.js`
statement-discovery module at `/opt/weekly-platform-kpi/scripts/weeks.js` → **no new Drive
integration needed**; BigQuery via the VM SA's ADC (read-only, no key file, no IAM change).

**Decisions (Tristan, 2026-07-29):** stack = plain Express copying weekly-platform-kpi (not
Next.js/FastAPI — "copy the closest existing app" beats the brief's menu); home page = full Q3
Rate Tracker (fee-risk tab included), standalone PfP page at `/risk`; auto-refresh daily 08:00
Europe/London (node-cron in-process) + "Refresh now" button; quarterly inputs arrive through an
authenticated **upload form at `/inputs`** (Tristan's call — replaces the Drive-sync idea for
new rate files); validator stays PowerShell, run via `pwsh` on the VM with explicit
forward-slash args (its default param paths are Windows `\`).

---

## Phase A — code changes (this repo, local) — DONE, committed locally (2 commits)

- [x] **A1. `server/auth.js`** — Google OAuth middleware (own client), copied from
      weekly-platform-kpi: `/auth/login`, `/auth/callback`, `/auth/logout`; `cookie-session`
      signed with `SESSION_SECRET` (30 days); allow-list from `allowed-emails.json` re-read on
      EVERY sign-in (case-insensitive exact match, no domain fallback); 403 page for non-listed;
      `/api/*` gets 401 JSON instead of a redirect. Auth active only when `GOOGLE_CLIENT_ID` is
      set → local dev unchanged (auth off, 127.0.0.1:4700).
- [x] **A2. `server/index.js`** — status-bar + iframe wrapper of the built tracker; routes
      `/` `/tracker` `/risk` `/inputs` `/download/xlsx` `/api/status|refresh|upload|runs|logs`;
      "← Portal" button via `PORTAL_URL`; binds 127.0.0.1 only; daily cron (default on when auth
      on); refresh tier: `POST /api/refresh` + `/api/upload` 403 for view-only accounts.
- [x] **A3. `/inputs` upload form** — quarterly Commission Output CSV (+ optional new-sites rate
      card .md) via busboy; CSV header sanity-checked before install; canonical copies land in
      `03_source-data/` / `02_menu-rates/`, raw upload archived under `uploads/` (gitignored);
      a Q3 CSV upload auto-triggers a `--full` refresh.
- [x] **A4. `scripts/run_refresh.js`** — orchestrator (lock `logs/refresh.lock`, per-run log,
      `logs/status.json` for the UI). Daily: views → PfP BigQuery (failure NON-fatal, keeps
      previous data) → HTML. `--full` prepends: ID→name registry (BQ) → pwsh validator with
      explicit `-InputCsv/-NameMapCsv/-HubMapCsv/-OutDir` (newest commission CSV by name sort).
- [x] **A5. De-hardcoded Windows paths** — own `@google-cloud/bigquery` + `exceljs` deps
      (`build_pfp_risk.js`, `build_id_name_map.js`, `build_q3_views.js`); `weeks.js` resolved
      from `PLATFORM_KPI_DIR`; `BIGQUERY_KEY_FILE` local-dev-only ADC fallback wired.
- [x] **A6. `ecosystem.config.js`** — PM2 (name `deliveroo-fee-risk`, script `server/index.js`,
      cwd `/opt/deliveroo-fee-risk`, PORT 8085, 500M restart cap).
- [x] **A7. `.env.example` + `allowed-emails.example.json` committed; `.gitignore` = `.env*`,
      `allowed-emails.json`, `node_modules/`, `uploads/`, `logs/`, `04_analysis/`, `05_reports/`
      (analysis + reports fully regenerable from committed sources).**
- [x] **A8. `CLAUDE.md`** (standalone repo doc: stack, env vars, deploy, quarterly runbook,
      weekly-platform-kpi cross-dependency, gotchas) **+ README** web-app section; `git init`,
      identity set, 2 commits on `main`.
- [x] **A9. Local end-to-end test** — full pipeline 16s clean (validator → statements → BQ →
      HTML; 317 sites at risk £45,941/qtr matches previous run); all routes 200; bad CSV
      rejected with header message; real CSV upload installed + auto-triggered full refresh;
      double-refresh → 409; UI status bar verified in browser.
- [x] **A10. Pushed** to `tristansessions/deliveroo-fee-risk` (private, created by Tristan
      2026-07-30; 6 commits on `main`). Paula no longer needed for GitHub steps; the deploy key
      (B2) goes into the repo's own Settings → Deploy keys.

## Phase B — deploy on the VM

- [x] **B1. PowerShell 7.6.4** installed 2026-07-30 via the Microsoft apt repo (Debian 12
      bookworm — NOT Ubuntu as the brief assumed; `packages-microsoft-prod.deb` for debian/12).
- [x] **B2. Deploy key** generated 2026-07-30 (`/root/.ssh/id_ed25519_deliveroo-fee-risk`,
      `Host github-deliveroo-fee-risk` alias added; config backup
      `config.bak.pre-deliveroo-fee-risk.<ts>`). **⏸ Tristan adds the public key to
      repo Settings → Deploy keys (read-only) before B3.**
- [ ] **B3. Clone** to `/opt/deliveroo-fee-risk`; `npm install --omit=dev`.
- [ ] **B4. VM-only files** (values never printed): `.env` chmod 600 (`SESSION_SECRET` generated
      on the VM; `PLATFORM_KPI_DIR=/opt/weekly-platform-kpi`;
      `SESSIONS_FINANCE_DRIVE=/opt/weekly-platform-kpi/drive-mirror`; OAuth pair added at C1),
      `allowed-emails.json` (two-tier, both tiers seeded paula@ + tristan@).
- [ ] **B5. First full pipeline run** — `npm run refresh:full` on the VM: proves pwsh validator,
      statements via the weekly-kpi mirror, BigQuery ADC, HTML build. Check
      `Q3_existing-sites_UNNAMED.csv` empty and at-risk numbers match local.
- [ ] **B6. `pm2 start ecosystem.config.js && pm2 save`**; `curl -s 127.0.0.1:8085` check;
      confirm 127.0.0.1-only bind.

## Phase C — portal + OAuth

- [ ] **C1. ⏸ Paula creates OAuth client** "Sessions Deliveroo Fee Risk Analysis" in
      `sessions-core-data`: origin `http://feerisk.34.13.22.38.nip.io`, redirect
      `http://feerisk.34.13.22.38.nip.io/auth/callback`; sends Client ID + secret → VM `.env`;
      pm2 restart.
- [ ] **C2. Caddy block** (backup first): `http://feerisk.34.13.22.38.nip.io {
      reverse_proxy localhost:8085 }`; `caddy validate`; `systemctl reload caddy`; verify
      externally reachable (redirects to Google sign-in) and all 6 existing apps unaffected.
- [ ] **C3. Portal tile** (backup `/opt/mozart/src/app/dashboard.js` first): add
      `{ name: "Deliveroo Fee Risk", url: "http://feerisk.34.13.22.38.nip.io/" }` to the
      **Finance** section; rebuild + restart mozart as `paulaestevezcons`; confirm tile in the
      built chunk; portal + app both up.
- [ ] **C4. End-to-end auth test** (Tristan): tile opens the app, listed sign-in + tracker +
      `/risk` + Excel download work, non-listed email → 403, view-only demo optional.

## Phase D — schedule + quarterly-inputs verification

- [ ] **D1. "Refresh now" on the VM** — completes headlessly; status bar updates; iframe reloads.
- [ ] **D2. Daily cron proof** — next morning's 08:00 Europe/London run appears in `logs/` and
      `status.json` (server log shows the schedule registered at boot).
- [ ] **D3. `/inputs` upload proof** — re-upload the current Q3 CSV through the form on the VM;
      full refresh (validator included) runs; numbers unchanged; archive lands in `uploads/`.
      NOTE: statements freshness is bounded by weekly-platform-kpi's **Wednesday** rclone sync —
      acceptable for weekly statements; documented in CLAUDE.md §6.

## Final checklist (hand-over)

- [ ] Home loads via http://feerisk.34.13.22.38.nip.io/ (redirects to Google)
- [ ] OAuth login works for a listed email
- [ ] Non-listed email rejected (403)
- [ ] Portal tile opens the app
- [ ] BigQuery works on the VM via ADC (no key file) — proven by B5/D1
- [ ] pwsh validator + statements mirror work headlessly — proven by B5/D3
- [ ] `pm2 save` done; survives restart
- [ ] Daily 08:00 cron verified (D2)
