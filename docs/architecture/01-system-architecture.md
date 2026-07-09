# System Architecture

## Production Path

```text
External technician phone/browser
-> client-owned HTTPS domain
-> DNS A record
-> client static public IPv4
-> router/firewall NAT
-> TCP 80 and 443 forwarded to stable LAN IP of client Windows PC
-> Docker Desktop
-> Caddy reverse proxy
-> React/Vite PWA static assets
-> /api reverse proxy to Node API
-> PostgreSQL on private Docker network
```

## Services

- `proxy`: Caddy, public ports 80 and 443, static PWA delivery, `/api` reverse proxy.
- `api`: Node.js TypeScript API, internal Docker network only.
- `postgres`: PostgreSQL, internal Docker network only.
- Future backup helper: optional scheduled backup container or PowerShell-driven task using `pg_dump`.

## Frontend Delivery

The frontend is delivered by a multi-stage Docker build:

```text
node build stage
-> React/Vite production build
-> dist output
-> final Caddy image
-> Caddy serves static assets
```

Caddy also reverse-proxies `/api/*` to the API container.

## Network Rules

- Public: only Caddy ports 80 and 443.
- Internal: API and PostgreSQL.
- PostgreSQL must never publish port 5432.
- The API must not be publicly usable until authentication is implemented.

## Runtime Data

Live PostgreSQL data uses a Docker named volume. Runtime files that operators may need to inspect or back up use Windows bind mounts under `C:\InspectionSystem\runtime`.

