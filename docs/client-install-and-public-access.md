# Client PC installation and public access

This is an operator handoff, not an unattended installer. A client with no development experience needs an initial setup visit by an IT/operator, especially for Windows/WSL, router, domain, secrets, backups, and recovery. `requirements.txt` is a human checklist; do not run `pip install -r requirements.txt`. The application is Node/TypeScript and runs in Docker containers.

## What the domain does

A domain is a human-readable name such as `example.com`. The client registers and renews it with a registrar. DNS maps a hostname such as `app.example.com` to a public address or tunnel route; DNS does not store the app or database. The app and PostgreSQL stay on the client's PC. HTTPS gives the browser a trusted connection to the hostname. If that PC, its internet, or Docker is down, remote users cannot sync or load new pages; previously loaded offline PWA data remains on each phone.

The client may buy the domain at Cloudflare Registrar, if the desired name and extension are available. The client should own the account, billing, renewal, and recovery email. Cloudflare Registrar domains use Cloudflare nameservers. A domain from another registrar can also use Cloudflare DNS after changing its nameservers. Check the actual registration and renewal price before purchase. Do not buy the domain in a developer's personal account.

## Choose how the internet reaches the PC

Named Cloudflare Tunnel is the **default recommended route** for this project: the client is not expected to
have IT/networking staff, and this route needs no ISP contact, no static IP, and no router changes. Direct
hosting remains available and fully supported for a client who already has a static IP and prefers it.

| Route | What is required | This repository's status |
| --- | --- | --- |
| Named Cloudflare Tunnel (recommended default) | Domain on Cloudflare; a tunnel created in the Cloudflare Zero Trust dashboard with a public hostname route to the proxy; the tunnel token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`; `PUBLIC_HOSTNAME` set with an explicit `http://` scheme (e.g. `http://app.example.com`) so Caddy serves plain HTTP instead of attempting its own certificate; stack started with `docker compose --profile tunnel up -d` | **Implemented.** The `cloudflared` service in `docker-compose.yml` (Compose `tunnel` profile) connects outbound only, over the `public` Docker network, directly to the `proxy` service — no host ports are published for it and it cannot reach `api`/`postgres` on the `internal` network. Works without a static IP or inbound router ports, including behind CGNAT. Cloudflare's free tier carries no uptime SLA; document that trade-off to the client. |
| Static public IPv4 and router forwarding (alternate) | ISP-confirmed static, publicly routable IPv4 (no CGNAT); stable PC LAN address; router forwards TCP 80 and 443 to the PC; DNS `A` record for `app.example.com`; `.env` `PUBLIC_HOSTNAME=app.example.com` (bare hostname, no scheme) | **Documented production design**, unchanged by the tunnel work above. Caddy obtains/renews HTTPS certificates itself. Only the proxy publishes ports; PostgreSQL stays private. Use this only when a client already has a static IP and explicitly prefers it. |

Both routes are supported by the same `docker-compose.yml`: the tunnel route is additive and only activates
with `--profile tunnel`, so a plain `docker compose up -d` is the direct-hosting route exactly as before. Buying
only the domain does not make the PC reachable under the direct-hosting route. Do not forward PostgreSQL port
5432 or expose the API container directly under either route. If using Cloudflare's proxy with the static-IP
route, verify its `Full (strict)` HTTPS mode against Caddy's valid origin certificate; do not use `Flexible`
mode.

### Setting up the named Cloudflare Tunnel route

1. In the client's Cloudflare account, go to **Zero Trust → Networks → Tunnels** and create a tunnel (name it
   after the client). Copy its token.
2. On the same tunnel, add a **public hostname**: the app's hostname (e.g. `app.example.com`) routed to
   `http://proxy:80` — this is the internal Docker service name and port, not a client-machine address.
3. In `.env` on the client PC, set `CLOUDFLARE_TUNNEL_TOKEN` to the copied token, and set `PUBLIC_HOSTNAME` to
   the same hostname with an explicit `http://` scheme, e.g. `PUBLIC_HOSTNAME=http://app.example.com`. The
   scheme is what tells Caddy to serve plain HTTP instead of attempting its own Let's Encrypt certificate —
   Cloudflare's edge terminates HTTPS for the public-facing connection instead. **Forgetting the `http://`
   scheme here is the one mistake that doesn't fail loudly**: Caddy falls back to its normal automatic-HTTPS
   behavior and redirects port 80 to `https://`, which the tunnel forwards straight back to Cloudflare's edge —
   the browser gets bounced in an endless redirect loop instead of a clear error. If the site won't load and
   `cloudflared`'s logs look healthy, check this setting first.
4. Start the stack with the tunnel connector included: `docker compose --profile tunnel up -d --build`.
5. Confirm `docker compose logs cloudflared --tail=50` shows a healthy/connected registration, and that
   `docker compose --profile tunnel ps` lists `cloudflared` as running. An empty or missing
   `CLOUDFLARE_TUNNEL_TOKEN` makes `cloudflared` exit immediately with an error in its logs — check there first
   if the public hostname doesn't resolve to the app.
6. Test `https://app.example.com/` and `https://app.example.com/api/health` from a device outside the client's
   Wi-Fi, same as the direct-hosting acceptance check below.
7. Reboot the PC once and confirm Docker and the `cloudflared` container both come back up on their own and the
   site is reachable again without manual steps — this is the operational equivalent of the router-forwarding
   check on the direct-hosting route.

## Client PC preparation

