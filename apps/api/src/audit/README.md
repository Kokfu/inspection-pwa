# Audit Logging

`audit_events` rows are written for every authentication event, sync write, and manager
configuration write. Writes go through the shared `auditLog()` helper
(`apps/api/src/audit/auditLog.ts`), or through a transaction-scoped equivalent where the audit
row must commit atomically with the write it records.

## What is audited

- **Authentication** (`apps/api/src/routes/auth.ts`): `login` (success and failure — invalid
  payload, unknown/inactive user, bad password) and `logout`.
- **Sync writes** (`apps/api/src/routes/sync.ts`): `sync_write`, including rejected batches
  (non-array payload, batch size over the limit) and per-item outcomes.
- **Customer/site creation and manager configuration writes**
  (`apps/api/src/routes/managerCustomers.ts:497-1026`): each write runs inside a database
  transaction and calls the local `audit()` helper (`managerCustomers.ts:497`) so the audit row
  commits atomically with the change it records. Actions: `technician_customer_created` (the
  `POST /customers` self-service path), `manager_customer_created`,
  `manager_customer_site_created`, `manager_customer_configuration_activated`,
  `manager_customer_label_overrides_updated`, `manager_customer_system_configuration_updated`,
  `manager_customer_evidence_policy_updated`, `manager_customer_locations_updated`.

## What is not audited, and why

Backup and restore operations (`scripts/Backup-Database.ps1`, `Backup-Uploads.ps1`,
`Restore-Database.ps1`, `Restore-Uploads.ps1`, `Verify-Backup.ps1`) are not audited through this
table. They are never exposed via any API route — they run directly on the host via PowerShell —
so there is no request path for `auditLog()` to hook into. `Restore-Database.ps1` defaults to a
disposable drill container and refuses the live runtime Postgres container by name or Docker ID
under any flag; `Restore-Uploads.ps1` defaults to a staging directory and only touches the live
uploads bind mount when called with the explicit `-OverwriteLiveUploads` switch. See
`docs/architecture/05-backup-and-recovery.md` for how those operations are run and verified.
