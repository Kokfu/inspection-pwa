# On-Premise Windows Deployment Skill

## Purpose

Use this skill whenever changing Docker, Caddy, deployment scripts, runtime paths, backup scripts, Windows operations, public access, HTTPS, router assumptions, or client-PC hosting documentation.

The production system is hosted on the client’s Windows desktop PC, not on a cloud server. The PC acts as the client’s local application server.

## Final Hosting Model

External users access:

Client-owned domain
→ DNS A record
→ client static public IPv4
→ client router/firewall
→ TCP 80 and TCP 443 forwarded to the client PC
→ Caddy running in Docker
→ React/Vite PWA static assets
→ `/api` reverse proxy to Node API
→ PostgreSQL on private Docker network

## Non-Negotiable Deployment Rules

1. The client owns the production domain and renewal responsibility.
2. The client must have a publicly routable static IPv4 address.
3. The internet connection must not be behind CGNAT.
4. The router/firewall must forward TCP 80 and TCP 443 to the Windows PC.
5. The Windows PC must have a stable LAN IP.
6. DHCP reservation on the router is preferred.
7. PostgreSQL must never be exposed to the host or internet.
8. Only the reverse proxy should expose public ports.
9. API public deployment is prohibited until authentication and API security are complete.
10. No real secrets, domains, public IPs, tokens, certificates, passwords, or client-specific values may be committed to Git.

## Runtime Folder Layout

Use a predictable runtime path outside the Git repository.

Recommended production path:

```text
C:\InspectionSystem\runtime\
```

Recommended layout:

```text
C:\InspectionSystem\
  runtime\
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

## Docker Persistence Rules

Use:

* Docker named volume for live PostgreSQL data.
* Docker named volume for Caddy certificate/account state.
* Windows host bind mounts for uploads.
* Windows host bind mounts for logs.
* Windows host bind mounts for backup exports.
* Windows host bind mounts for restore staging.
* Windows host bind mounts for operational files.

Do not rely on disposable container filesystems for business data.

## PostgreSQL Backup Rules

PostgreSQL backups must use PostgreSQL-safe methods.

Allowed examples:

* `pg_dump`
* `pg_dumpall`
* approved WAL/base-backup tooling

Do not back up PostgreSQL by copying the active live database volume files.

Backups must be written outside the live database container.

Recommended backup output:

```text
C:\InspectionSystem\runtime\backups\postgres\
```

Backups must include:

* timestamped filename;
* checksum or manifest;
* restore instructions;
* periodic restore test.

## Upload Backup Rules

Uploaded photos, files, and signatures must be backed up separately from the database dump.

Recommended output:

```text
C:\InspectionSystem\runtime\backups\uploads\
```

A complete recovery requires:

* PostgreSQL dump;
* uploads folder backup;
* matching manifest/checksum;
* application version or image tag.

## Windows Operational Requirements

The deployment runbook must cover:

1. Docker Desktop startup policy.
2. Docker Compose stack startup after Docker is ready.
3. Whether startup is manual, scheduled, or scripted.
4. Windows sleep and hibernation policy.
5. Windows Update restart policy.
6. Disk-space monitoring.
7. Power-loss recovery.
8. UPS recommendation where appropriate.
9. BIOS/UEFI restore-after-power-loss setting where available.
10. Who is responsible for restarting or checking the system after reboot.

## HTTPS Rules

Caddy is the preferred reverse proxy.

Caddy responsibilities:

* receive HTTP/HTTPS traffic;
* redirect HTTP to HTTPS where appropriate;
* obtain and renew TLS certificates;
* serve built React/Vite PWA static files;
* reverse-proxy `/api` to the internal API container.

Normal automatic HTTPS requires the domain to resolve to the client public IP and usually requires inbound TCP 80 and TCP 443.

If TCP 80 cannot be opened, DNS challenge or another certificate strategy must be explicitly approved.

## Temporary HTTPS Testing

Temporary HTTPS testing must be separated from final production access.

Allowed temporary test approaches:

* stable HTTPS tunnel;
* temporary test subdomain;
* local trusted certificate installed on phone for controlled testing.

Do not claim real phone PWA installation is fully proven through plain `http://LAN-IP`.

For phone/PWA testing, the origin must be stable and HTTPS.

## Frontend Deployment Rules

Preferred production frontend delivery:

React/Vite production build
→ static `dist` output
→ copied into Caddy image by multi-stage Docker build
→ Caddy serves static files
→ Caddy proxies `/api` to API

Do not run a long-lived Node frontend server in production unless there is a concrete approved reason.

## Stale-Cache Update Protection

PWA updates must not leave cached HTML pointing to deleted hashed JavaScript or CSS files.

The update runbook must preserve previous release assets long enough for installed PWAs to update safely.

Recommended direction:

```text
C:\InspectionSystem\runtime\releases\
  2026.07.09-001\
  2026.07.20-002\
  current\
```

Or an equivalent container/image versioning strategy that prevents asset mismatch.

Do not immediately delete old hashed frontend assets during deployment.

## Public Exposure Rules

Before any public deployment:

1. Authentication must be implemented.
2. API authorization must be implemented.
3. Destructive routes must be protected.
4. PostgreSQL must be confirmed private.
5. Health checks must reveal minimal information.
6. Firewall rules must expose only required ports.
7. Backup process must be tested.
8. Restore process must be tested.
9. Domain and certificate renewal must be verified.
10. Client ownership and operational responsibilities must be documented.

## Validation Checklist

For deployment-related changes, verify:

* `docker compose config` passes.
* Only the proxy publishes host ports.
* PostgreSQL does not publish host port 5432.
* Caddy serves the frontend.
* `/api/health` works through Caddy.
* Runtime bind mounts point outside Git.
* Data survives container recreation.
* Backups are created outside the database container.
* Restore process is documented.
* Windows startup and sleep policy are documented.
