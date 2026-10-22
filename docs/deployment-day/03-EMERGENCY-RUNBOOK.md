# 3. Emergency runbook (developer / IT, keep open on deploy day)

All commands: PowerShell on the client PC, in `C:\InspectionSystem\app`, Docker Desktop running.
Tunnel route: always include `--profile tunnel` on `up`, `ps`, `stop`.

## 0. Golden rules when something breaks

1. **Never** run `docker compose down -v`, `docker volume rm`, `docker system prune --volumes`, or delete
   `C:\InspectionSystem\runtime`. They destroy the database or the photos.
2. **Back up before you fix**, once real data exists: `.\scripts\Backup-All.ps1`.
3. Read the log of the failing service before changing anything: `docker compose logs <service> --tail=100`.
4. Change one thing at a time; re-check after each change.
5. Never paste `.env`, the tunnel token, passwords or `docker compose config` output (without `--quiet`) into
   chat, e-mail or a shared screen.
6. Phones keep unsynced work safely while the server is down. **Tell technicians not to clear app data or
   uninstall** while you fix the server. A server outage loses nothing on the phones.

## 1. Abort or continue?

| Situation | Decision |
|---|---|
| Docker/WSL cannot run on this PC (no virtualization, Windows Home too old, not enough RAM) | **Abort.** Nothing to undo. Re-plan with different hardware. The hostname stays down; do **not** re-point it to the dev PC once the client has used production. |
| Build or start fails and is not fixed within 30 min | **Abort for today:** `docker compose --profile tunnel stop`. Keep the folders and `.env`; next attempt continues from there. |
| Stack runs but an acceptance item fails (section E of 02) | Fix if small. If not: leave the system running, tell the client **not to start real work yet**, write the item down, fix it in a follow-up session. |
| Real data was already entered and then something breaks | **Never abort by deleting.** Back up, then fix forward or roll back (section 6). |

Before the client starts real work, the dev PC can still serve demos **only** by re-adding the hostname to a
dev tunnel. Do not do this after go-live: two servers would split the data.

## 2. Quick health commands

```powershell
docker compose --profile tunnel ps                       # what is running / healthy
docker compose logs api --tail=100                       # migrations, sign-in, sync errors
docker compose logs cloudflared --tail=50                # tunnel connected?
docker compose logs proxy --tail=50
docker compose logs reminder-worker --tail=50
# API health without the internet (tunnel mode: Caddy only answers for the real hostname)
curl.exe -s -H "Host: app.mfets.com" http://localhost/api/health
# API health through the internet
.\scripts\Health-Check.ps1 -BaseUrl https://app.mfets.com -StrictCertificateCheck
# Disk space
Get-PSDrive C | Select-Object Used, Free
```

Healthy means: postgres `(healthy)`, the others `Up`, health returns `{"status":"ok","service":"inspection-api",...}`.

## 3. Symptom → cause → fix

### Installing and starting

