# Client PC installation and public access

This is an operator handoff, not an unattended installer. A client with no development experience needs an initial setup visit by an IT/operator, especially for Windows/WSL, router, domain, secrets, backups, and recovery. `requirements.txt` is a human checklist; do not run `pip install -r requirements.txt`. The application is Node/TypeScript and runs in Docker containers.

## What the domain does

A domain is a human-readable name such as `example.com`. The client registers and renews it with a registrar. DNS maps a hostname such as `app.example.com` to a public address or tunnel route; DNS does not store the app or database. The app and PostgreSQL stay on the client's PC. HTTPS gives the browser a trusted connection to the hostname. If that PC, its internet, or Docker is down, remote users cannot sync or load new pages; previously loaded offline PWA data remains on each phone.

The client may buy the domain at Cloudflare Registrar, if the desired name and extension are available. The client should own the account, billing, renewal, and recovery email. Cloudflare Registrar domains use Cloudflare nameservers. A domain from another registrar can also use Cloudflare DNS after changing its nameservers. Check the actual registration and renewal price before purchase. Do not buy the domain in a developer's personal account.

## Choose how the internet reaches the PC

| Route | What is required | This repository's status |
| --- | --- | --- |
| Static public IPv4 and router forwarding | ISP-confirmed static, publicly routable IPv4 (no CGNAT); stable PC LAN address; router forwards TCP 80 and 443 to the PC; DNS `A` record for `app.example.com`; `.env` `PUBLIC_HOSTNAME=app.example.com` | **Documented production design.** Caddy obtains/renews HTTPS certificates. Only the proxy publishes ports; PostgreSQL stays private. |
| Named Cloudflare Tunnel | Domain on Cloudflare; installed, persistent `cloudflared` connector on the PC; outbound connectivity to Cloudflare (including port 7844); published route for the app hostname; secure origin/Host configuration; service startup and recovery | Technically possible without a static IP or inbound router ports, including behind CGNAT. **Not implemented as a production service in this repo.** The existing `Start-DevTunnel.ps1` is a temporary test tunnel with a changing URL. This route needs a deliberate production design, configuration, and acceptance test before use. |

Buying only the domain does not make the PC reachable. Cloudflare DNS/proxy alone also does not remove the static-IP/router requirements of the current production design. Do not forward PostgreSQL port 5432 or expose the API container directly. If using Cloudflare's proxy with the static-IP route, verify its `Full (strict)` HTTPS mode against Caddy's valid origin certificate; do not use `Flexible` mode.

## Client PC preparation

1. Confirm current [Docker Desktop Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) for the exact Windows edition and hardware. Enable WSL 2 and virtualization, install Docker Desktop, select Linux containers, and check [Docker Desktop licensing](https://docs.docker.com/subscription-billing/desktop-license/) for the client's organization. Docker Desktop must be running before Compose commands work. A server edition of Windows needs a different container-host plan.
2. Set a stable LAN address using a router DHCP reservation. Keep the PC powered, awake, connected, and adequately cooled; plan Windows Update/reboot, Docker startup after login, power recovery, a UPS where appropriate, and an operator responsible for checking service after restart.
3. Reserve a persistent disk path `C:\InspectionSystem\runtime\` and create the uploads, logs/api, logs/proxy, backups/postgres, backups/uploads, restore-staging, operational, and releases folders. Arrange encrypted off-device backups and a restore drill. PostgreSQL's live data uses a Docker named volume; **never use `docker compose down -v`** on the production stack.
4. Obtain a reviewed, conflict-free release of the source. A GitHub repository download/clone gives source files; it is not a Docker image. This repository's Compose file builds the application images on the client PC. First build/update requires internet access to image registries and npm. Host Python, Node, npm, PostgreSQL, and Caddy are unnecessary.
5. In PowerShell from the project folder, run `Copy-Item .env.example .env`. Set a unique strong `POSTGRES_PASSWORD` and the same password in `DATABASE_URL` (URL-encode password characters that require it in a URL). Set `PUBLIC_HOSTNAME` to the exact client hostname before public use. Keep `.env` private, outside Git history. Have the operator review the storage paths and all values. Do not start production with the example password or `localhost` hostname.

## First start after preparation

Run these in PowerShell **from the project folder**, after Docker Desktop says it is running. The operator must first check out a clean, committed release (no uncommitted or unmerged changes) and verify the `.env` values.

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs api --tail=50
.\scripts\Health-Check.ps1
```

`docker compose up -d --build` installs the API and web npm dependencies inside image builds using their lockfiles, obtains PostgreSQL and Caddy images, and starts the services. It does **not** install Docker Desktop/WSL, register a domain, configure a router, create an admin user, arrange backups, or prove internet reachability. API startup runs migrations; inspect the logs for errors. The localhost health check only proves local proxy/API reachability.

An operator must create the first admin account with the existing `apps/api/src/cli/createAdmin.ts` command, supplying `ADMIN_USERNAME` and a strong `ADMIN_PASSWORD` of at least 12 characters via temporary environment variables. Do not put credentials in Git, `.env.example`, a shared command transcript, or a screenshot. Log in through the public hostname and create individual accounts as required.

Before inviting external users, test `https://app.example.com/` and `https://app.example.com/api/health` from a device **outside the client's Wi-Fi**. Check login and authorization, photo upload, a real phone's PWA installation/offline save/reconnect, backup and restore, and that only ports 80/443 reach the proxy. Verify Windows reboot recovery. A local `https://localhost/` success is insufficient evidence of public access.

## Current release blockers

The existing startup script only runs Compose and does not perform prerequisite setup or validate secrets. The named production tunnel path is not implemented. Domain purchase, ISP/router setup, client PC checks, production HTTPS, and phone acceptance have not been performed by this documentation change.

See `docs/architecture/06-deployment-runbook.md` for operations and `docs/architecture/05-backup-and-recovery.md` for backup/restore details.
