# Level 3 — Release / Deployment / Final Acceptance Checklist

> Source of the rules: `AGENTS.md` (Verification Levels, Level 3) and the project skills
> `on-premise-windows-deployment` and `pwa-release-testing`. Operations detail lives in
> `docs/architecture/06-deployment-runbook.md`, `docs/architecture/05-backup-and-recovery.md`,
> `docs/operations/backup-and-restore.md` and `docs/client-install-and-public-access.md`; this file only orders and
> gates them. Phone-testing history: `docs/testing/PHONE_TESTING_STATUS.md`.
>
> **Run this only at an explicit release/acceptance checkpoint**, against the real production hostname. Do not
> claim a real browser restart, PWA force-close, phone test, offline test or HTTPS result unless it was actually
> performed on the production setup. Record evidence in the right-hand column (command output, screenshot name,
> date, who ran it). No secrets, real IPs, tunnel tokens or client data go into this file or Git.

**Legend — Who:** `Owner` = client/operator action (account, PC, router, DNS, secrets) · `Agent` = Claude can run it
on the dev machine or read-only · `Phone` = needs the physical phone in hand · `Both` = agent prepares/verifies,
owner performs. **Status:** ☐ not done · ☑ done · ⛔ blocked · n/a.

Hosting model (default): client domain on Cloudflare → Cloudflare Tunnel → `cloudflared` container → Caddy (plain
HTTP inside) → web assets + `/api` → API → PostgreSQL on the private network. Alternate (static IP + forwarded
80/443, Caddy's own Let's Encrypt certificate) only if the client asks for it; the steps that differ are marked
**[direct]**.

---

## Local verification checkpoint — 2026-10-08 (development stack only)

Build `build-20261008T155132Z` (rebuilt 2026-10-09 with the I-31/L-5 fixes; web/proxy only, API and PostgreSQL untouched), source HEAD `8753839`
plus uncommitted changes. (The 8 October pass was build `150537Z`, release `sha256-e66944cf3f89e348`.) **Client handover: NOT YET.** These ticks describe the local pass;
the production gates below remain open. The physical WebAPK uses USB `http://localhost:8081`,
not the production HTTPS hostname. [Full evidence and reproduction](../testing/RELEASE_LOCATION_VERIFICATION.md).

| Local check | Status | Evidence / limit |
|-------------|--------|------------------|
| Web/API typecheck and both builds | ☑ | Host builds and final Docker proxy build pass. |
| Full configured Playwright; web Node | ☑ | 2026-10-09: Playwright 190/190, web Node 377/377 (+3 `.tsx` = 400), zero skips. 8 October: rejection script 5/5 and live accepted-detail gate 2/2 (not repeated). |
| Full API/Node regression against disposable PostgreSQL | ☑ | 2026-10-09: 519 total, **519 pass, 0 fail**, zero skips, 101 files run one process each. The four stale fixtures (I-32) were repaired; they also failed before the location work. |
| Historical baseline exception inspected | ☑ | Only two V6 uploader type/comparison lines from `10f3bbb`; owner reconciliation pending. Other protected historical paths unchanged. |
| Web/proxy-only deployment and build identity | ☑ | 2026-10-09: `docker compose build proxy` + `up -d --no-deps proxy`; served `index-C9GpWWKB.js` contains `build-20261008T155132Z`; `/api/health` ok; API/PostgreSQL not restarted. The phone was not re-updated to this build. |
| Local health and security headers | ☑ | Health-Check.ps1 and check-security-headers.mjs pass on local HTTPS. No production certificate/HSTS claim. |
| API/PostgreSQL unchanged; data survives proxy recreation | ☑ | Container IDs/start times/restart counts unchanged; customer/job/proposal/decision counts unchanged across deployment. No API/PG restart rehearsal. |
| Physical phone L-1/L-2 and offline round trip | ☑ | Draft reload/navigation/force-close; Pending offline reload/force-close; reconnect confirms exactly one server row for submitted UUID. Failed after 503 + reload; Synced after re-entry. |
| Physical phone L-3 and manager decisions | ☑ | Specific local errors send zero PUT; real 400 appears above Save; own readable proposals approved/rejected. Legacy row Rejected, not deleted; older unrelated readable Pending row retained. |
| Physical phone smoke and test cleanup | ☑ | Login/home/draft, real typing persisted to IndexedDB, header observed; own temporary local data and active location removed. Audit decisions remain. |
| Owner's L-4 non-blocking warning | ☑ | Two browser cases fail before/pass after; three Node tests; phone plus 360/768/1280 layout checks. Technician compares frozen visit data. |
| git diff --check | ☑ | Pass; no staging or Git mutation. |
| Production phone HTTPS, camera, API/PG restart, backup/restore and PC reboot | ☐ | Not performed in this pass; use production checklist below. |

