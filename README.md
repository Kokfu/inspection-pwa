# Inspection PWA

Offline-first field-inspection Progressive Web App for fire-system service and repair visits.
Technicians record visits on their phones (with or without internet); managers set up customers,
review work, approve reports and send email reminders from an office browser.

The system runs on the client's Windows PC through Docker Compose. PostgreSQL is the central database.

## Documentation

Start with the handover pack in [docs/handover/](docs/handover/README.md):

| Read this | For |
|---|---|
| [docs/handover/README.md](docs/handover/README.md) | Index, and the role names (Manager / Admin / Technician) |
| [01 Accounts and access](docs/handover/01-accounts-and-access.md) | Create, reset and retire Manager accounts; manage Technician and Admin accounts |
| [02 User guide](docs/handover/02-user-guide.md) | Every feature, by role |
| [03 Offline and online](docs/handover/03-offline-and-online.md) | What works offline, how syncing works |
| [04 Operations and maintenance](docs/handover/04-operations-and-maintenance.md) | Start/stop, backups, updates, routine checks |
| [05 Handover checklist and suggestions](docs/handover/05-handover-checklist-and-suggestions.md) | What to finish before handover, known limits |

Other references:

- First install and public access: [docs/client-install-and-public-access.md](docs/client-install-and-public-access.md)
- Backup and restore: [docs/operations/backup-and-restore.md](docs/operations/backup-and-restore.md)
- Email reminders: [docs/operations/service-due-email.md](docs/operations/service-due-email.md)
- Architecture and design decisions (developers): [docs/architecture/](docs/architecture)
- Developer status log: [HANDOVER.md](HANDOVER.md)
- Contributor and agent rules: [AGENTS.md](AGENTS.md)

## Repository layout

```text
apps/web/    React + TypeScript + Vite PWA (IndexedDB via Dexie, service worker)
apps/api/    Node.js + TypeScript API, PostgreSQL migrations, report/PDF generation, admin CLI
infra/       Caddy reverse proxy, PostgreSQL init, Compose override example
scripts/     PowerShell operations scripts (start, stop, health, backup, restore)
docs/        Documentation
```

## Quick start (operator)

Run from this folder with Docker Desktop running. See
[04 Operations](docs/handover/04-operations-and-maintenance.md) and the install guide above for the full steps.

```powershell
Copy-Item .env.example .env        # then set real secrets; never commit .env
docker compose up -d --build
docker compose ps
.\scripts\Health-Check.ps1
```

A new installation has **no accounts**. Create the first Manager on the office PC:

```powershell
docker compose exec api node dist/cli/createAdmin.js your-manager-username
```

Never run `docker compose down -v` on the live system: it deletes the database volume.

## Developer commands

```powershell
cd apps\web; npm install; npm run typecheck; npm run build
cd ..\api;   npm install; npm run typecheck; npm run build
```

Runtime data (uploads, logs, backups, releases) lives outside Git, by default under
`C:\InspectionSystem\runtime\`. PostgreSQL data lives in a Docker named volume.
