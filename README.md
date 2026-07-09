# Inspection PWA

Offline-first field inspection Progressive Web App foundation for a client-hosted Windows PC.

This repository is intentionally in Phase 1 foundation state. It defines the architecture, container layout, operational scripts, and application skeletons only. It does not yet implement inspection forms, customer records, reporting, photo capture, signatures, or production authentication.

## Target Architecture

External users will eventually access the system through:

```text
Client-owned domain
-> DNS A record
-> client static public IPv4
-> router/firewall forwarding TCP 80 and 443
-> Caddy running in Docker Desktop on the client Windows PC
-> React/Vite PWA static assets and /api reverse proxy
-> Node.js API
-> internal-only PostgreSQL
```

PostgreSQL must never be exposed to the host or public internet. The API must not be deployed publicly until authentication and API security are completed in a later phase.

## Current Scope

Included now:

- React + TypeScript + Vite PWA skeleton.
- Node.js + TypeScript API skeleton.
- PostgreSQL Docker service skeleton.
- Caddy reverse proxy skeleton.
- Multi-stage Caddy image build that copies the React/Vite `dist` output into Caddy.
- Architecture documentation.
- Agent skills.
- Windows PowerShell operational script skeletons.

Not included yet:

- Real inspection forms.
- Customer/business modules.
- Reports.
- Photo capture.
- Signatures.
- Complex user management.
- Production-ready authentication.

## Local Commands

Safe validation commands:

```powershell
docker compose config
```

Future implementation commands after dependencies are installed:

```powershell
cd apps\web
npm install
npm run typecheck
npm run build

cd ..\api
npm install
npm run typecheck
npm run build
```

Do not run public deployment until the security phase is complete.

## Runtime Data

Production runtime data is expected outside this Git repository, for example:

```text
C:\InspectionSystem\runtime\
```

PostgreSQL live data uses a Docker named volume. Uploads, logs, backups, restore staging, and operational files use Windows host bind mounts.