1. Confirm current [Docker Desktop Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) for the exact Windows edition and hardware. Enable WSL 2 and virtualization, install Docker Desktop, select Linux containers, and check [Docker Desktop licensing](https://docs.docker.com/subscription-billing/desktop-license/) for the client's organization. Docker Desktop must be running before Compose commands work. A server edition of Windows needs a different container-host plan.
2. Set a stable LAN address using a router DHCP reservation. Keep the PC powered, awake, connected, and adequately cooled; plan Windows Update/reboot, Docker startup after login, power recovery, a UPS where appropriate, and an operator responsible for checking service after restart.
3. Reserve a persistent disk path `C:\InspectionSystem\runtime\` and create the uploads, logs/api, logs/proxy, backups/postgres, backups/uploads, restore-staging, operational, and releases folders. Arrange encrypted off-device backups and a restore drill. PostgreSQL's live data uses a Docker named volume; **never use `docker compose down -v`** on the production stack.
4. Obtain a reviewed, conflict-free release of the source. A GitHub repository download/clone gives source files; it is not a Docker image. This repository's Compose file builds the application images on the client PC. First build/update requires internet access to image registries and npm. Host Python, Node, npm, PostgreSQL, and Caddy are unnecessary.
5. In PowerShell from the project folder, run `Copy-Item .env.example .env`. Set a unique strong `POSTGRES_PASSWORD` and the same password in `DATABASE_URL` (URL-encode password characters that require it in a URL). Set `PUBLIC_HOSTNAME` to the exact client hostname before public use — bare (`app.example.com`) for the direct-hosting route, or with an explicit `http://` scheme (`http://app.example.com`) plus `CLOUDFLARE_TUNNEL_TOKEN` for the named Cloudflare Tunnel route. Keep `.env` private, outside Git history. Have the operator review the storage paths and all values. Do not start production with the example password or `localhost` hostname. The email encryption key is created automatically in the persistent operational folder on first API startup; preserve that file in the encrypted recovery backup.

## First start after preparation

Run these in PowerShell **from the project folder**, after Docker Desktop says it is running. The operator must first check out a clean, committed release (no uncommitted or unmerged changes) and verify the `.env` values.

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs api --tail=50
.\scripts\Health-Check.ps1
```

Add `--profile tunnel` to the `config`/`up`/`ps` commands above when using the named Cloudflare Tunnel route
(e.g. `docker compose --profile tunnel up -d --build`), so the `cloudflared` connector starts alongside the
rest of the stack. Omit it entirely for the direct-hosting route — behavior is unchanged from before this
route existed.

`docker compose up -d --build` installs the API and web npm dependencies inside image builds using their lockfiles, obtains PostgreSQL and Caddy images, and starts the services. It does **not** install Docker Desktop/WSL, register a domain, configure a router, create an admin user, arrange backups, or prove internet reachability. API startup runs migrations; inspect the logs for errors. The localhost health check only proves local proxy/API reachability.

An operator must create the first admin account with the `create-admin` command (see **Admin recovery** below). Do not put credentials in Git, `.env.example`, a shared command transcript, or a screenshot. Log in through the public hostname and create individual accounts as required.

## Admin recovery

These commands are for the operator only. They run inside the API container on the client PC, work offline, and are never exposed over HTTP. Run them in PowerShell from the project folder while the stack is up. `docker compose exec` allocates a terminal by default, which the hidden password prompt needs: **do not add `-T`**.

Reset a forgotten password for an **existing admin**. The command asks for the new password twice (nothing is shown as you type; 12–1024 characters), then sets it, makes sure the account is active, and signs that admin out everywhere:

```powershell
docker compose exec api node dist/cli/resetAdminPassword.js admin-username
```

Create an additional **new admin** (it refuses a username that already exists, and never changes an existing account):

```powershell
docker compose exec api node dist/cli/createAdmin.js new-admin-username
```

If nobody remembers the admin username, or no admin is left, list the admin accounts (use the `POSTGRES_USER` and `POSTGRES_DB` values from the PC's private `.env`), then run the reset command with the username shown:

```powershell
docker compose exec postgres psql -U <db user> -d <db name> -c "SELECT username, is_active FROM users WHERE role='admin';"
```

Notes:

- `resetAdminPassword` only changes users whose role is admin. A technician or supervisor username is refused and nothing changes; reset those from the web app's **Technician List** (**Set new password**).
- Every run, successful or refused, is recorded in the audit log (`admin_create_cli` / `admin_password_reset_cli`) without the password.
- Without a terminal (automation), the password is read from the `ADMIN_PASSWORD` environment variable instead of prompting; never leave it in a shared transcript or in `.env`.

Before inviting external users, test `https://app.example.com/` and `https://app.example.com/api/health` from a device **outside the client's Wi-Fi**. Check login and authorization, photo upload, a real phone's PWA installation/offline save/reconnect, backup and restore, and that only ports 80/443 reach the proxy. Verify Windows reboot recovery. A local `https://localhost/` success is insufficient evidence of public access.

## Current release blockers

> **Updated 2026-10-22:** superseded by `docs/DEPLOY_TO_CLIENT_PC.md` and `docs/deployment-day/`. `Prepare-ClientPC.ps1` now creates the folders and `.env` (with a generated password and the tunnel token), `Backup-All.ps1` covers backups, and the client PC installs from the `client-release` branch. The tunnel route was proven end to end on `app.mfets.com` from the dev PC; only the client-PC install itself is still open. The paragraph below is the earlier status, kept for history.

The existing startup script only runs Compose and does not perform prerequisite setup or validate secrets. The named production tunnel path is now implemented (`cloudflared` service, Compose `tunnel` profile) but not yet acceptance-tested against a real client Cloudflare account and PC. Domain purchase, Cloudflare Tunnel creation, client PC checks, production HTTPS, and phone acceptance have not been performed by this documentation change.

See `docs/architecture/06-deployment-runbook.md` for operations and `docs/architecture/05-backup-and-recovery.md` for backup/restore details.
