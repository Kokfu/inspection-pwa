# MFE Inspection (Inspection PWA)

Offline-first field-inspection web app for fire-system service and repair visits. Technicians record visits on
their phones, with or without signal; managers set up customers, review and approve work, download report PDFs
and send e-mail reminders from an office browser.

The system runs on the client's Windows PC with Docker Compose. PostgreSQL is the central database.

## Documentation

| Read | For |
|---|---|
| [docs/handover/](docs/handover/README.md) | **Client Handover Pack**: plain-language guide for owners, managers, admins and technicians |
| [docs/it-guide/](docs/it-guide/README.md) | **Office PC Technical Guide**: start/stop, Manager accounts, backups, recovery, updates |
| [docs/client-pack/](docs/client-pack/) | Printable Word/PDF editions of both |

Developer documentation (architecture, deployment notes, test records) lives only in the developer repository.
It is left out of client releases by [`.gitattributes`](.gitattributes) (`export-ignore`); see
`docs/deployment-day/` there.

## Repository layout

```text
apps/web/    React + TypeScript + Vite PWA (IndexedDB via Dexie, service worker)
apps/api/    Node.js + TypeScript API, PostgreSQL migrations, report/PDF generation, Manager account CLI
infra/       Caddy reverse proxy
scripts/     PowerShell operations scripts (prepare, start, stop, health, backup, restore)
docs/        Documentation
```

## Running it

See the [Office PC Technical Guide](docs/it-guide/01-running-the-system.md). In short, from this folder with
Docker Desktop running:

```powershell
docker compose --profile tunnel up -d --build
docker compose --profile tunnel ps
```

A new installation has **no accounts**; create the first Manager with
`docker compose exec api node dist/cli/createAdmin.js <username>`.

Never run `docker compose down -v` on the live system: it deletes the database.

## Developer commands

```powershell
cd apps\web; npm install; npm run typecheck; npm run build
cd ..\api;   npm install; npm run typecheck; npm run build
```

Runtime data (uploads, logs, backups, releases) lives outside Git under `C:\InspectionSystem\runtime\`.
