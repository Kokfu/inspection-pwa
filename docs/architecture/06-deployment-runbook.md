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

## Slice A ownership upgrade precondition (2026-09-18)

Before deploying this upgrade, bring **every device and browser profile online** on
the existing release. Have each technician review drafts, submit completed work,
and sync all pending/failed work and evidence until the server confirms it. Verify
there is no unsynced work left on any device; postpone deployment if a device is
unavailable or work cannot be reconciled. Do not clear browser storage or uninstall
the PWA to resolve a sync failure.

After deployment, each technician must sign in online and refresh jobs/reference
data once before returning to the field. The upgrade uses a separate IndexedDB
workspace per user. A first launch while offline cannot establish ownership of the
old shared cache: the user's new workspace can appear empty, with old jobs, drafts
and Pending items absent from the UI and sync queue. This is quarantine, not deletion.
Reconnect and complete the ownership-scoped refresh to recover attributable work.
Once bootstrapped, that user's cached workspace remains available offline.

Legacy work on jobs the technician did **not create**, and work on NULL-creator or
otherwise unattributable jobs, remains quarantined even after refreshing. It is not
automatically assigned to the currently signed-in technician. Resolve such work before
deployment while the old release can still sync it; if discovered afterward, preserve
the original device and storage and arrange an authorized recovery review. Logging in
as another technician or clearing storage is not a recovery procedure.

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

## Validation Checklist Results (2026-09-11)

