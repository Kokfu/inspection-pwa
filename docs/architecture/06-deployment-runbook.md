# Deployment Runbook

## Production Prerequisites

- Client-owned production domain.
- Static public IPv4, not CGNAT.
- DNS A record points to the static public IPv4.
- Router forwards TCP 80 and 443 to the Windows PC.
- Router forwarding targets a stable LAN IP through DHCP reservation or static IP.
- Windows PC remains powered on, connected, and awake during service hours.
- Docker Desktop is installed and licensed appropriately.
- PostgreSQL is not exposed publicly.
- API authentication is complete before public deployment.

## Windows Startup Behavior

Document and test:

- Docker Desktop start behavior after Windows login or reboot.
- Docker Compose startup only after Docker is ready.
- PC sleep and hibernation disabled during service hours.
- Windows update/restart policy.
- Power-loss recovery expectations, including BIOS/UEFI restore-on-power options where available.

## Temporary HTTPS Testing

Temporary phone/PWA testing must use a stable HTTPS origin distinct from final production access. Options include a temporary tunnel or temporary test domain.

`http://localhost` is only acceptable on the host PC. `http://LAN-IP` is not a valid production PWA phone test.

This is an interim testing path only. It is not the production HTTPS path — that requires the
client's own domain, static public IPv4, and router port-forwarding per the Final Hosting Model
above, and is a separate, later deployment item.

### Prerequisite

Install `cloudflared` on the Windows PC:

```powershell
winget install --id Cloudflare.cloudflared -e
```

No Cloudflare account, domain, or DNS record is required for this path — it uses Cloudflare's
anonymous "quick tunnel" mode.

### Running the tunnel

With the compose stack already up (`docker compose ps` shows `proxy` running):

```powershell
.\scripts\Start-DevTunnel.ps1
```

The script confirms `cloudflared` is installed and the `proxy` service is running, then starts
`cloudflared tunnel --url https://localhost:443 --no-tls-verify --http-host-header localhost` and
prints the assigned
`https://<random-words>.trycloudflare.com` URL once cloudflared reports it. It does not touch the
Caddy configuration or `PUBLIC_HOSTNAME` — cloudflared connects to Caddy's existing HTTPS listener
on port 443, and Cloudflare's edge is what terminates the publicly-trusted certificate the phone
sees. Caddy's plain port-80 listener is not used: the Caddyfile's site block is implicit-HTTPS, so
port 80 only ever issues a redirect to `https`, never serves content — pointing a tunnel at it
would loop. `--no-tls-verify` covers only the cloudflared-to-Caddy leg, which uses Caddy's
local/self-signed certificate for `localhost`; it has no effect on the publicly-trusted certificate
Cloudflare's edge presents to the phone. `--http-host-header localhost` is needed because
cloudflared otherwise forwards the public tunnel hostname as the Host header, and Caddy's site
block only matches `Host: localhost` — any other Host gets Caddy's empty default response.

### What the URL is good for

The `https://*.trycloudflare.com` URL is a real, publicly-trusted HTTPS origin, so it satisfies the
"stable HTTPS origin" requirement for phone testing that plain `http://LAN-IP` cannot. Use it to run
the offline-first-pwa skill's Required Acceptance Test from an actual phone: open the URL, confirm
Offline Ready, add to the home screen, then turn off networking and confirm the installed PWA still
works and queues Pending Sync records.

### Warnings

- **Session-scoped only.** The tunnel exists only while `cloudflared` is running in the foreground.
  Stop it with Ctrl+C as soon as you are done testing — do not leave a public tunnel to a dev/client
  PC running unattended.
- **No new exposure.** The app is still fully behind its existing login/session authentication over
  the tunnel. This path does not bypass auth or serve anything auth would otherwise block; it only
  changes how the browser reaches Caddy's existing HTTPS listener.
- **The URL is not a secret, but it is not a fixture either.** It is regenerated on every run and
  expires when the tunnel stops. Never commit a specific `trycloudflare.com` URL anywhere in the
  repo or in documentation — it will be stale and misleading the next time anyone reads it.

## Stale-Cache Update Strategy

Vite emits hashed JavaScript and CSS assets. Existing installed PWAs may hold cached HTML that references older hashed chunks. Updates must avoid deleting the assets that old HTML references.

Production uses a persistent, content-addressed release store:

```text
C:\InspectionSystem\runtime\releases\
  active-release
  release-order
  current\                 # active shell plus retained hashed assets
  versions\
    sha256-<release-a>\     # complete rollback-capable release
    sha256-<release-b>\     # complete rollback-capable release
```

The proxy image stores its build at `/srv/image-release`; it does not serve that
disposable path directly. Before Caddy starts, `publish-web-release.sh` copies a
new content-addressed release into the Windows `releases` bind mount, validates
the release, constructs `current` from the active shell plus every retained
release's `/assets`, and then starts Caddy. Consequently, all assets exist before
the new HTML is exposed, and proxy container replacement cannot remove the only
copy of the previous release.

`INSPECTION_WEB_RELEASE_RETENTION` defaults to `2` and rejects values below two.
After a successful publish, both `versions` and `release-order` are pruned to the
newest configured window. This keeps the active and immediately previous release
by default without accumulating arbitrary stale files. Increase the value only
for an explicitly approved longer rollback window.

Caddy applies `public, max-age=31536000, immutable` only to existing `/assets/*`
files. A missing asset is a real 404 and never receives the navigation fallback.
All other shell responses use `no-cache`, including `index.html`, navigation
fallbacks, and `sw.js`.

### Publish flow

From the repository on the client PC:

```powershell
docker compose config --quiet
docker compose build proxy
docker compose up -d --no-deps proxy
docker compose exec -T proxy cat /srv/releases/active-release
```

The final command records the new content-addressed release ID. Run the stale
cache regression test before treating the release as accepted. The bind mount is
populated automatically by the replacement proxy container before Caddy starts.

### Immediate rollback

Read the two retained IDs from
`C:\InspectionSystem\runtime\releases\release-order` (oldest to newest). Select
the previous ID for one proxy recreation:

```powershell
$env:INSPECTION_WEB_ACTIVE_RELEASE = "sha256-<previous-release>"
docker compose up -d --no-deps --force-recreate proxy
docker compose exec -T proxy cat /srv/releases/active-release
```

Keep that environment setting for subsequent Compose operations while rollback
is active. To return to the image's release, remove the process variable and
recreate the proxy:

```powershell
Remove-Item Env:INSPECTION_WEB_ACTIVE_RELEASE
docker compose up -d --no-deps --force-recreate proxy
```

Rollback fails closed if the requested ID is malformed or outside the retained
window. It does not alter PostgreSQL, uploads, API contracts, or business data.

## Upgrade Outline

```text
announce maintenance window
-> run backup
-> record current image tags
-> validate Compose and build new images
-> start proxy (publish retained web release before Caddy starts)
-> run migrations
-> run health checks
-> run PWA stale-cache check
-> keep rollback path available
```
