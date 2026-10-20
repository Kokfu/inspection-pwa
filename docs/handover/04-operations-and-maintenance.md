# 4. Operations and Maintenance (office PC)

For the person who looks after the PC that runs the system. All commands are PowerShell, run from the
**project folder** (the one containing `docker-compose.yml`) unless stated. Docker Desktop must be
running first.

## 4.1 What is running

Docker Compose runs these services on the office PC:

| Service | Purpose | Exposed to the internet? |
|---|---|---|
| `proxy` (Caddy) | Serves the web app and forwards `/api` to the API. Handles HTTPS | Yes: ports 80 and 443 (or via the tunnel) |
| `api` | Node.js server: accounts, sync, approvals, reports and PDFs | No |
| `reminder-worker` | Sends email reminders every 15 minutes check | No (outbound to Gmail only) |
| `postgres` | The database | **Never** |
| `cloudflared` (optional, profile `tunnel`) | Cloudflare Tunnel connector | Outbound only |

## 4.2 Where things are stored

| What | Location | Backed up by scripts? |
|---|---|---|
| Database | Docker named volume `postgres_data` | Yes: `Backup-Database.ps1` |
| Photos | `C:\InspectionSystem\runtime\uploads` | Yes: `Backup-Uploads.ps1` |
| Email encryption key | `C:\InspectionSystem\runtime\operational\service-due-email.key` | **No. Back up by hand, encrypted** |
| Logs | `C:\InspectionSystem\runtime\logs\api`, `...\logs\proxy` | No |
| Backups | `C:\InspectionSystem\runtime\backups\postgres` and `...\uploads` | n/a |
| Web releases (current and previous) | `C:\InspectionSystem\runtime\releases` | No |
| Secrets and settings | `.env` in the project folder (never in Git) | **No. Keep a secure copy** |

Paths are configurable in `.env` (`INSPECTION_*_PATH`). **[FILL IN: confirmed paths on the client PC]**

**Never run `docker compose down -v`** on the live system. The `-v` deletes the database volume.

## 4.3 Start, stop, check

```powershell
.\scripts\Start-System.ps1                       # start (direct hosting)
.\scripts\Start-System.ps1 -ComposeProfile tunnel # start (Cloudflare Tunnel hosting)
docker compose ps                                 # all services should be running; postgres healthy
.\scripts\Health-Check.ps1 -BaseUrl https://your-domain -StrictCertificateCheck
.\scripts\Stop-System.ps1                         # stop without deleting data
```

Health check prints the API's `/api/health` answer. A healthy API alone does not prove external HTTPS
access or Gmail delivery; test from a phone **off** the office Wi-Fi.

Look at logs when something is wrong:

```powershell
docker compose logs api --tail=100
docker compose logs reminder-worker --tail=50
docker compose logs proxy --tail=50
docker compose logs cloudflared --tail=50   # tunnel hosting only
```

## 4.4 Keep the PC dependable

- Set Docker Desktop to start with Windows, and keep the PC awake and powered during working hours and
  at 09:00 daily (reminder time). Disable sleep and hibernation.
- Fit a UPS if power is unreliable.
- After Windows Update, a reboot or a power cut: wait for Docker Desktop, run `docker compose ps`,
  then sign in to the app to confirm. Containers use `restart: unless-stopped` and should come back on
  their own.
- Keep at least 20% free disk space. Photos grow every day.

## 4.5 Backups

A recovery point needs **three** things, kept together and copied off the PC:

1. Database dump + its manifest (`.dump` and `.manifest.json`)
2. Photos zip + its manifest (`.zip` and `.manifest.json`)
3. The email key file (`service-due-email.key`), stored encrypted and separate

```powershell
.\scripts\Backup-Database.ps1
.\scripts\Backup-Uploads.ps1
.\scripts\Verify-Backup.ps1 -BackupPath '<path to the .dump>'
.\scripts\Verify-Backup.ps1 -BackupPath '<path to the .zip>'
```

