# DEPLOY_PLAN — deliveroo-fee-risk on vm-claude-code

> On approval this file is committed to the repo as `DEPLOY_PLAN.md` (same convention as
> Platform-weekly-dashboard's) and each step is ticked there as it completes, so a later
> session can resume cleanly. Executed strictly one step at a time.

Deploy this app to the GCP VM `vm-claude-code` (34.13.22.38) behind the Mozart portal, matching
the conventions of the existing Sessions apps (closest sibling: weekly-platform-kpi — same
Express-wrapper-around-a-pipeline shape; its auth/PM2/deploy patterns are copied).

**Values:** APP_NAME `deliveroo-fee-risk` · display name "Deliveroo Fee Risk Analysis" ·
SUBDOMAIN `feerisk` → http://feerisk.34.13.22.38.nip.io/ · PORT **8085** (verified free) ·
repo `sessions-team/deliveroo-fee-risk` (private — created under `tristansessions` 2026-07-30,
transferred to the `sessions-team` org 2026-08-11 by Tristan; deploy key travelled with it) ·
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

## Execution rules (Tristan, 2026-07-31 — binding for every remaining step)

1. Do exactly ONE numbered step at a time, in plan order (Phase A step 1, then A2, etc).
   Never batch steps or jump ahead.
2. After each step, run the verification relevant to that step and show the actual
   command and its real output, then STOP and wait for Tristan to say "continue" before
   the next step. If a step has no natural check, state exactly how to confirm it.
3. Before touching anything shared (Caddyfile, mozart's dashboard.js, PM2), take the
   backup using the plan's .bak convention and show the backup path BEFORE the change.
4. Never print, echo back, or commit secrets (.env values, the SA key, allowed-emails.json).
   If a step needs a secret not yet provided, stop and say precisely what is needed.
5. At any step depending on a person or third party (Tristan adding the deploy key, Paula
   creating the OAuth client), STOP and say exactly what must happen and what value to
   hand back before continuing. No workarounds.
6. If a check fails, stop and diagnose. Do not proceed or paper over it.
7. Keep every change minimal and reversible; flag anything that isn't.
8. After each completed step, tick it off in DEPLOY_PLAN.md so a later session can
   resume cleanly.

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
- [x] **A10. Pushed** to `sessions-team/deliveroo-fee-risk` (private, created by Tristan
      2026-07-30; 6 commits on `main`). Paula no longer needed for GitHub steps; the deploy key
      (B2) goes into the repo's own Settings → Deploy keys.

## Phase B — deploy on the VM

- [x] **B1. PowerShell 7.6.4** installed 2026-07-30 via the Microsoft apt repo (Debian 12
      bookworm — NOT Ubuntu as the brief assumed; `packages-microsoft-prod.deb` for debian/12).
- [x] **B2. Deploy key** generated 2026-07-30 (`/root/.ssh/id_ed25519_deliveroo-fee-risk`,
      `Host github-deliveroo-fee-risk` alias added; config backup
      `config.bak.pre-deliveroo-fee-risk.<ts>`). **⏸ Tristan adds the public key to
      repo Settings → Deploy keys (read-only) before B3.**
- [x] **B3. Cloned** 2026-07-31 to `/opt/deliveroo-fee-risk` (@ e76f103, via the deploy-key
      alias); `npm install --omit=dev` = 233 packages, 48M. NOTE: gcloud auth kept expiring
      (Workspace reauth policy) — remaining VM access is direct
      `ssh -i ~/.ssh/google_compute_engine Trist@34.13.22.38`, no gcloud dependency.
- [x] **B4. VM-only files** created 2026-07-31 (values never printed): `.env` chmod 600
      (`SESSION_SECRET` generated on the VM via openssl; `PLATFORM_KPI_DIR=/opt/weekly-platform-kpi`;
      `SESSIONS_FINANCE_DRIVE=/opt/weekly-platform-kpi/drive-mirror`; OAuth pair added at C1 —
      auth stays OFF until then, safe because the server binds 127.0.0.1 and has no Caddy route
      yet), `allowed-emails.json` chmod 600 (two-tier, both tiers seeded paula@ + tristan@).
- [x] **B5. First full pipeline run** 2026-07-31 — `npm run refresh:full` DONE ok in 27.5s: pwsh
      validator (16,290 rows / 1,810 restaurants, names fully resolved), statements via the
      weekly-kpi mirror (4 Q3 weeks, 11 rate exceptions — matches local), BigQuery ADC (1,048
      sites; 330 at risk £48,000/qtr vs local 317/£45,941 — one extra day of quarter-to-date
      data, expected drift), HTML built. `UNNAMED.csv` = 0 bytes; `status.json` result "ok".
- [x] **B6. PM2 started + saved** 2026-07-31 — id 4 `deliveroo-fee-risk` online under root PM2,
      dump saved; `curl 127.0.0.1:8085` = HTTP 200 (wrapper page); bind confirmed
      **127.0.0.1:8085 only**; all 4 existing root-PM2 apps untouched/online. Boot log: auth
      disabled + scheduler disabled — both by design until the OAuth pair lands at C1
      (scheduler is on-when-auth-is-on).

## Phase C — portal + OAuth

- [x] **C1. OAuth client live** 2026-07-31 — "Sessions Deliveroo Fee Risk Analysis" created;
      ID + secret appended to VM `.env` (via stdin, chmod 600, never echoed) and app restarted.
      Boot log: `Auth: ENABLED (callback http://feerisk.34.13.22.38.nip.io/auth/callback)` and
      `Scheduled auto-refresh: "0 8 * * *" (Europe/London)`; local curl now 302 → sign-in
      (was 200 open). NOTE: the secret transited this chat — if that's a concern, reset the
      client secret in the console any time and update `.env` + restart.
- [x] **C2. Caddy block live** 2026-08-11 (backup
      `/etc/caddy/Caddyfile.bak.pre-feerisk.20260811-084948` taken first): appended
      `http://feerisk.34.13.22.38.nip.io { reverse_proxy localhost:8085 }`; "Valid
      configuration"; reloaded. External check: feerisk 302 → `/auth/login` (Google sign-in) ✓;
      all 6 existing subdomains (portal/dash/map/onboarding/triage/platform) still 302/307 to
      their own sign-ins — unaffected.
- [x] **C3. Portal tile live** 2026-08-11 (backup
      `/opt/mozart/src/app/dashboard.js.bak.pre-feerisk.20260811-090818` taken first):
      one-line insert `{ name: "Deliveroo Fee Risk", url: "http://feerisk.34.13.22.38.nip.io/" }`
      in the **Finance** section (diff = 1 added line); mozart rebuilt + restarted as
      `paulaestevezcons` (online, new pid); tile string confirmed in built chunk
      `page-b1e4e677954b9153.js`; portal 302 (its own sign-in) + feerisk 302 → `/auth/login` ✓.
- [x] **C4. End-to-end auth test PASSED** (Tristan, 2026-08-11): portal tile opens the app;
      listed sign-in loads the tracker with live status bar; Fee-risk page, Excel download and
      /inputs all work — "everything works as the steps intend". Machine-side checks also
      verified: /auth/login 302s to Google with the exact registered redirect_uri;
      unauthenticated /api/* returns 401 JSON.

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