Still open: L-6–L-8 and E-1 deferred checks; E-2 email retry acknowledgement. Fixed on 2026-10-09: I-31 (cross-job proposal-route crash), I-32 (API fixtures), L-5 (header ignored location proposals). Owner decisions remain:
corrected-visit PDF support (currently blocked), Supervisor correction rights (currently both
Admin and Supervisor), no password-reset feature/recovery procedure, and historical V6 baseline exception.
No P0/P1 introduced by the verified location changes was identified.

## 0. Go / no-go gates (before touching production)

| # | Gate | Who | Status | Evidence |
|---|------|-----|--------|----------|
| 0.1 | Release candidate is a **clean, committed** revision on the agreed branch; note the commit id and tag it (e.g. `release-YYYYMMDD`) so a rollback target exists. No uncommitted or unmerged changes on the client PC checkout. | Owner | ☐ | 2026-10-09 dev PC: fixes `8ed5dcc`, docs `2465503`, local tag `release-20261009` on the final docs commit (`git rev-parse release-20261009^{commit}`); only generated `scripts/phone-testing/mode.txt` left untracked. **Client PC checkout of that hash: NOT DONE.** Tag not pushed (owner decides). |
| 0.2 | No open **P0/P1** in the register; any open P2 is documented and owned by a later phase (`PHONE_TESTING_STATUS.md` §5/§8). | Both | ☑ | 2026-10-09: register has no open P0/P1; open P2/deferred (L-6–L-8, E-1, E-2) are listed in §8. Owner agreed to this on 2026-10-09; re-check at 9.6. |
| 0.3 | Level 1/2 gates green on that commit: web + API typecheck, web build, Node suites, the V7/V6 integration suites against the **disposable** Postgres (127.0.0.1:55432 only), full Playwright, `git diff --check`. | Agent | ☑ | 2026-10-09 on code commit `2465503` (docs-only commits since): web + API typecheck/build exit 0; web Node **377/377**; Playwright **190/190**; legacy-rejection script 5/5; API **519/519** over 101 files, one process each, 0 skipped, disposable PG removed afterwards; `git diff --check` clean. Diff scan: no secrets/IPs, no protected-scope files touched. (A first API re-run showed 14 failures caused by my gate script omitting `REPORT_CHROMIUM_PATH`; fixed in the script, no product change.) |
| 0.4 | Production secrets prepared **outside Git**: unique `POSTGRES_PASSWORD` (same value URL-encoded in `DATABASE_URL`), session/cookie secrets, `CLOUDFLARE_TUNNEL_TOKEN`, reminder e-mail credentials if used. Nothing from `.env` committed (`git status` shows no `.env`). | Owner | ☐ | |
| 0.5 | Client has accepted in writing: they own the domain, Cloudflare account and renewals; Cloudflare Tunnel free tier has **no uptime SLA** (accepted trade-off). | Owner | ☐ | |
| 0.6 | Production database starts **empty** (no demo customers/visits, no demo accounts such as the test technician/manager/supervisor logins). Demo data stays on the dev machine. | Owner | ☐ | |

