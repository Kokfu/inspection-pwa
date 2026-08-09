# Runtime Folder Example

Production runtime data should live outside the Git repository.

Recommended layout:

```text
C:\InspectionSystem\runtime\
  uploads\
  logs\
    api\
    proxy\
    postgres\
  backups\
    postgres\
    uploads\
    manifests\
  restore-staging\
  operational\
  releases\
```

PostgreSQL live data is stored in a Docker named volume, not this folder. PostgreSQL backups are exported here using `pg_dump` or equivalent safe tooling.

The `releases` bind mount retains the active frontend and the configured previous-release window across proxy container replacement. It contains no business data, but it is required for safe installed-PWA upgrades and immediate rollback.
