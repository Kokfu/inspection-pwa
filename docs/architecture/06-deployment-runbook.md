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