## 1. Domain, tunnel and `.env` (production PC)

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 1.1 | Domain registered/renewing under the **client's** account; DNS in the client's Cloudflare account (no shadow DNS/tunnels elsewhere). | Owner | ☐ | |
| 1.2 | Tunnel created (Zero Trust → Networks → Tunnels); public hostname `app.<domain>` routed to `http://proxy:80`. Token copied to `.env` only. | Owner | ☐ | |
| 1.3 | `.env`: `PUBLIC_HOSTNAME=http://app.<domain>` (**the `http://` scheme is mandatory** — without it Caddy redirects to HTTPS and the browser loops), `CLOUDFLARE_TUNNEL_TOKEN` set, runtime paths under `C:\InspectionSystem\runtime\…`, `INSPECTION_WEB_RELEASE_RETENTION` ≥ 2, `INSPECTION_WEB_ACTIVE_RELEASE` empty. **[direct]** bare hostname instead, no token, router forwards TCP 80 + 443, ISP-confirmed static non-CGNAT IPv4, DHCP reservation. | Both | ☐ | |
| 1.4 | Runtime folders exist outside the repo: `uploads`, `logs\api`, `logs\proxy`, `backups\postgres`, `backups\uploads`, `restore-staging`, `operational`, `releases`. | Owner | ☐ | |
| 1.5 | Cloudflare dashboard settings for this hostname (these break the PWA/CSP silently if left on): **Rocket Loader off**, **Auto Minify off**, **Email Address Obfuscation off**, **Web Analytics / beacon injection off** (the enforced CSP blocks injected scripts), caching: `/sw.js`, `/index.html`, `/manifest.webmanifest` and `/api/*` must **not** be cached by Cloudflare (hashed `/assets/*` may be), "Always Use HTTPS" on, HTTP/3 optional. If Cloudflare adds its own HSTS, do not also raise Caddy's beyond the same value (see 6.4). | Owner | ☐ | |
| 1.6 | Upload path through Cloudflare: Cloudflare's request-body limit (100 MB on the free plan) and ~100 s proxy timeout are above the app's largest allowed photo and its stage endpoint time; verified in 7.7. | Both | ☐ | |

## 2. Docker Compose build and start (production PC)

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 2.1 | `docker compose --profile tunnel config --quiet` passes. | Owner | ☐ | |
| 2.2 | `docker compose --profile tunnel up -d --build` builds from the clean commit; `docker compose --profile tunnel ps` shows proxy, api, postgres, reminder-worker and **cloudflared** running (always include `--profile tunnel` on tunnel commands). | Owner | ☐ | |
| 2.3 | `docker compose logs cloudflared --tail=50` shows a healthy registration (an empty token makes it exit loudly). | Owner | ☐ | |
| 2.4 | **Only the proxy** is reachable from outside; PostgreSQL does **not** publish 5432; the API container publishes nothing; under the tunnel model no host ports at all (`docker compose ps`, `netstat`). | Both | ☐ | |
| 2.5 | `.\scripts\Health-Check.ps1 -BaseUrl https://app.<domain> -StrictCertificateCheck` returns OK; the health response reveals minimal information (status only, no versions/paths/DB details). | Both | ☐ | |
| 2.6 | First admin created with `apps/api/src/cli/createAdmin.ts` (strong password ≥ 12 chars via temporary env vars, never saved); no demo logins exist. Technician and supervisor accounts created by the admin. | Owner | ☐ | |
| 2.7 | The build id shown in the app header equals the deployed build (`docker compose exec -T proxy cat /srv/releases/active-release` and the "Support build …" text). | Both | ☐ | |

## 3. Persistence and restart (AGENTS.md Level 3)

Use a throw-away test customer/visit created on production, delete or archive it afterwards (note in 9.2).

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 3.1 | Create a visit, submit one inspection with a photo; confirm the row in PostgreSQL and the file on the **host** uploads path. | Both | ☐ | |
| 3.2 | `docker compose restart postgres` → data intact, API reconnects, `/api/health` OK. | Owner | ☐ | |
| 3.3 | `docker compose restart api` → sessions survive (no forced re-login), data intact. | Owner | ☐ | |
| 3.4 | `docker compose --profile tunnel up -d --force-recreate proxy` → site up, previous hashed assets still served, certificate/tunnel unchanged. | Owner | ☐ | |
| 3.5 | `docker compose down` then `up -d` (containers destroyed, volumes kept) → database and **uploads** intact (photos still open, hashes match: spot-check a few with the stored sha256). | Owner | ☐ | |
| 3.6 | **Full PC reboot**: Docker Desktop, the stack and `cloudflared` come back **without manual steps**; site reachable from a device outside the client's Wi-Fi within the agreed time. Windows sleep/hibernate disabled, Windows Update restart policy set, BIOS "restore on AC power loss" set, UPS noted. | Owner | ☐ | |
| 3.7 | Brief internet loss (unplug WAN ~1 min): tunnel reconnects by itself; nothing needs restarting. | Owner | ☐ | |

