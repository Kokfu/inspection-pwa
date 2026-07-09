# Architecture Decisions

## Approved Direction

- The client owns the production domain and renews it.
- The client has a publicly routable static IPv4 address and is not behind CGNAT.
- The router forwards TCP 80 and TCP 443 to the Windows PC.
- The router target must be stable through a DHCP reservation or static LAN IP.
- The client Windows PC runs Docker Desktop and Docker Compose.
- Caddy is the preferred reverse proxy.
- Caddy serves built React/Vite PWA static assets and reverse-proxies `/api` to the Node API.
- PostgreSQL is internal-only and must never publish port 5432.
- PostgreSQL live data uses a Docker named volume.
- Uploads, logs, backups, restore staging, and operational files use Windows host bind mounts.
- PostgreSQL backups use `pg_dump` or an equivalent PostgreSQL-safe method.
- The live PostgreSQL volume must not be copied as the backup method.
- IndexedDB stores local drafts, records, sync outbox items, reference data, and future attachment Blobs.
- Service Worker Cache Storage stores app-shell assets only.
- Offline limits synchronisation, not data entry.

## Deferred Decisions

- Final production hostname.
- Temporary HTTPS test origin.
- Off-device backup destination.
- Initial production authentication design.
- Windows startup automation method after Docker Desktop is ready.
- Backup retention period.
- Operational support owner.

## Phase Boundary

Phase 1 is foundation only. It must not implement inspection forms, customer records, reports, photo capture, signatures, complex user management, or production business workflows.