A script that errors means **no backup was taken**. The scripts do not delete old backups and do not
run on a schedule. Setting a schedule (Windows Task Scheduler), a retention rule and an off-PC copy
(external disk or cloud storage the client owns) is part of the setup, not automatic.
**[FILL IN: schedule, retention, off-PC location, responsible person]**

Restore scripts (`Restore-Database.ps1`, `Restore-Uploads.ps1`) are for **proving** a backup works in a
throwaway container, and refuse to touch the live system. A real production restore is a manual,
hands-on procedure by someone who knows what they are doing: see
[docs/architecture/05-backup-and-recovery.md](../architecture/05-backup-and-recovery.md) and
[docs/operations/backup-and-restore.md](../operations/backup-and-restore.md). Rehearse it once before go-live.

Restoring the database requires the **same** email key, or the saved Gmail app password cannot be
decrypted and must be re-entered.

## 4.6 Updating the system

`scripts/Update-System.ps1` is only a skeleton (it prints the checklist and validates the Compose file).
There is no one-click updater. The intended order is:

1. Ask technicians to sync all work. Take both backups and verify them.
2. Obtain the new release of the source as a clean, reviewed version (a GitHub clone/download is source
   only, not an image).
3. Review `.env` against `.env.example` for new settings.
4. `docker compose up -d --build` (add `--profile tunnel` if used). The API runs database migrations
   at startup. Migrations only move forward: there is no automatic downgrade.
5. `docker compose ps`, `docker compose logs api --tail=50`, health check, then sign in and open one
   visit on each role.
6. Phones receive the new app in the background and offer **Update now** on a safe screen.
7. To roll back the web app only, set `INSPECTION_WEB_ACTIVE_RELEASE` to the retained previous release ID
   (see [docs/architecture/06-deployment-runbook.md](../architecture/06-deployment-runbook.md), "Immediate
   rollback"). A database change cannot be rolled back this way; restore from backup if a migration is the problem.

## 4.7 Changing `.env` values

Edit `.env`, then restart the affected services (`docker compose up -d`). Items an owner may need:

| Setting | Meaning |
|---|---|
| `PUBLIC_HOSTNAME` | Domain. Bare (`app.example.com`) for direct hosting; with `http://` for Cloudflare Tunnel |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel token (tunnel hosting only) |
| `POSTGRES_PASSWORD` and `DATABASE_URL` | Must match. Change both together and expect to recreate the connection, not the data |
| `SESSION_DURATION_HOURS` | How long a sign-in lasts (default 12) |
| `INSPECTION_*_PATH` | Where uploads, logs, backups and releases live |

Never put real values in `.env.example`, Git, a screenshot or chat.

## 4.8 First installation and hosting

Follow [docs/client-install-and-public-access.md](../client-install-and-public-access.md). Summary:
install Docker Desktop (WSL 2), copy `.env.example` to `.env` and set unique secrets, create the
`C:\InspectionSystem\runtime\` folders, `docker compose up -d --build`, then **create the first Manager
account** with `createAdmin.js` ([file 01](01-accounts-and-access.md#12-create-a-new-manager-account)).
The client should own the domain, Cloudflare account and billing in their own name.

## 4.9 Routine checklist

| When | Check |
|---|---|
| Daily | PC on and awake; `docker compose ps` healthy; Email reminders → **Delivery status** for failed, uncertain or missed; a backup was taken |
| Weekly | Verify the latest backups; copy off the PC; check free disk space; confirm the email key copy is current |
| Monthly | Review accounts (deactivate leavers); review at least two Manager accounts exist; check Docker Desktop and Windows updates; check domain/Cloudflare renewal dates |
| Yearly | Domain renewal; full restore rehearsal; password review |

## 4.10 Who to call

**[FILL IN: support name, phone/email, office-PC custodian, escalation hours]**. When asking for help,
send the error text, the visit reference, the **Support build** on screen and the relevant log lines.
Never send passwords, `.env`, the tunnel token or the email key.
