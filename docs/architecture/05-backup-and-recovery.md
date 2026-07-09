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
- Backup manifest and checksums.
- Relevant app version/image tags.
- Restore notes.

## Verification

Every backup job should verify that output files exist, have non-trivial size, and have a manifest/checksum. Periodically restore into a separate test environment and verify expected tables, rows, and uploaded files.

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

## Retention and Off-Device Copy

Retention is a client decision. A starting policy is daily for 14 days, weekly for 8 weeks, and monthly for 12 months.

Backups must be copied off-device or to removable/encrypted storage so a PC or disk failure does not destroy all recoverable data.