## 4. Backup and restore (do not back up live database files)

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 4.1 | `Backup-Database.ps1` and `Backup-Uploads.ps1` create timestamped files with manifest/checksum **outside** the database container, under `backups\`. | Owner | ☐ | |
| 4.2 | `Verify-Backup.ps1` passes on the newest `.dump` and `.zip`. | Both | ☐ | |
| 4.3 | **Restore test** into a disposable container/staging folder (`Restore-Database.ps1`, `Restore-Uploads.ps1` defaults): row counts and a sample of photo hashes match. | Both | ☐ | |
| 4.4 | Backups are scheduled (Windows Task Scheduler), and a copy leaves the PC (encrypted off-site/removable). Who checks the schedule and how often is written down. | Owner | ☐ | |
| 4.5 | Recovery set is complete: database dump + uploads archive + matching manifest + application version/commit id. | Owner | ☐ | |

## 5. Production PWA build and update safety

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 5.1 | Production build contains `index.html`, service worker, manifest, hashed JS/CSS chunks and icons; SW scope covers the whole app; the visible build version is shown in the app. | Agent | ☐ | |
| 5.2 | All new hashed assets are published **before** HTML references them; previous release assets are kept (retention ≥ 2). | Both | ☐ | |
| 5.3 | **Stale-cache regression test** from the runbook ("Stale-Cache Update Strategy") passes against the production host. | Both | ☐ | |
| 5.4 | **Rollback rehearsal**: set `INSPECTION_WEB_ACTIVE_RELEASE` to the previous release id, recreate proxy, confirm it serves the old release, then return to the image's release (runbook "Immediate rollback"). API/PostgreSQL/uploads untouched. | Owner | ☐ | |
| 5.5 | An installed phone on the previous build gets "New version available" → **Update now** and keeps its local drafts/pending records. | Phone | ☐ | |

## 6. HTTPS, headers and HSTS

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 6.1 | Valid certificate in a browser and `curl` (no `-k`); `http://` redirects to `https://` (Cloudflare "Always HTTPS"); no redirect loop. | Both | ☐ | |
| 6.2 | `node scripts/check-security-headers.mjs --url https://app.<domain>` passes (CSP **enforced**, nosniff, frame-ancestors/XFO, referrer, permissions policy, no `Server` header, correct caching on `/sw.js`, `/index.html`, `/assets/*`, `/api/*`). | Agent | ☐ | |
| 6.3 | **HSTS is emitted** on the real host (`max-age=86400`, no `includeSubDomains`, no `preload` unless the owner decides). Confirm it shows up through Cloudflare, not stripped or duplicated. | Both | ☐ | |
| 6.4 | HSTS ramp, only after each step has run clean in daily use: 86400 → 604800 → 2592000 → 31536000 by editing the Caddyfile comment value and recreating the proxy. `preload`/`includeSubDomains` are owner decisions. Dates of each step recorded here. | Owner | ☐ | |
| 6.5 | Browser console on the production origin during normal use shows **no CSP violations** (Cloudflare-injected scripts would show up here) and no Permissions-Policy violations (camera must stay allowed). | Both | ☐ | |
| 6.6 | Auth cookies are `Secure`, `HttpOnly`, correct `SameSite`, scoped to the host. | Agent | ☐ | |

## 7. Real phone acceptance (Phone — physical device, production URL)