| Symptom | Likely cause | Fix |
|---|---|---|
| Docker Desktop: "WSL 2 installation is incomplete" / "Virtualization not enabled" | WSL or BIOS virtualization off | `wsl --install` in an admin PowerShell, reboot. Enable Intel VT-x / AMD-V (SVM) in BIOS (client at the PC). |
| `docker` not found / "cannot connect to the Docker daemon" | Docker Desktop not running yet | Start Docker Desktop, wait for **Engine running**, retry. |
| Build fails at `npm ci` / `pull access denied` / timeouts | Internet, proxy or DNS on the client network; Docker Hub rate limit | Retry once. `docker login` with any free Docker Hub account lifts the rate limit. Check the PC can open `https://registry.npmjs.org`. |
| Build fails "no space left on device" | Disk full | Free space on C:. `docker builder prune` (safe: build cache only). **Not** `system prune --volumes`. |
| `proxy` exits: "port is already allocated" / "bind: address already in use" on 80 or 443 | Another program uses the port (IIS, another web server, Skype, a VPN tool) | Find it: `Get-NetTCPConnection -LocalPort 80,443 -State Listen \| Select LocalPort, OwningProcess`, then `Get-Process -Id <pid>`. Stop/disable it, **or** (tunnel route only, which needs no host ports) create `docker-compose.override.yml` next to `docker-compose.yml` containing:<br>`services:`<br>`  proxy:`<br>`    ports: !reset []`<br>then `up -d` again. Local checks then only work through the public URL. |
| `postgres` not healthy / restarting | Corrupt first init, disk full | `docker compose logs postgres --tail=100`. On a **fresh** install with no real data only: `docker compose --profile tunnel down` then `docker volume rm inspection_pwa_postgres_data` and start again. Never on a system with real data. |
| `api` keeps restarting; log says `password authentication failed for user` | `.env` password changed **after** the database volume was first created (Postgres keeps the first password) | Put the original password back in `.env` (both `POSTGRES_PASSWORD` and `DATABASE_URL`). On a fresh install with no data, alternatively reset the volume as in the row above. |
| `api` restarting; log shows a migration error | Migration failed on this database | Stop: `docker compose stop api reminder-worker`. Copy the error text. Do not edit the database by hand. On first install: report it to development, abort for today. On an update: roll back (section 6). |
| `cloudflared` exits immediately | Token empty or wrong | `docker compose logs cloudflared`. Re-copy the token from Zero Trust → Tunnels → the tunnel → Configure, update `.env`, `docker compose --profile tunnel up -d cloudflared`. |
| `cloudflared` not in `ps` at all | Started without `--profile tunnel` | `docker compose --profile tunnel up -d` |

### Reaching the site

| Symptom | Likely cause | Fix |
|---|---|---|
| Cloudflare **Error 1033** | No connector for this hostname | `cloudflared` not running, or the hostname is on a different (old) tunnel. Check Zero Trust → Tunnels: the client tunnel shows **HEALTHY** and lists `app.mfets.com`. |
| Cloudflare **502 Bad Gateway** | Tunnel up, but the service URL is wrong or `proxy` is down | Public hostname must be **HTTP** + **`proxy:80`** (not `localhost`, not `https`). `docker compose ps` proxy `Up`. |
| Browser: "too many redirects" | `.env` `PUBLIC_HOSTNAME` lacks `http://` | Set `PUBLIC_HOSTNAME=http://app.mfets.com`, then `docker compose --profile tunnel up -d proxy`. |
| Blank white page, console shows "Refused to execute script" (CSP) | Cloudflare injects scripts (Rocket Loader, Analytics, Email Obfuscation) | Turn those off for the hostname, purge the Cloudflare cache, reload. |
| Site works on office Wi-Fi only / not at all from outside | Testing via LAN IP, not the hostname; or DNS not updated yet | Always test `https://app.mfets.com` from mobile data. DNS changes can take a few minutes. |
| `api/health` OK but sign-in says "server unreachable" | `api` restarting, or proxy cannot reach it | `docker compose logs api`; `docker compose restart api`. |
| Manager → Customers shows customers on a brand-new install | An old commit was built | `RELEASE.txt` must name the release you published. `git pull` on `client-release`, then `docker compose --profile tunnel up -d --build`. If real data was entered, ask development before any clean-up. |

### Accounts

