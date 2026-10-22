# 1. Running the System

For the support person / IT. All commands are **PowerShell**, run in `C:\InspectionSystem\app` (the folder with
`docker-compose.yml`), with Docker Desktop showing **Engine running**. This installation uses the Cloudflare
Tunnel, so include `--profile tunnel` on `up`, `ps` and `stop`.

## 1.1 What runs

| Service | Purpose | Reachable from outside? |
|---|---|---|
| `proxy` (Caddy) | Serves the web app and passes `/api` to the API | Only through the tunnel (also on the PC's own ports 80/443 on the LAN) |
| `api` | Accounts, sync, approvals, reports and PDFs | No |
| `reminder-worker` | Sends reminder e-mails (checks every 15 minutes) | No (outbound to Gmail only) |
| `postgres` | The database | **Never** |
| `cloudflared` | Cloudflare Tunnel connector (outbound only) | Outbound only |

## 1.2 Where things are kept

| What | Location | In the daily backup? |
|---|---|---|
| Database | Docker volume `inspection_pwa_postgres_data` | Yes (`Backup-All.ps1`) |
| Photos | `C:\InspectionSystem\runtime\uploads` | Yes |
| Letterhead, uploaded logo, e-mail encryption key | `C:\InspectionSystem\runtime\operational\` | Yes |
| Backups | `C:\InspectionSystem\runtime\backups\` (+ the off-PC place) | n/a |
| Logs | `C:\InspectionSystem\runtime\logs\api`, `...\logs\proxy`, `backups\backup-log.txt` | No |
| Web app versions (current and previous) | `C:\InspectionSystem\runtime\releases` | No (rebuilt from the code) |
| Secrets and settings | `C:\InspectionSystem\app\.env` | **No. A copy is kept in the client's password manager** |
| The application code | `C:\InspectionSystem\app` (branch `client-release`) | No (comes from the release repository) |

## 1.3 Start, stop, check

```powershell
docker compose --profile tunnel ps                     # all Up; postgres (healthy)
docker compose --profile tunnel up -d                  # start (also after a manual stop)
docker compose --profile tunnel stop                   # stop without deleting anything
docker compose logs api --tail=100
docker compose logs cloudflared --tail=50
docker compose logs reminder-worker --tail=50
curl.exe -s -H "Host: app.mfets.com" http://localhost/api/health      # local check, no internet needed
.\scripts\Health-Check.ps1 -BaseUrl https://app.mfets.com -StrictCertificateCheck   # through the internet
```

Healthy: `{"status":"ok","service":"inspection-api",...}`.

## 1.4 After a reboot or power cut

Docker Desktop starts only after Windows is signed in. After sign-in, wait for **Engine running**; the
containers restart by themselves (`restart: unless-stopped`). If any shows `Exited`:
`docker compose --profile tunnel up -d`.

## 1.5 Settings in `.env`

Edit `.env`, then `docker compose --profile tunnel up -d` to apply. Never put real values in `.env.example`, a
screenshot or chat, and never run `docker compose config` without `--quiet` on a shared screen (it prints the
secrets).

| Setting | Meaning |
|---|---|
| `PUBLIC_HOSTNAME` | `http://app.mfets.com` (the `http://` is required with the tunnel; without it the browser loops) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel token from Cloudflare Zero Trust → Networks → Tunnels |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Must match. Postgres keeps the password it was created with; do not change it casually |
| `SESSION_DURATION_HOURS` | How long a sign-in lasts (default 12) |
| `INSPECTION_*_PATH` | Runtime folders; keep the defaults under `C:\InspectionSystem\runtime` |

## 1.6 Installing an update

The PC tracks the `client-release` branch of the release repository, which contains only what the client needs.

1. Ask technicians to sync everything (**All submitted changes synced**).
2. `.\scripts\Backup-All.ps1 -CopyTo '<off-PC folder>'` → must end with **Backup finished OK**.
3. Note the current version: `git log -1 --format="%h %s"`.
4. Get the new version and rebuild:
   ```powershell
   git pull
   docker compose --profile tunnel up -d --build
   ```
5. `docker compose --profile tunnel ps`, `docker compose logs api --tail=50`, health check, then sign in as each
   role. Compare `.env` with `.env.example` for new settings.
6. Phones receive the new app in the background and show **Update now**.

Database changes (migrations) run automatically when the API starts and only move forward.

## 1.7 Rolling back

| Problem | Roll back |
|---|---|
| Only the web app looks wrong | Read the two retained IDs in `C:\InspectionSystem\runtime\releases\release-order`, then `$env:INSPECTION_WEB_ACTIVE_RELEASE = "sha256-<previous>"; docker compose up -d --no-deps --force-recreate proxy`. Remove the variable and recreate the proxy to return. No data is touched. |
| The new version misbehaves and added no database change | `git checkout <previous commit>` then `docker compose --profile tunnel up -d --build`; return with `git checkout client-release`. |
| A database change must be undone | Restore the backup taken before the update (chapter 3.5), then build the previous version. Work synced after the backup must be re-sent or re-entered. Do this with the developer. |

## 1.8 Never

- `docker compose down -v`, `docker volume rm`, `docker system prune --volumes`: they delete the database.
- Deleting anything under `C:\InspectionSystem\runtime`.
- Copying the live database files as a "backup" (use `Backup-All.ps1`).
- Publishing port 5432 or the API port.
- Running the stack on a second PC with the same tunnel token: Cloudflare would split traffic between two
  databases.