Point-by-point pass of the on-premise-windows-deployment skill's Validation Checklist against
this repo's actual state, run on the developer's machine (`DESKTOP-1S3EQ0P`) against the live
`docker-compose.yml` stack (`inspection_pwa-api-1`, `inspection_pwa-postgres-1`,
`inspection_pwa-proxy-1`) — **not** the client's physical PC, which does not exist yet. Every item
below states which part of that distinction applies.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `docker compose config` passes | **PASS** | `docker compose config --quiet` exits 0 with no output. |
| 2 | Only the proxy publishes host ports | **PASS** | Resolved config (`docker compose config`) shows a `ports:`/`published:` block only inside the `proxy` service (lines ~62-84 of the resolved output); `api` (lines 2-39) and `postgres` (lines 40-61) have none. Confirmed against the live containers: `docker port inspection_pwa-postgres-1` and `docker port inspection_pwa-api-1` both return nothing; `docker port inspection_pwa-proxy-1` returns `80/tcp -> 0.0.0.0:80`, `443/tcp -> 0.0.0.0:443` (plus the `::` IPv6 equivalents). |
| 3 | PostgreSQL does not publish host port 5432 | **PASS** | Same `docker port inspection_pwa-postgres-1` call above returns no output — no host binding for 5432 or any other port. `docker-compose.yml`'s `postgres` service (lines 52-68) has no `ports:` key at all, only `networks: [internal]` (declared `internal: true`, so it has no route to the host/public network by construction). |
| 4 | Caddy serves the frontend | **PASS** | `curl -sk https://localhost/` returns `HTTP/1.1 200 OK`, `Content-Type: text/html; charset=utf-8`, and the response body is the built Vite/React shell (`<title>Inspection PWA</title>`, hashed `<script src="/assets/index-DUvsnMcL.js">` / `<link href="/assets/index-ZPSo9B-t.css">`, `<div id="root"></div>`) — not a placeholder or proxy error page. |
| 5 | `/api/health` works through Caddy | **PASS** | `curl -sk https://localhost/api/health` returns `200` with body `{"status":"ok","service":"inspection-api","phase":"foundation"}` — reachable through Caddy's `/api` reverse-proxy rule, and the body reveals no secrets, stack traces, or internal paths (matches the Health Checks rule in `backend-api-security/SKILL.md`). |
| 6 | Runtime bind mounts point outside Git | **PASS** | `.env` (git-ignored — `git check-ignore -v .env` confirms; `git ls-files .env` returns nothing) sets `INSPECTION_UPLOADS_PATH`, `INSPECTION_API_LOGS_PATH`, `INSPECTION_PROXY_LOGS_PATH`, `INSPECTION_RESTORE_STAGING_PATH`, `INSPECTION_OPERATIONAL_PATH` all under `C:/InspectionSystem/runtime/...`, outside the repo root (`C:\PWA_OfflineRecordWebApp`). Confirmed against the *live* containers, not just the file: `docker inspect inspection_pwa-api-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'` shows `C:/InspectionSystem/runtime/uploads -> /srv/uploads`, `.../logs/api -> /srv/logs`, `.../restore-staging -> /srv/restore-staging`, `.../operational -> /srv/operational`; `inspection_pwa-proxy-1`'s mounts show `.../logs/proxy -> /var/log/caddy` and `.../releases -> /srv/releases`. `docker-compose.yml`'s defaults (lines 19-20, 44-47) point the same way even with no `.env` present. |
| 7 | Data survives container recreation | **PARTIAL — proxy recreation only; does not cover the data-owning containers** | Picked `proxy` per the brief's own example. Baseline before recreation: `SELECT count(*) FROM inspection_jobs;` → `54`; `find .../uploads -type f \| wc -l` → `47` files, SHA-256 of every file captured. Ran `docker compose up -d --no-deps --force-recreate proxy` (proxy container recreated — new container ID, ~16s old immediately after; `api`/`postgres` untouched, same age as before). After recreation: `inspection_jobs` count still `54`; uploads still `47` files; a full `diff` of the before/after SHA-256 file lists is empty (byte-identical). `/api/health` and `/` both still return `200` through the recreated proxy. **This is not, by itself, valid evidence that the checklist item is satisfied.** `proxy` owns neither the PostgreSQL data (the `postgres_data` named volume, mounted only into the `postgres` container) nor the uploads bind mount (mounted only into the `api` container) — a broken `postgres_data` volume or a misconfigured uploads mount would still pass this exact check, because the containers that actually own that data were never recreated. It only proves that recreating an unrelated container cannot corrupt data it never touches, which is already guaranteed by Docker's per-container filesystem isolation and doesn't need a live drill to establish. It also is not a read-only step against the container itself — `--force-recreate` replaces the `proxy` container (new container ID) and briefly interrupts traffic through it, even though it never touches Postgres or the uploads bind mount. Per the brief's own instruction ("if validating this requires anything beyond `docker compose up -d --no-deps --force-recreate proxy` ..., stop and say why instead of improvising"): a real test of this item would mean recreating `postgres` (to prove the named volume survives) and/or `api` (to prove the uploads bind mount survives on the container side), both of which are outside what this task authorized without checking first — flagged here rather than done unasked. |
| 8 | Backups are created outside the database container | **PASS (structural, from STEP 4.2 slice 1), wording corrected, copy-failure gap closed** | `scripts/Backup-Database.ps1` runs `pg_dump` to a temp file *inside* the `postgres` container's own filesystem (`/tmp/inspection-<timestamp>.dump`, line ~41) first, then `docker compose cp` copies those exact bytes out to the host (`$OutputRoot`, default `C:\InspectionSystem\runtime\backups\postgres`, line ~46). The finished backup artifact ends up host-only, but for the window between those two lines it exists solely inside the container. A second review round found the original script did not check `docker compose cp`'s exit code before deleting that container-local copy - a silently-failed copy would have deleted the run's only good copy before anyone noticed. Fixed: every native command in this path (`printenv` credential resolution, `pg_dump`, `docker compose cp`) now checks its exit code and throws immediately on failure, and the container-local temp file is only removed *after* the host copy is verified to exist and be non-empty - a failed copy leaves the container-local dump in place for manual recovery instead of destroying it. Same round also fixed a separate defect: the script previously read `$env:POSTGRES_USER`/`$env:POSTGRES_DB` from the host shell, which Compose's `.env` never populates (only the container's own environment gets those values), so a normal run passed `pg_dump -U -d` with both null; it now resolves them from the running container via `printenv`. `scripts/Backup-Uploads.ps1` archives the host-mounted uploads bind mount directly and never reaches into a container, so it doesn't share this window. Both write a manifest (`sha256`, size, file count) alongside the backup — see `docs/architecture/05-backup-and-recovery.md`'s "Implementation Status" section. |
| 9 | Restore process is documented | **PASS, with two defects found and fixed by review** | `docs/architecture/05-backup-and-recovery.md`'s "Restore Outline" and "Implementation Status" sections describe the flow; `scripts/Restore-Database.ps1` and `scripts/Restore-Uploads.ps1` implement it — both verify the manifest checksum before restoring, both refuse to target the live runtime by default, and both were proven end-to-end on 2026-09-11 per `HANDOVER.md`'s STEP 4.2 entry. A second review round found and fixed two real defects in these refusal guards themselves — see the "Second review round" note below for both, with reproduction evidence. |
| 10 | Windows startup and sleep policy are documented | **PARTIAL — documented, not verified on real hardware** | `docs/architecture/06-deployment-runbook.md`'s "Windows Startup Behavior" section (lines 15-24) lists what must be documented and tested: Docker Desktop start-on-login, Compose-after-Docker-ready ordering, sleep/hibernation disabled during service hours, Windows Update/restart policy, power-loss/BIOS-UEFI recovery. **None of this is yet configured or verified anywhere, including on this development machine** — checked as a proxy for "has anyone actually turned this into a real setting": `Get-Content "$env:APPDATA\Docker\settings-store.json"` on `DESKTOP-1S3EQ0P` shows `"AutoStart": false` (Docker Desktop does NOT start at login here), and `powercfg /query SCHEME_CURRENT SUB_SLEEP` shows the AC "Sleep after" timer active at `0x00000e10` (3600s = 1 hour) rather than disabled. No Windows Scheduled Task exists to start the Compose stack (`Get-ScheduledTask` has no Docker/Inspection/Compose-named entry among its 195 tasks). This is expected and not a defect — **the client's actual physical PC does not exist yet in this project**, so there is nothing to configure yet; the runbook section is the correct target state to apply once that hardware is provisioned, but it must be re-verified against the real client PC (its own `powercfg`, Docker Desktop settings, and a real reboot test) before go-live. Treat this line item as documentation-complete / hardware-verification-pending, not as a completed operational control. |

**Honesty note on scope:** items 1-6 and 9 are evidence gathered against the actual running
dev-machine stack today and are true PASSes, not restatements of what the docs claim. Item 8 is a
real structural PASS with one wording correction (see above). Items 7 and 10 are the two places
where the initial pass overclaimed or conflated "documented" with "verified" — both are now marked
PARTIAL with the specific gap named, rather than presenting either the runbook's prose or an
insufficiently-scoped test as proof.

**Second review round (2026-09-12) — six defects found, all fixed and re-verified.** Two rounds of
review after the initial validation pass each found real defects in the backup/restore scripts
themselves, not just in this document's wording. All six are fixed in the current working tree:

1. **`scripts/Restore-Uploads.ps1` live-mount guard — lexical comparison was never enough.**
   First fix compared `[System.IO.Path]::GetFullPath(...)` directly, missed the `\\?\` /
   `\\?\UNC\` extended-length path prefix. Second review found the deeper problem: *any*
   lexical string compare misses an NTFS junction, a `subst`-mapped drive letter, or an 8.3
   short name that resolves to the exact same physical directory as the live path while its
   string form differs — a cold junction fixture bypassed the guard and would have extracted
   into the live folder. Fixed by resolving both sides to their canonical filesystem identity via
   `GetFinalPathNameByHandle` (`Get-CanonicalDirectoryPath`/`Get-CanonicalComparisonPath`,
   `scripts/Restore-Uploads.ps1:63-128`) — the same API Windows itself uses to follow reparse
   points and subst mappings when opening a path for real I/O — walking up to the nearest
   existing ancestor when the destination doesn't exist yet, and failing closed (throwing) if no
   identity can be established. Reproduced clean: a `\\?\` alias, a `subst`-mapped drive letter,
   and a real NTFS junction pointing at the live path are all now refused; a legitimate staging
   restore, a relative path, and an empty-string destination all still behave correctly. 8.3
   short-name aliasing was not independently reproduced in this environment (`fsutil 8dot3name`
   needs admin rights not available here), but is covered by the same resolution mechanism.
2. **`scripts/Restore-Database.ps1` forbidden-container check — name-only, ID bypassed it.**
   The hard block on the live runtime container compared only the literal name
   `inspection_pwa-postgres-1`; Docker also accepts that container's full or unique-prefix ID as
   a target for `docker exec`/`docker cp`, so passing the live container's actual ID (with
   `-UseExistingContainer` + the acknowledgement flag) reached the copy/restore calls. Fixed by
   resolving both the requested target and the forbidden name to their canonical Docker container
   ID via `docker inspect` before comparing (`Resolve-DockerContainerId`,
   `scripts/Restore-Database.ps1:29-40`). Reproduced: the live container's full ID and a
   12-character abbreviated prefix are both now refused before reaching any copy/exec call.
3. **`scripts/Restore-Database.ps1` — a failed restore was reported as complete.** A nonzero
   `pg_restore` exit only produced a `Write-Warning`, after which the script unconditionally
   printed "Restore complete" and returned success. Fixed: both `docker cp` (line ~122) and
   `pg_restore` (line ~128) now throw immediately on any nonzero exit, so "Restore complete" is
   only ever reached after a genuinely successful restore. Reproduced against a disposable
   container: an intentionally invalid dump makes `pg_restore` exit 1 and the script now throws
   instead of printing success; a genuinely valid dump still restores and reports completion
   correctly.
4. **`scripts/Backup-Database.ps1` — `pg_dump` ran with null credentials in a normal shell.**
   The script read `$env:POSTGRES_USER`/`$env:POSTGRES_DB` from the host PowerShell process, but
   Compose's `.env` only feeds substitution inside `docker-compose.yml` — it never populates the
   host shell's own environment, so both were empty in a normal run. Fixed: resolves the values
   the live container is actually running with via `docker compose exec -T postgres printenv ...`
   (`scripts/Backup-Database.ps1:23-35`), throwing if either can't be resolved. Reproduced against
   a disposable Postgres container with a confirmed-empty host shell environment: the fixed script
   correctly resolves `testuser`/`testdb` from the container and produces a valid dump.
5. **`scripts/Backup-Database.ps1` — a silent copy failure would have deleted the only copy.**
   Covered under item 8 above.
6. **`scripts/Backup-Uploads.ps1` — hidden files silently omitted, and undercounted to match.**
   `Compress-Archive`'s `"*"` wildcard expansion skips Hidden-attribute items, and the separate
   `Get-ChildItem -Recurse -File` used for the manifest's `fileCount` did too — so both the
   archive and its own manifest agreed on an undercount, hiding the loss. Worse, even an explicit
   `-LiteralPath` to a hidden file fails inside `Compress-Archive`'s own implementation (it reads
   entry metadata via an internal `Get-Item` call without `-Force`), so simply enumerating with
   `-Force` and handing the paths to `Compress-Archive` was not sufficient either. Fixed by
   building the zip directly with `System.IO.Compression.ZipFile`
   (`scripts/Backup-Uploads.ps1:15-40`), driven by one `-Force` enumeration that both archives and
   counts the identical file list, including hidden files at any depth. Reproduced: a fixture with
   one visible file, one Hidden-attribute file, and a nested subfolder now archives and counts all
   three (previously archived/counted 1), and round-trips correctly through
   `Restore-Uploads.ps1` with the hidden file and folder structure intact.

A prior draft of this note also had two stale file:line citations (`Restore-Uploads.ps1:36-48`)
left over from before the junction-fix rewrite moved that code — the citations above were taken
fresh from the current file contents rather than copied forward.