| Symptom | Fix |
|---|---|
| Nobody can sign in on a new install | No accounts yet: `docker compose exec api node dist/cli/createAdmin.js <username>` |
| Manager forgot password | `docker compose exec api node dist/cli/resetAdminPassword.js <username>` (no `-T`) |
| Manager username forgotten | [IT guide 2.4](../it-guide/02-accounts.md#24-find-manager-usernames) |
| Technician/Admin forgot password, or was deactivated by mistake | Manager → Technician List → **Set new password** / **Reactivate** |
| "This signed-in account does not have Manager access" | Wrong sign-in card for that account. Pick the card that matches the role. |

### Phones and sync

| Symptom | Fix |
|---|---|
| Phone stuck on "Preparing offline use" | Must be online on `https://app.mfets.com` (not an IP address). Tap **Refresh**, wait. |
| "Sync needs attention" after the server was down | Server back up → tap **Sync Now**. Nothing is lost; records stay Pending/Failed on the phone until the server confirms them. |
| Old version on a phone after an update | Close and reopen the app; it offers **Update now**. If still old after a day, check the Cloudflare cache rule bypasses `/sw.js`. |
| Camera does not open | Permission denied earlier: Chrome → Site settings → `app.mfets.com` → Camera → Allow. Fallback link "Camera not working? Upload from gallery". |
| A phone was lost/stolen | Manager → Technician List → **Set new password** for that person (signs out every device). Unsynced work on that phone is lost with it. |

### After go-live

| Symptom | Fix |
|---|---|
| Site down after a power cut / Windows Update | Someone must **sign in to Windows** (unless Autologon). Wait for Docker Desktop **Engine running**, then `docker compose --profile tunnel ps`. If containers are `Exited`: `docker compose --profile tunnel up -d`. |
| Backup task failed (`backup-log.txt` says BACKUP FAILED) | Read the reason on that line. Off-PC drive unplugged → plug in, run `.\scripts\Backup-All.ps1 -CopyTo <path>` by hand. "Could not resolve POSTGRES_USER" → Docker or postgres was down at backup time. |
| Disk nearly full | Lower `-KeepDays` in the backup task, move old off-PC sets, check `C:\InspectionSystem\runtime\logs`. Never delete files in `uploads`. |
| Reminder e-mails failing | Manager → Settings → Email reminders → delivery status. Gmail app password revoked/changed → enter the new one. Outbound port 587 blocked by the network → ask whoever runs the router. |
| Secret exposed (tunnel token shown on screen, `.env` sent somewhere) | Tunnel: Zero Trust → the tunnel → **Refresh token**, put the new one in `.env`, `docker compose --profile tunnel up -d cloudflared`. Manager password: reset it. Database password: the database is not reachable from outside, but rotate it with development's help at the next visit. |

## 4. Wrong build running

```powershell
Get-Content RELEASE.txt          # which release this PC has
git status                       # clean, on client-release
git pull                         # latest published release
docker compose --profile tunnel up -d --build
```

## 5. Update procedure (later releases)

1. Technicians sync everything (header **All submitted changes synced**).
2. `.\scripts\Backup-All.ps1 -CopyTo <off-PC path>` → must say **Backup finished OK**.
3. Write down the current release: `Get-Content RELEASE.txt` and `git log -1 --format=%H`.
4. On your PC: tag and publish (`Publish-ClientRelease.ps1 -Ref release-<new> -Push`). On the client PC: `git pull`;
   compare `.env` with `.env.example` for new settings.
5. `docker compose --profile tunnel up -d --build`; check `ps`, `logs api`, health, sign in on each role.
6. Phones get the new app in the background and show **Update now**.

## 6. Rolling back

| What went wrong | Roll back |
|---|---|
| Only the web app looks broken (API and data fine) | Web-only rollback to the previous retained release: runbook [06 "Immediate rollback"](../architecture/06-deployment-runbook.md#immediate-rollback) (`INSPECTION_WEB_ACTIVE_RELEASE`). Touches no data. |
| New API version misbehaves, **no new migration** in the release | `git checkout client/release-<previous>` (or the previous commit on `client-release`), `docker compose --profile tunnel up -d --build`; return later with `git checkout client-release`. |
| A new **migration** ran and must be undone | Migrations only move forward. Restore the database from the backup taken in step 2 of section 5: stop `api` and `reminder-worker`, then follow [IT guide 3.5](../it-guide/03-backup-and-recovery.md#35-rebuild-after-the-pc-dies-or-restore-a-damaged-database) steps 4–6 on the existing install, then check out the previous release and rebuild. Work synced after the backup must be re-synced from phones (unsynced phone records re-send on their own; already-synced ones are lost from the server). Do this with development on the call. |

## 7. Escalation

Developer: **[FILL IN name, phone, hours]**. Send: what you did, the exact error text, the output of
`docker compose --profile tunnel ps`, the last 100 lines of the failing service's log, the **Support build** shown
in the app, and a visit reference if relevant. Never send passwords, `.env`, the tunnel token or the e-mail key.
