# Security deployment execution plan — pending authorization

Prepared 2026-10-10 from the current Compose, Caddy publisher and deployment/backup runbooks. This is a reviewable plan, not evidence that any production action occurred. Candidate evidence: [SECURITY_DEPLOYMENT_CHECKPOINT.md](SECURITY_DEPLOYMENT_CHECKPOINT.md). Source commit: `f208352`; documentation checkpoint: `842100a`.

## Inputs and gates before execution

- Explicit authorization for the actual production replacement, including API/reminder-worker/proxy interruption, is required. Controlled production testing needs its own approved HTTPS origin, purpose-created accounts and disposable business fixtures. Do not put credentials, cookies or customer configuration in this document.
- Confirm the intended Windows host, Compose project, existing configuration source, tunnel mode and approved maintenance window privately. This checkout has unrelated changes; do not run a source rebuild from it for production. Use reviewed, verified artifacts only.
- Capture existing API, reminder-worker and proxy image IDs, restart commands, active web release ID, retention setting and configuration location privately before replacement. Preserve those images and existing release assets. Record which previous security vulnerabilities would return on rollback.
- Owner must provide current verified backup/restore evidence and confirm backups cover database, uploads and matching manifests. Do not restore production data into our test database or run backup/restore scripts during this preparation. No migration/schema change is part of this release.
- Verify forwarding/Host behavior before serving the candidate: the browser Origin must be HTTPS and its authority must match the Host received by the API. The documented quick tunnel using `--http-host-header localhost` rewrites that Host and is incompatible with public-Origin equality; it is not acceptance evidence for this release. Do not bypass this by weakening the guard or enabling proxy trust. Production tunnel behavior remains unverified.
- Preserve Cloudflare Always Use HTTPS. Verify edge login rule, direct-origin isolation and API/PostgreSQL host-port isolation through the authorized owner process. Evaluate shared-Caddy quota and audit-table cleanup cost against expected staff usage.

## Replacement sequence to approve

1. Validate the intended effective Compose configuration privately without printing secret environment values. Confirm candidate image identities against recorded hashes, service mounts, networks and rollback identities. The `reminder-worker` uses the API image and must be included in the replacement plan.
2. Establish a maintenance window and preserve client work. Never clear IndexedDB or uninstall the PWA to resolve sync issues. Confirm whether any older ownership upgrade prerequisites in the deployment runbook apply to the currently deployed version; do not assume a historical release baseline.
3. Stop only the API and reminder worker if required by the approved replacement method. Leave PostgreSQL, named volumes, uploads, tunnel configuration and Cloudflare settings intact. No `down -v`, volume deletion, pruning or migration command.
4. Replace API and reminder-worker with the verified API candidate using the owner-approved deployment configuration. Replace proxy with the verified web/Caddy candidate. Do not use an unrestricted `up --build` against this dirty checkout. A temporary image-selection override, if chosen, requires explicit deployment/configuration authorization and must be reviewed before execution; none has been created here.
5. Verify service startup and health, image IDs and actual installed security package versions. Check the active web release and old hashed asset availability. Redact logs and never capture authentication headers or session cookies in committed evidence.
6. Run the authorized anonymous and authenticated matrix with the purpose-created accounts: ownership/role restrictions, generic login errors, 429/Retry-After and recovery, logout/reset/deactivation/replay, HTTP-Origin rejection and HTTPS-Origin acceptance through the actual tunnel, and cache protection. Limit attempts to the agreed acceptance sequence; do not brute-force accounts or load-test production.
7. Under separate approved interruption scope, exercise actual API and PostgreSQL restart/persistence and worker recovery. Then perform physical-phone HTTPS installation, offline typing/local records/photos, force-close/reopen, reconnect and exact-UUID idempotent synchronization. Local automation does not substitute for these observations.
8. Close only acceptance claims supported by recorded executed evidence. Confirm approved account hygiene/device policy, backup/restore and operational ownership before security sign-off.

## Rollback sequence to approve

If startup, authentication, proxy/Origin handling or sync acceptance fails, pause further writes and collect minimal redacted diagnostics. Restore the previously recorded API/reminder-worker image identities and proxy/release selection through the approved deployment configuration; preserve PostgreSQL/uploads and local device storage. Do not restore an older database over current data or delete newer release assets. Recheck service health, login, existing authoritative records and old/new hashed asset availability. Verify that the previous web selection is retained and compatible before invoking the publisher's active-release selection. No blanket claim of API compatibility or lossless rollback is made without the owner's rehearsal/evidence.

Restoring the older API can restore the original login/dependency risks. Keep security sign-off withheld, retain the edge protection and arrange a reviewed corrective deployment. A database restore is a separate recovery operation requiring separate authorization; this plan contains none.

## Pending evidence

Production replacement/testing authorization and origin/account inputs; effective deployed Host/socket-peer chain; installed versions; edge rule/account hygiene; capacity; current backup/restore and rollback identities; actual deployed restart; physical phone/offline/reconnect acceptance. All remain NOT RUN by this preparation. Local P0/P1 remain 0/0 identified; deployed A-02 remains open. SECURITY SIGN-OFF: WITHHELD.