The phone currently used for development has the app installed from `http://localhost` through a USB proxy: that is
a **different origin** and does not count. Remove it, then install fresh from the production hostname.

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 7.1 | Open `https://app.<domain>` on the phone **on mobile data** (not the client's Wi-Fi); HTTPS valid; login works. | Phone | ☐ | |
| 7.2 | Header shows **Offline ready** after the first load; reopen once; add to home screen (WebAPK); standalone launch works. | Phone | ☐ | |
| 7.3 | Airplane mode + **force-close** + launch from the home screen: the app opens, every input accepts typing, dropdowns/date controls work, local validation works. | Phone | ☐ | |
| 7.4 | Offline: save a draft; submit a record → **Pending**; type in a field and the autosave line reports "Autosaved on this device". | Phone | ☐ | |
| 7.5 | Force-close and reopen offline: draft and pending record still there. | Phone | ☐ | |
| 7.6 | Reconnect (mobile data): the record syncs by itself (≤ ~60 s) → **Synced**; **exactly one** matching server record (check by the client UUID); retry/duplicate taps create no second record. | Phone | ☐ | |
| 7.7 | Real camera capture over HTTPS (permission prompt, capture, "Photo saved on this device", sync); the **largest allowed photo** uploads through Cloudflare (1.6); gallery picker works; Final Report web view and PDF download work. | Phone | ☐ | |
| 7.8 | Sign out with an unsynced item shows the warning; sign back in and it syncs; a second user on the same phone sees none of the first user's data. | Phone | ☐ | |
| 7.9 | Server unreachable behaviour on production: stop the API container (`docker compose stop api`), reload the PWA → stays on the offline workspace (header **Offline**/**Server unreachable**, cached jobs, drafts open and autosave); start the API, **Reconnect** → Online. | Both | ☐ | |
| 7.10 | Run the phone UI audit once on production (`scripts/phone-testing/audit3.js` via CDP needs USB debugging, so on the dev phone only) or, on the client's phone, spot-check 360 px layout, 44 px targets and no horizontal scroll on Jobs, a form, Add Customer and the manager home. | Phone | ☐ | |

## 8. Access control and exposure (before inviting external users)

| # | Check | Who | Status | Evidence |
|---|-------|-----|--------|----------|
| 8.1 | Auth matrix against production with real test accounts created for the purpose (`scripts/phone-testing/authmatrix.ps1`, credentials via `PWA_*` environment variables only, never stored): unauthenticated → 401, wrong role → 403, other technician's job → 404/403, duplicate/stale writes → 409/idempotent. | Both | ☐ | |
| 8.2 | Destructive/admin routes (delete visit, archive, report approval/withdrawal, location proposals, manager config) require the right role. | Agent | ☐ | |
| 8.3 | Brute-force/lockout and password policy behave as configured; sessions expire and can be revoked (**revocation cannot be tested by an agent**; owner revokes a session and confirms the phone is signed out). | Owner | ☐ | |
| 8.4 | Reminder e-mails (if enabled) send from the production sender and respect the configured recipients; the worker container runs. | Owner | ☐ | |
| 8.5 | PostgreSQL private (see 2.4); firewall exposes nothing but the tunnel's outbound connection. | Owner | ☐ | |

## 9. Handover and sign-off

| # | Item | Who | Status | Evidence |
|---|------|-----|--------|----------|
| 9.1 | Operations runbook given to the client: start/stop (`docker compose --profile tunnel …`), where logs are, how to check health, how to restart after reboot, update procedure (publish flow), rollback procedure, who to call. | Owner | ☐ | |
| 9.2 | Test data created in section 3/7 archived or deleted; production holds only real data. | Owner | ☐ | |
| 9.3 | Backup schedule, restore drill date, off-site copy location and the person responsible are written down. | Owner | ☐ | |
| 9.4 | Domain/Cloudflare renewal dates and account recovery e-mail recorded with the client. | Owner | ☐ | |
| 9.5 | Known limitations explained to the client: Cloudflare Tunnel has no SLA; the PC must stay on and awake; new visits need a connection (field staff prepare jobs while online); cross-tab sync and some browser lifecycle cases cannot be machine-tested. | Owner | ☐ | |
| 9.6 | Final register review: nothing P0/P1 open; remaining P2/P3 listed with owners. Update `PHONE_TESTING_STATUS.md` (matrix + "Last updated") and tag the accepted release. | Both | ☐ | |

### Sign-off

| Role | Name | Date | Result (accepted / accepted with listed P2 / rejected) |
|------|------|------|----------|
| Operator (setup) | | | |
| Client (acceptance) | | | |
| Reviewer | | | |

---

## Known gaps carried into this checkpoint (from the phone-testing register)

- Real expired/revoked session, cross-tab sync and the `beforeunload` prompt on a phone cannot be machine-tested
  (8.3 and 7.x are manual).
- The "Server unreachable" label was only seen in the browser spec for the compact header; 7.9 should capture it
  on the phone if it appears (the cached-identity state shows **Offline**).
- Corrected-copy was phone-checked on every evidence system through the UI with a locally set Failed state; a real
  server rejection was reproduced on Fire Intercom, Smoke Ventilation and CO2 only.
- Server housekeeping for never-accepted staged evidence of superseded records is not implemented (design decision
  pending).
- Four old test harnesses are not wired into specs (`fire-alarm-local-and-resolution.html`,
  `hydrant-reload-routing.html`, `hydrant-verified-revalidation.html`, `hydrant-draft-form.html`).

## What an agent may and may not do here

- May: read-only checks, `check-security-headers.mjs --url`, header/curl checks, Playwright and Node suites,
  disposable-Postgres tests, drive the dev phone over USB, prepare evidence tables.
- Needs the owner: anything on the client PC, Cloudflare/DNS/router, secrets, Windows settings, real accounts,
  production data, restoring backups over live data.
- Never: touch the production database, run Compose against production without being asked, print or store
  credentials, or mark a row done that was not actually performed.
