# Backup and restore runbook

Operator-facing how-to for the five scripts in `scripts/`. For the design rationale (why a
manifest, why disposable-only restore targets) see `docs/architecture/05-backup-and-recovery.md`
and `docs/architecture/06-deployment-runbook.md`; this page is the day-to-day "what do I actually
type" version.

Everything here runs from the repository root (`docker-compose.yml` next to it) with the compose
stack up (`docker compose ps` shows `postgres` running) and PowerShell 5.1+.

## What gets backed up

Two independent artifacts, each with its own timestamped manifest:

- **Database** — `pg_dump` custom-format dump of the whole PostgreSQL database.
- **Uploads** — a zip of the uploads bind mount (inspection photos/attachments), built with
  `System.IO.Compression.ZipFile` directly (not `Compress-Archive`, which silently drops
  Hidden-attribute files and undercounts to match — see the script's own comments).

A complete recovery point needs both, taken close together, plus their manifests. Neither script
touches the other's files.

## Taking a backup

```powershell
.\scripts\Backup-Database.ps1
.\scripts\Backup-Uploads.ps1
```

Defaults write to `C:\InspectionSystem\runtime\backups\postgres\` and
`C:\InspectionSystem\runtime\backups\uploads\`. Each run produces two files:

```text
inspection-<yyyyMMdd-HHmmss>.dump
inspection-<yyyyMMdd-HHmmss>.manifest.json     # sha256, sizeBytes, createdAtUtc

uploads-<yyyyMMdd-HHmmss>.zip
uploads-<yyyyMMdd-HHmmss>.manifest.json        # sha256, sizeBytes, fileCount, createdAtUtc
```

`Backup-Database.ps1` resolves `POSTGRES_USER`/`POSTGRES_DB` from the **running container's own
environment** (`docker compose exec ... printenv`), not the host shell — Compose's `.env` file only
feeds substitution inside `docker-compose.yml`, it never populates this PowerShell process's
environment, so reading `$env:POSTGRES_USER` on the host would silently be empty. It dumps inside
the container first, then copies the exact bytes out with `docker compose cp` (piping the binary
dump through PowerShell `>` corrupts it — re-encoding and a prepended BOM). Every step's exit code
is checked; the container-local temp dump is only deleted after the host copy is confirmed to exist
and be non-empty, so a failed copy never destroys the only good copy.

Both scripts throw (non-zero exit) on any failure — a missing/empty output file, an unresolvable
credential, a failed `docker compose cp` — rather than silently producing a partial backup. Treat a
non-zero exit from either script as "no backup was taken," not "a backup with a warning."

## Verifying a backup

```powershell
.\scripts\Verify-Backup.ps1 -BackupPath <path-to-.dump-or-.zip>
```

Checks (in order): the backup file exists and is non-empty, its manifest exists, the manifest's
recorded file name and size match the actual file, and the actual file's SHA-256 matches the
manifest's recorded hash. A backup without a manifest, or one that fails any check, is refused —
"file is there" is not treated as "file is good." Run this on a schedule against the most recent
backup of each kind, and always before trusting a backup enough to restore from it (the restore
scripts below run this same checksum check themselves, so a corrupted backup is refused
automatically — this command is for a standalone health check).

## Restoring — disposable drill only

`Restore-Database.ps1` and `Restore-Uploads.ps1` are for **proving a backup restores correctly**,
not for pointing at production by default. Both:

1. Refuse to run at all without a matching, checksum-verified manifest next to the backup file.
2. Default to a target that can never be the live runtime — and refuse outright, with no override,
   if you ever explicitly aim them at the live runtime anyway.

### Database → disposable container

```powershell
.\scripts\Restore-Database.ps1 -BackupFile <path-to-.dump>
```

With no other flags this starts (or reuses, via `-UseExistingContainer`) a **throwaway** Postgres
container named `inspection-restore-drill` on `127.0.0.1:55432` — the same disposable-DB pattern
the test gate (`Test-ManagerScheduling.ps1`) already uses — copies the dump in, and runs
`pg_restore --clean --if-exists --no-owner`. The container is left running afterward so you can
query it; remove it when done:

```powershell
docker rm -f inspection-restore-drill
```

The live runtime container name (`inspection_pwa-postgres-1`) is hard-refused, and that refusal is
checked by canonical Docker container ID as well as by name — passing the runtime container's ID
(full or abbreviated) instead of its name does not bypass it. Any target other than the default
disposable one (a different container name, or `-UseExistingContainer`) requires
`-IAcknowledgeThisIsNotTheDisposableDrillTarget` and prints a loud warning — there is no way to
silently drift onto a real target.

### Uploads → disposable staging folder

```powershell
.\scripts\Restore-Uploads.ps1 -ArchiveFile <path-to-.zip>
```

With no other flags this extracts into `C:\InspectionSystem\runtime\restore-staging\uploads`, never
the live uploads bind mount. The live-mount guard resolves both the destination and the live path to
their canonical filesystem identity (via `GetFinalPathNameByHandle`, the same API Windows itself
uses to open a path for real I/O) before comparing, so an NTFS junction, a `subst`-mapped drive, or
an 8.3 short name aliasing the live path cannot slip past a lexical string check — and it blocks the
live root *and every subdirectory of it*, not just an exact match. Overwriting the real uploads
folder needs `-OverwriteLiveUploads` explicitly.

### Periodic restore-drill procedure

Run this against the most recent backup of each kind on a regular cadence (recommended: monthly, and
after any schema or upload-path change):

1. `Verify-Backup.ps1` on both the latest `.dump` and the latest `.zip`.
2. `Restore-Database.ps1 -BackupFile <latest .dump>` (defaults — disposable container, port 55432).
3. Query the restored container and compare row counts / a sample query against what you expect
   from the source data.
4. `Restore-Uploads.ps1 -ArchiveFile <latest .zip>` (defaults — staging folder).
5. Compare the extracted file count and a few file hashes against the source.
6. Tear down: `docker rm -f inspection-restore-drill`; delete the staging folder contents.

None of the above ever starts from, writes to, or reads the runtime Postgres container or the live
uploads bind mount — only the backup files it consumes.

## Restoring into production (real disaster recovery)

This is a deliberate, non-default, client/owner action — not something to run casually or as part
of routine verification:

1. Stop API writes (stop the `api` container or take the app offline for users).
2. Take a fresh pre-restore safety backup of the current (possibly damaged) state first, so the
   recovery attempt itself is reversible.
3. `Restore-Database.ps1 -BackupFile <chosen .dump> -UseExistingContainer -TargetContainerName inspection_pwa-postgres-1 ...` —
   **this exact form is refused by the script's own hard-coded runtime-container block; there is no
   flag that lets it target the live container.** A real production database restore must be done
   directly with `pg_restore`/`pg_dump` tooling against the running compose stack, following the
   outline in `docs/architecture/05-backup-and-recovery.md`'s "Restore Outline", by someone with
   hands-on access to the client host — not by pointing this repo's disposable-drill scripts at it.
4. `Restore-Uploads.ps1 -ArchiveFile <chosen .zip> -OverwriteLiveUploads` restores directly into the
   live uploads bind mount — read the warning it prints before confirming this is intended.
5. Restart services, run health checks, verify sample data, resume API writes.

## Scheduling backups

No scheduled task exists in this repo for either backup script today — creating one (Windows Task
Scheduler, daily) is a client/operator setup step, the same pattern as
`docs/operations/service-reminder-task-scheduler.md`'s email-reminder trigger:

- Trigger: Daily, off-hours.
- Action: `powershell.exe -NoProfile -File C:\PWA_OfflineRecordWebApp\scripts\Backup-Database.ps1`,
  and a second task for `Backup-Uploads.ps1`.
- Run whether or not a user is logged on.

**Retention and off-device copy are an explicit, undecided client policy**, not something either
script implements: every run writes a new timestamped backup and manifest and never deletes, moves,
or prunes an older one — see `docs/architecture/05-backup-and-recovery.md`'s "Retention and
Off-Device Copy" section for the suggested-but-not-yet-approved starting policy (daily 14d / weekly
8w / monthly 12mo) and the fact that nothing automates it yet.

## Troubleshooting

- **`Could not resolve POSTGRES_USER/POSTGRES_DB from the running postgres container`** — the
  `postgres` service in `docker-compose.yml` isn't running, or `-ComposeFile` points at the wrong
  file. `docker compose ps` should show it healthy first.
- **`Manifest file not found` / `Checksum mismatch`** — the restore/verify scripts refuse to proceed
  without a manifest that matches the actual file. Don't hand-edit a manifest to make this pass;
  re-run the backup instead.
- **`REFUSED: '<name>' is the live runtime PostgreSQL container`** — expected and correct if you
  passed (or resolved to, by ID) `inspection_pwa-postgres-1`. There is no override.
- **`REFUSED: destination ... resolves to or is contained within the live uploads bind mount`** —
  expected and correct unless you explicitly meant `-OverwriteLiveUploads` for a real production
  restore (see above).
- **`pg_restore exited with code <n>`** — always treated as a failure by this script, even though
  `--clean --if-exists` commonly produces warnings-shaped nonzero exits against a fresh target
  (objects that don't exist yet to drop). Read the actual `pg_restore` output above the error to
  tell a benign warning from a real failure before deciding the restore is unusable.

## What this runbook proves and what it doesn't

Proven end-to-end against disposable fixtures only (no runtime container, no Docker volume, no real
backup file, per this task's own constraint):

- `Backup-Database.ps1` against a disposable, freshly-seeded source Postgres container produces a
  valid dump + manifest; `Verify-Backup.ps1` passes against it.
- `Backup-Uploads.ps1` against a disposable uploads fixture (including a hidden file and a nested
  folder) produces a valid archive + manifest; `Verify-Backup.ps1` passes against it.
- `Restore-Uploads.ps1` extracts that archive into the default disposable staging path with every
  file byte-identical to the source (SHA-256 compared file-by-file, hidden file included).

**Not completed by this session:** running `Restore-Database.ps1` itself (the disposable-container
half — `docker run`/`pg_restore` into `inspection-restore-drill`) was blocked by this coding
session's own sandbox policy, independent of the script or the plan; it was not run. The script's
guard logic was read and reasoned through directly (forbidden-container check by canonical Docker ID,
checksum-before-restore, fail-on-nonzero-exit) but not exercised live in this session.

## OWNER CHECK

- Run `Restore-Database.ps1` yourself against a real backup file, confirming it starts
  `inspection-restore-drill` on `127.0.0.1:55432`, restores successfully, and that a sample query
  against the restored container matches the source data — this is the one half of the drill this
  session's sandbox could not execute (see above). Note this is not untested from scratch: a prior
  session already ran this exact script end-to-end against a real runtime backup on 2026-09-11 and
  again through two review rounds on 2026-09-12 (see `docs/architecture/06-deployment-runbook.md`'s
  Validation Checklist item 9 and its "Second review round" note) — this OWNER CHECK exists because
  *this* session's sandbox could not re-exercise it, not because the script has never been proven.
- The real client-host restore test: run this entire drill (or an actual production restore) on the
  client's physical Windows PC once it exists, not the developer machine.
- The admin handover session: walk the client/admin through taking a manual backup, verifying it,
  and where the files land, so they aren't discovering this runbook for the first time during a real
  incident.
