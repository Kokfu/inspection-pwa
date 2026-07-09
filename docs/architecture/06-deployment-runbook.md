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

Practical strategy:

1. Build each frontend release into a versioned static release directory.
2. Deploy the new release only after all referenced hashed assets are present.
3. Keep at least the previous release's hashed assets available during the service-worker update window.
4. Set long immutable cache headers only on hashed assets.
5. Set `no-cache` on HTML so browsers revalidate it.
6. Do not prune old release asset directories during the same deployment that introduces new HTML.
7. Run the stale-cache upgrade regression test before pruning old assets.

## Upgrade Outline

```text
announce maintenance window
-> run backup
-> record current image tags
-> deploy new images
-> run migrations
-> run health checks
-> run PWA stale-cache check
-> keep rollback path available
```

