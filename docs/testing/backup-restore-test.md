# Backup and Restore Test

1. Create a PostgreSQL backup using `pg_dump` or equivalent safe tooling.
2. Archive or copy the uploads folder.
3. Write a manifest with timestamps, versions, and checksums.
4. Restore into a separate test environment.
5. Verify expected tables, row counts, and sample uploads.
6. Record the restore duration and any manual steps.

Do not validate backups by copying the live PostgreSQL Docker volume.

