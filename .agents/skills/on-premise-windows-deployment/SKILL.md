# On-Premise Windows Deployment Skill

## Purpose

Use this skill whenever changing Docker, Caddy, deployment scripts, runtime paths, backup scripts, Windows operations, public access, HTTPS, router assumptions, or client-PC hosting documentation.

The production system is hosted on the client’s Windows desktop PC, not on a cloud server. The PC acts as the client’s local application server.

## Final Hosting Model

**Primary model — Cloudflare Tunnel (default; use this unless a client already has a static IP and asks for direct hosting):**

External users access:

Client-owned domain (registered/DNS on Cloudflare)
→ Cloudflare edge (public DNS + TLS termination)
→ Cloudflare Tunnel (outbound-only connection from the client PC, no inbound ports)
→ `cloudflared` connector running on the Windows PC (as a Windows service)
→ Caddy running in Docker (plain HTTP is acceptable on this internal hop; the tunnel is already encrypted)
→ React/Vite PWA static assets
→ `/api` reverse proxy to Node API
→ PostgreSQL on private Docker network

This model requires no static public IP, no CGNAT check, and no router/firewall changes — it was chosen as the
default because the client is not technical and cannot be relied on to manage ISP/router configuration.

**Alternate model — direct hosting (only when the client already has a static IP and explicitly prefers it):**

Client-owned domain
→ DNS A record
→ client static public IPv4
→ client router/firewall
→ TCP 80 and TCP 443 forwarded to the client PC
→ Caddy running in Docker (obtains its own Let's Encrypt certificate)
→ React/Vite PWA static assets
→ `/api` reverse proxy to Node API
→ PostgreSQL on private Docker network

## Non-Negotiable Deployment Rules

1. The client owns the production domain and renewal responsibility.
2. The client's Cloudflare account is the source of truth for DNS and (under the primary model) Tunnel
   configuration; do not create shadow DNS or shadow tunnels outside that account.
3. `cloudflared` must run as an auto-starting Windows service so the tunnel survives PC reboots, the same way
   Docker Desktop must auto-start.
4. If using the alternate direct-hosting model instead: the client must have a publicly routable static IPv4
   address, the connection must not be behind CGNAT, and the router/firewall must forward TCP 80 and TCP 443 to
   the Windows PC.
5. The Windows PC must have a stable LAN IP; a DHCP reservation on the router is preferred (needed under both
   models — the alternate model needs it for port forwarding, the primary model needs it so `cloudflared` and
   Caddy always find each other at a known address).
6. PostgreSQL must never be exposed to the host or internet.
7. Only the reverse proxy (Caddy, via the tunnel or via forwarded ports) should be reachable from outside the
   Docker network.
8. API public deployment is prohibited until authentication and API security are complete.
9. No real secrets, domains, public IPs, tokens, certificates, passwords, tunnel credentials, or client-specific
   values may be committed to Git.
10. Cloudflare Tunnel's free tier carries no uptime SLA. Document this to the client as an accepted trade-off in
    exchange for not requiring ISP/router work on their end.

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

* receive HTTP/HTTPS (or plain HTTP behind the tunnel — see below) traffic;
* redirect HTTP to HTTPS where appropriate;
* serve built React/Vite PWA static files;
* reverse-proxy `/api` to the internal API container.

**Under the primary Cloudflare Tunnel model:** Cloudflare terminates public TLS at its edge using the domain's
Cloudflare-managed certificate. The hop from `cloudflared` to Caddy is already inside the encrypted tunnel, so
Caddy does not need to obtain its own public Let's Encrypt certificate for the public hostname. Caddy may still
serve a locally-trusted certificate for LAN-only access if that's needed for local testing.

**Under the alternate direct-hosting model:** Caddy is responsible for obtaining and renewing the TLS
certificate itself. Normal automatic HTTPS requires the domain to resolve to the client's public IP and usually
requires inbound TCP 80 and TCP 443. If TCP 80 cannot be opened, a DNS-01 challenge or another certificate
strategy must be explicitly approved.

## HTTPS Testing

Do not claim real phone PWA installation is fully proven through plain `http://LAN-IP`. For phone/PWA testing,
the origin must be stable and HTTPS — the Cloudflare Tunnel hostname satisfies this directly once the tunnel is
running, since it is the same origin used in production, not a separate temporary one.

If a temporary/throwaway origin is ever needed ahead of the real tunnel being ready (e.g. a quick local trusted
certificate installed on a phone for controlled testing), keep it clearly separated from the final production
hostname and do not treat it as equivalent proof of a working public deployment.

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
9. Domain and certificate renewal must be verified (under the primary model, this means the Cloudflare-managed
   certificate; under the alternate model, Caddy's own Let's Encrypt renewal).
10. Client ownership and operational responsibilities must be documented.
11. Under the primary model: `cloudflared` must be confirmed running as an auto-starting Windows service, and
    the tunnel's reconnect behavior after a PC reboot or brief internet loss must be verified.

## Validation Checklist

For deployment-related changes, verify:

* `docker compose config` passes.
* Only the proxy publishes host ports (under the alternate direct-hosting model) — under the primary Tunnel
  model, no host ports need to be published at all, since `cloudflared` reaches Caddy over the Docker network
  or localhost.
* PostgreSQL does not publish host port 5432.
* Caddy serves the frontend.
* `/api/health` works through Caddy, reachable via the public tunnel hostname.
* `cloudflared` is installed as a Windows service and reconnects automatically after reboot (primary model).
* Runtime bind mounts point outside Git.
* Data survives container recreation.
* Backups are created outside the database container.
* Restore process is documented.
* Windows startup and sleep policy are documented.
