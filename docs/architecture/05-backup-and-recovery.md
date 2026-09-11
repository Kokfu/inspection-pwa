# Backup and Recovery

## Backup Rule

Use `pg_dump`, `pg_dumpall`, WAL tooling, or another PostgreSQL-safe method. Never back up PostgreSQL by copying the active Docker volume files.

## Persistent Locations

Recommended runtime root:

```text
C:\InspectionSystem\runtime\
  uploads\
  logs\
  backups\
  restore-staging\
  operational\
```

PostgreSQL live data uses the `postgres_data` Docker named volume. Backup exports are written outside the live container under the runtime backup folder.

## Backup Scope

- PostgreSQL dump.
- Uploads folder.
- Attachment manifest with photo UUID, parent inspection UUID, safe relative
  path, source/stored SHA-256, and stored size.
- Backup manifest and checksums.
- Relevant app version/image tags.
- Restore notes.

## Verification

Every backup job should verify that output files exist, have non-trivial size, and have a manifest/checksum. Periodically restore into a separate test environment and verify expected tables, rows, and uploaded files.

Photo metadata and files form one recovery set. Use a shared backup timestamp
and application release ID for the PostgreSQL dump, uploads archive, and
attachment manifest. Verification must report database rows with missing
files, files without database rows, and hash/size mismatches. Accept a restore
only after these checks pass in a separate environment.

## Restore Outline

```text
Stop API writes
-> take pre-restore safety backup
-> stage selected backup
-> restore PostgreSQL dump
-> restore uploads
-> restart services
-> run health checks
-> verify sample data
```

## Implementation Status

`scripts/Backup-Database.ps1` and `scripts/Backup-Uploads.ps1` write a manifest
(source file name, SHA-256, size, and — for uploads — file count) next to each
backup, using the shared backup timestamp. `scripts/Verify-Backup.ps1` checks
that manifest/checksum, not just file presence and size. `scripts/Restore-Database.ps1`
and `scripts/Restore-Uploads.ps1` verify the manifest checksum before restoring;
the database restore defaults to a disposable test Postgres container (never
the runtime container) and the uploads restore defaults to a staging path
(never the live uploads bind mount) — either requires an explicit
non-default parameter, with a loud warning, to target anything else.

This was proven end to end on 2026-09-11: real runtime `pg_dump`/uploads
backups, manifest verification, restore of the dump into a disposable
Postgres container, and restore of the uploads archive into
`restore-staging\uploads`, with row counts, a sample query, and file
checksums matching the runtime source and the runtime Postgres/uploads
confirmed untouched throughout.

Still outstanding for this doc's full scope: the richer per-attachment
manifest (photo UUID, parent inspection UUID, safe relative path,
source/stored SHA-256, stored size, cross-referenced against
`inspection_attachments` rows) is not yet implemented — the current uploads
manifest is archive-level only. Retention and off-device copy remain a
client decision as below.

## Retention and Off-Device Copy

Retention is a client decision. A starting policy is daily for 14 days, weekly for 8 weeks, and monthly for 12 months.

Backups must be copied off-device or to removable/encrypted storage so a PC or disk failure does not destroy all recoverable data.

## Retention and Off-Device Copy — Recommended Default (pending client sign-off)

Nothing in `scripts/` currently enforces or automates retention or off-device copy. `Backup-Database.ps1`
and `Backup-Uploads.ps1` write a new timestamped backup and manifest on every run and never delete,
move, or copy an older one anywhere — there is no pruning script, no scheduled task, and no
off-device sync of any kind in this repo today. Every backup ever taken accumulates indefinitely
in `C:\InspectionSystem\runtime\backups\...` on the same physical PC as the live data, until
someone manually prunes or copies it elsewhere.

This means the starting policy above (daily 14d / weekly 8w / monthly 12mo) is a **suggestion only**,
not an implemented or client-approved policy. It remains manual and undone until the client makes
the decision and the automation gets built as separate, client-gated work — that build is out of
scope for this task.
