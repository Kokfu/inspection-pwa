# Deploy to the client PC — easy steps

> Status check done 2026-10-21 against branch `phase-8e-client-demo-polish`; updated 2026-10-22 (final review).
> Deploy-day sequence, cut-over from the dev PC and the emergency runbook: [`deployment-day/`](deployment-day/01-FINAL-REVIEW-AND-PRE-DEPLOY.md).
> Requirements checklist: [`requirements.txt`](../requirements.txt). Deep detail:
> [`client-install-and-public-access.md`](client-install-and-public-access.md),
> [`release/LEVEL3_CHECKLIST.md`](release/LEVEL3_CHECKLIST.md),
> [`architecture/06-deployment-runbook.md`](architecture/06-deployment-runbook.md).

## 1. Where the project stands

| Area | State |
|---|---|
| Features | Built and phone-tested on the **development** setup (USB phone, `http://localhost`). Open items are small and parked until the client reports them (`docs/remaining-work/`). |
| Automated tests | Final retest 2026-10-22 after fixes: API 794/794 (cold Postgres), web Node 743/744 (1 known flaky, FR-17, since fixed), Playwright 787 pass + 2 load flakes that pass alone, V7 live gate 2/2. |
| Production Docker stack | Compose file, Caddy, Cloudflare Tunnel service, backup/restore scripts all exist. |
| **Never done yet** | A real client-PC install, the client's tunnel pointing at that PC, a reboot of that PC, a restore drill there, the client's own phones. (Production HTTPS on a phone, install, camera, airplane mode and force-close were proven on `app.mfets.com` served from the dev PC, 2026-10-22.) |
| Migrations 057-059 | Additive and idempotent; run automatically on first start; untested on a large production database (a fresh client DB is small, so low risk). |
| Git | As of 2026-10-22 the branch is 185 commits ahead of `origin` and 338 ahead of `main` (fast-forward possible); only docs/scripts from the final review are uncommitted. Commit, push, fast-forward `main`, tag `release-YYYYMMDD` and push the tag before deploying. The old tag `release-20261009` is stale. |
| **Live on the dev PC** | `app.mfets.com` currently tunnels to the **dev PC**. Cut it over before the client PC connects, or traffic is split between two databases: [`deployment-day/02` §B](deployment-day/02-DEPLOY-DAY-CHECKLIST.md#b-cut-over-the-hostname-from-the-dev-pc-before-the-session). |

**Verdict:** safe to start a *pilot install* on the client PC. Do not call it "accepted" until section 8 is ticked on the real hostname.

## 2. Does the database start from zero?

**Yes. A new PC gets a new, empty Docker volume.** Nothing from your dev PC (customers, jobs, photos, users) travels with the code. On first start the API runs all 59 migrations (creates every table) by itself and then adds this built-in data:

| What | Count | Visible to client? |
|---|---|---|
| User accounts | **0**. Nobody can sign in until you create the first Manager (step 6). | — |
| Report templates V1–V7, evidence policies | needed by the app | Yes (this is the app's rule book) |
| Demo customers (`DEMO-…`) and sample jobs | ~10 | **No**. Flagged `is_demo` / `is_sample`; hidden from lists, reminders and technicians. |
| Visible customers | **0** | Production start (`server.ts`, `createAdmin`) no longer publishes "Mak Siti Products" and "Hokuden (Malaysia)". The Manager's customer list starts empty. |

Those two used to be seeded on every empty database. They are now skipped by the production entrypoints (`runMigrations(pool, { operationalCustomers: false })`); tests and development databases still get them. A database that already contains them (your dev PC) keeps them; the fix only affects a new empty database. Regression test: `apps/api/src/db/productionSeedNoCustomers.integration.test.ts`.

To start from zero **with your existing data** instead, restore a backup (`Restore-Database.ps1`, `Restore-Uploads.ps1`) rather than starting fresh.

## 3. Choose the route (decide once)

| | **A. Cloudflare Tunnel** (recommended) | **B. Direct hosting** |
|---|---|---|
| Needs | Domain on Cloudflare + free tunnel | Static public IP + router port-forward 80/443 |
| Router / ISP work | None | Yes |
| `.env` `PUBLIC_HOSTNAME` | `http://app.example.com` | `app.example.com` |
| Start command | `docker compose --profile tunnel up -d --build` | `docker compose up -d --build` |
| Trade-off | No uptime guarantee on Cloudflare free tier (client must accept) | Client must keep the static IP |

The rest of this guide shows route A; route B differences are marked **[B]**.

## 4. Before the visit (you, on the dev PC)

1. Commit everything, then tag: `git tag release-YYYYMMDD` (you run Git).
2. Confirm gates on that commit: `npm run typecheck` and `npm run build` in `apps/web` and `apps/api`.
3. Ask the client to create (in **their** names): the domain, the Cloudflare account, and a Gmail app password if they want reminder emails.
4. Publish the client release (client files only; developer files stay with you):
   `.\scripts\dev\Publish-ClientRelease.ps1 -Ref release-YYYYMMDD -Push` to the separate release repository,
   and prepare a read-only token for it. Details: [`deployment-day/01` §1.4–1.5](deployment-day/01-FINAL-REVIEW-AND-PRE-DEPLOY.md#14-what-reaches-the-client-and-what-stays-with-you).
5. Make sure every technician has synced all work on the *old* release if this replaces an existing install (see runbook "Slice A ownership upgrade precondition").

## 5. On the client PC — setup (about 60–90 minutes)

**Step 1 — Prepare Windows**
- Settings → Power: Sleep **Never**, Hibernate off. Windows Update → active hours outside work time.
- BIOS: "Restore on AC power loss" = On (ask the PC maker's manual).
- Router: give the PC a **DHCP reservation** (fixed LAN IP).

**Step 2 — Install Docker Desktop** (the only big install)
1. Install Docker Desktop; accept **WSL 2** when offered; reboot if asked.
2. Open it → Settings → General: tick **Start Docker Desktop when you sign in**.
3. Wait for "Engine running". Check in PowerShell: `docker --version` and `docker compose version`.

**Step 3 — Get the release**
```powershell
git clone --branch client-release --single-branch <release-repo-url> C:\InspectionSystem\app
cd C:\InspectionSystem\app
Get-Content RELEASE.txt   # names the release and its source commit
git status                # must say: nothing to commit, working tree clean
```
Keep the app in `C:\InspectionSystem\app` and the data in `C:\InspectionSystem\runtime` so they never mix.

**Step 4 — Create the Cloudflare Tunnel** (client's Cloudflare login)
1. Zero Trust → Networks → Tunnels → **Create tunnel** → name it after the client → copy the **token**.
2. Add a **public hostname**: `app.<domain>` → Service type **HTTP**, URL `proxy:80`.
3. Domain settings for that hostname: Rocket Loader **off**, Auto Minify **off**, Email Obfuscation **off**, Web Analytics beacon **off**, do not cache `/api/*`, `/sw.js`, `/index.html`.
   **[B]** skip steps 1–2; instead forward router TCP 80 and 443 to the PC and add the DNS A record.

**Step 5 — One command to make folders and `.env`**
```powershell
cd C:\InspectionSystem\app
.\scripts\Prepare-ClientPC.ps1 -Hostname app.<domain>
```
It creates all runtime folders, generates a strong database password, asks you to paste the tunnel token (hidden), and writes `.env` with the right `http://` prefix. It refuses to overwrite an existing `.env`. **[B]** add `-Mode direct`.

Then copy `.env` somewhere safe (password manager). Never email or commit it.

**Step 6 — First start**
```powershell
docker compose --profile tunnel config --quiet
docker compose --profile tunnel up -d --build
docker compose --profile tunnel ps
```
The first build downloads images and packages (10–20 minutes). All of `proxy`, `api`, `postgres` (healthy), `reminder-worker` and `cloudflared` should be "running". **[B]** drop `--profile tunnel`.

If something is wrong, read the logs of that service:
```powershell
docker compose logs api --tail=50
docker compose logs cloudflared --tail=50
```
Site loads but loops forever → `PUBLIC_HOSTNAME` is missing `http://` (tunnel route).

**Step 7 — Create the first Manager** (the system ships with no accounts)
```powershell
docker compose exec api node dist/cli/createAdmin.js manager-name
```
Type the password twice (12+ characters; nothing shows while typing). Do not add `-T`. Then open `https://app.<domain>`, choose the **Manager** card and sign in. Create Admin/Technician accounts in the app: **Technician List → Add**.

**Step 8 — Check the starter data.** Manager → Customers should be empty. If it lists any customer, the PC is running an old build: stop and rebuild from the tagged release.

**Step 9 — Optional: reminder emails.** Manager → Settings → Email reminders: enter the client's Gmail and app password. Test one message to an approved recipient.

## 6. Make it survive power cuts

1. Reboot the PC once. Without touching anything: Docker starts, then the containers (they restart themselves), then the site opens.
2. Confirm `docker compose --profile tunnel ps` shows everything running.
3. Write down who checks the site after each reboot or Windows Update.

## 7. Backups (do before real work is entered)

```powershell
.\scripts\Backup-All.ps1 -CopyTo '<off-PC folder>'
```
`Backup-All.ps1` backs up the database, the photos **and** `C:\InspectionSystem\runtime\operational\`
(letterhead, logo, email key; the two older scripts skip this folder), verifies each file, copies the set off the
PC and prunes local sets older than 14 days.
1. Schedule it daily in **Task Scheduler** (exact settings in [IT guide 3.2](it-guide/03-backup-and-recovery.md#32-the-daily-scheduled-task-set-up-once)).
2. Keep `.env` in the client's password manager (once, and after every change).
3. Do one restore test before go-live (`Restore-Database.ps1`, `Restore-Uploads.ps1`; [IT guide 3.4](it-guide/03-backup-and-recovery.md#34-restore-drill-every-3-months-never-touches-live-data)).

## 8. Acceptance test (from a phone **off** the client Wi-Fi)

Tick these on the real hostname; they are the still-open production gates:

- [ ] `.\scripts\Health-Check.ps1 -BaseUrl https://app.<domain> -StrictCertificateCheck` passes
- [ ] Sign in as Manager and as a Technician; wrong role card is refused
- [ ] Phone: install the PWA to the home screen; take a photo with the camera
- [ ] Airplane mode: type a form and save; force-close the app; reopen; data still there
- [ ] Reconnect: record syncs once (no duplicates)
- [ ] `docker compose restart postgres`, then `restart api`: data intact, no forced logout
- [ ] Full PC reboot recovers without manual steps
- [ ] Backup + restore drill passed
- [ ] Only the proxy is reachable from outside; port 5432 is not published

## 9. Updating later

```powershell
.\scripts\Backup-All.ps1 -CopyTo '<off-PC folder>'                  # always first
git pull                                                            # after you published release-<new>
docker compose --profile tunnel up -d --build
.\scripts\Health-Check.ps1 -BaseUrl https://app.<domain> -StrictCertificateCheck
```
Previous web versions are retained so installed phones update safely. Rollback: [IT guide 1.7](it-guide/01-running-the-system.md#17-rolling-back).

## 10. Never do

- `docker compose down -v` (deletes the database).
- Commit `.env`, tokens or passwords.
- Publish port 5432 or the API port.
- Clear browser storage / uninstall the PWA on a phone with unsynced work.
- Copy the live PostgreSQL volume files as a "backup" (use the scripts).

## 11. Quick answers

| Question | Answer |
|---|---|
| Does it need internet? | PC: yes (users sync through it; first build/updates). Phones: no for data entry; yes to sync. |
| Where is data stored? | Database: Docker volume `inspection_pwa_postgres_data`. Photos: `C:\InspectionSystem\runtime\uploads`. Letterhead, logo, e-mail key: `C:\InspectionSystem\runtime\operational`. |
| Who can sign in at first? | Nobody until step 7. |
| Forgot Manager password? | `docker compose exec api node dist/cli/resetAdminPassword.js <name>` on the PC. |
