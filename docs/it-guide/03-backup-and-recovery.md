# 3. Backup and Recovery

## 3.1 What one backup set contains

`scripts\Backup-All.ps1` writes three files, each with a `.manifest.json` (SHA-256 fingerprint):

| File (under `C:\InspectionSystem\runtime\backups\`) | Contains |
|---|---|
| `postgres\inspection-<date>-<time>.dump` | The whole database (`pg_dump` custom format) |
| `uploads\uploads-<date>-<time>.zip` | Every photo and uploaded file |
| `operational\operational-<date>-<time>.zip` | `company-profile.json`, the uploaded logo, `service-due-email.key` |

It verifies each file against its manifest, copies the set to the off-PC folder (`-CopyTo`) and verifies the
copies, deletes local sets older than `-KeepDays` (default 14, always keeping the newest `-KeepAtLeast` 3, and
never touching the off-PC folder), appends to `backups\backup-log.txt`, and exits 1 on any failure.

Keep a copy of `.env` in the client's password manager as well (once, and after every change).

## 3.2 The daily scheduled task (set up once)

1. Test by hand:
   ```powershell
   cd C:\InspectionSystem\app
   .\scripts\Backup-All.ps1 -CopyTo 'E:\InspectionBackups'
   ```
   The last line must be **Backup finished OK**.
2. Task Scheduler → **Create Task…**:

| Tab | Setting |
|---|---|
| General | Name `Inspection PWA daily backup`. User: the Windows account that runs Docker Desktop. **Run only when user is logged on** (Docker Desktop runs in that session). |
| Triggers | Daily, at a time the PC is on and signed in (e.g. 18:30) |
| Actions | Program `powershell.exe` · Arguments `-NoProfile -ExecutionPolicy Bypass -File "C:\InspectionSystem\app\scripts\Backup-All.ps1" -CopyTo "E:\InspectionBackups"` · Start in `C:\InspectionSystem\app` |
| Conditions | Untick **Start the task only if the computer is on AC power** |
| Settings | Tick **Run task as soon as possible after a scheduled start is missed**; stop if it runs longer than 2 hours |

3. Right-click the task → **Run**. **Last Run Result** must be `(0x0)` and the log must get a new
   **Backup finished OK** line. `(0x1)` = failed; the reason is the last line of `backup-log.txt`.

Off-PC place options: a cloud-synced folder the client owns (file history included), two BitLocker-encrypted
USB drives swapped weekly, or a NAS share the Windows account can write to.

## 3.3 Retention

On the PC: 14 days (automatic). Off-PC: last 14 daily sets plus the first set of each month for 12 months, pruned
by hand monthly. Each set includes all photos, so sets grow; check sizes and free disk space monthly.

## 3.4 Restore drill (every 3 months; never touches live data)

```powershell
cd C:\InspectionSystem\app
$dump = (Get-ChildItem C:\InspectionSystem\runtime\backups\postgres\*.dump | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
.\scripts\Restore-Database.ps1 -BackupFile $dump
docker exec inspection-restore-drill psql -U inspection_app -d inspection -c "SELECT count(*) AS users FROM users;"
docker exec inspection-restore-drill psql -U inspection_app -d inspection -c "SELECT count(*) AS visits FROM inspection_jobs;"
docker rm -f inspection-restore-drill
$zip = (Get-ChildItem C:\InspectionSystem\runtime\backups\uploads\*.zip | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
.\scripts\Restore-Uploads.ps1 -ArchiveFile $zip
```

The counts should match the app. Photos land in `C:\InspectionSystem\runtime\restore-staging\uploads`; open a
few, then delete that folder. Record the result in the Handover Forms (restore test log).

## 3.5 Rebuild after the PC dies, or restore a damaged database

Do this with the developer. Expect 2–3 hours on a new PC, mostly Docker installation.

1. Tell technicians **not to clear app data or uninstall**; unsent work waits on the phones.
2. **New PC:** install as on the first day (Docker Desktop, the code from the `client-release` branch,
   `Prepare-ClientPC.ps1`). In Cloudflare, give the new PC the tunnel and make sure the old PC can never
   reconnect. **Do not start the system yet.**
   **Existing PC with a damaged database:** `docker compose stop api reminder-worker`, then take a safety
   backup: `.\scripts\Backup-All.ps1`.
3. Copy the newest complete set from the off-PC place to `C:\InspectionSystem\restore-from\` and verify it:
   ```powershell
   Get-ChildItem C:\InspectionSystem\restore-from -Recurse -Include *.dump,*.zip | ForEach-Object { .\scripts\Verify-Backup.ps1 -BackupPath $_.FullName }
   ```
4. Put back the operational folder and the photos (new PC: these folders are empty):
   ```powershell
   Expand-Archive C:\InspectionSystem\restore-from\operational\operational-<date-time>.zip -DestinationPath C:\InspectionSystem\runtime\operational -Force
   Expand-Archive C:\InspectionSystem\restore-from\uploads\uploads-<date-time>.zip -DestinationPath C:\InspectionSystem\runtime\uploads -Force
   ```
5. Replace the database with the backup:
   ```powershell
   docker compose up -d postgres
   docker compose ps postgres                       # wait for (healthy)
   docker compose cp C:\InspectionSystem\restore-from\postgres\inspection-<date-time>.dump postgres:/tmp/restore.dump
   docker compose exec -T postgres dropdb -U inspection_app --force inspection
   docker compose exec -T postgres createdb -U inspection_app inspection
   docker compose exec -T postgres pg_restore -U inspection_app -d inspection --no-owner --exit-on-error /tmp/restore.dump
   docker compose exec -T postgres rm /tmp/restore.dump
   ```
6. `docker compose --profile tunnel up -d --build`, then check: a Manager can sign in; customers and visits are
   there; a recent visit shows its photos; a PDF has the right letterhead and logo.
7. Work synced **after** the backup must be re-entered; work still waiting on phones uploads by itself.
8. Run `Backup-All.ps1` and confirm the scheduled task works on this PC.

Step 5 was rehearsed on a throwaway database on 2026-10-22 (restore with no error; user and visit counts matched
the backup). Do the full sequence once on a spare PC as the first drill.

## 3.6 Never

- Never copy the live database files as a backup.
- Never keep the only backup on the same PC.
- Never e-mail a backup or put it in a chat: it holds all customer data and the e-mail key.
