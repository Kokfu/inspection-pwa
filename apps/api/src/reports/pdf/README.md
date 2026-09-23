# Standalone report PDF engine — R3

Not wired to `finalServiceReport`, view models or routes. R2 must HTML-escape customer
values, inject `reportFontFaceCss()`, and use `"Noto Sans", "DejaVu Sans", sans-serif`.
The engine accepts controlled report HTML, not arbitrary third-party documents.
JavaScript is disabled and request interception aborts everything except data URLs.
These restrictions plus escaped input are the rationale for Chromium's required
`--no-sandbox` launch flag; the container still runs as `node`.

One shared browser, two render slots, FIFO queue. The timeout starts on admission
(queue waiting is excluded), and includes launch, page creation, load, printing and
the single disconnected-browser retry. A timed-out operation retains its slot until
page cleanup finishes. `closePdfEngine()` drains admitted work and closes Chromium;
new requests during shutdown fail, and requests after shutdown can relaunch it.
The caller should use this hook on service shutdown when R2 wires the engine in.

## Verification, 2026-09-18

- Local Chromium: Chrome/151.0.7922.34, verified executable:
  `%LOCALAPPDATA%\ms-playwright\chromium-1234\chrome-win64\chrome.exe`.
- Real PDF catalog contains `/Dests`; links contain `/Dest /sys-1` etc.
  Parser/test output: `{ 'sys-1': 1, 'sys-2': 2, 'sys-3': 3 }`.
- Eight engine tests pass, zero skips: landscape media box; per-page margin counters;
  60-row repeated table heading; embedded nonzero glyphs for ✓ ✗ ◯; destinations;
  disabled JavaScript and blocked HTTP/file content; timeout and observed maximum
  of two concurrent pages for three requests; disconnected-browser recovery;
  nine-page sample; missing executable failure.
- API typecheck/build PASS. Historical matrix 20/20, V6 evidence 9/9,
  Wet Chemical definitions 2/2, V7 contracts + env 11/11, existing final report 18/18.
- Disposable Postgres: V6 integration 1/1; V7 integration set 10/10. Zero skips.
- Web typecheck/build PASS; stale-evidence 1/1. Existing large-bundle warning remains.
- Historical protected files match `e30c649`; `git diff --check` passes.
- Rebuilt image: `inspection-pwa-r3-pdf-engine`, Alpine Chromium 152.0.7977.82.
  Container runs as `node`, `--network none`, no production mounts or DB access.

Container stdout:

```text
Rendered /tmp/mfe-service-report-template.pdf: 9 pages, 329132 bytes
```

Image size compared with `inspection_pwa-api:latest`:

| Docker metric | Before | After | Delta |
|---|---:|---:|---:|
| `image inspect .Size` | 109,712,299 B | 448,682,534 B | +338,970,235 B |
| `image ls` disk usage (rounded) | 385 MB | 1.59 GB | about +1.21 GB |

Docker Desktop's containerd image store reports different metrics above; do not
mix them. The current Alpine Chromium dependency set is larger than the old
150–300 MB estimate in the template plan. Image footprint is an explicit R2/release
deployment consideration, not a rendering failure. No production image was replaced.

Outside the PDF folder: requested CLI, API package.json/lock, env.ts, Dockerfile;
also HANDOVER.md as required by the task-brief skill. No R1-owned file was edited.
Existing npm scripts were preserved; only `test:report-pdf-engine` was added.

## Reproduce in PowerShell

```powershell
cd C:\PWA_OfflineRecordWebApp
$env:REPORT_CHROMIUM_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1234\chrome-win64\chrome.exe"
if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Chromium missing' }
npm --prefix apps/api ci --include=dev
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm --prefix apps/api run test:report-pdf-engine
npm --prefix apps/api run test:historical-matrix
npm --prefix apps/api run test:v6-evidence
npm --prefix apps/api run test:wet-chemical-definition
npm --prefix apps/api run test:final-report
Push-Location apps/api
try { node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts } finally { Pop-Location }

# Fresh disposable DB; a occupied 55432 is an error, never reuse an unknown DB.
$r3Db = 'r3-pdf-gates-' + [guid]::NewGuid().ToString('N')
docker run -d --rm --name $r3Db -e POSTGRES_DB=inspection -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=r3-disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE) { throw 'Disposable DB creation failed' }
try {
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    docker exec $r3Db pg_isready -U inspection_app -d inspection
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'Disposable DB not ready' }
  $env:NODE_ENV='test'
  $env:DATABASE_URL='postgres://bogus:bogus@10.255.255.1:9999/nope'
  $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:r3-disposable-test-only@127.0.0.1:55432/inspection'
  Push-Location apps/api
  try {
    npm run test:v6-integration
    if ($LASTEXITCODE) { throw 'V6 gate failed' }
    node --import tsx --test --test-concurrency=1 src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts
    if ($LASTEXITCODE) { throw 'V7 gate failed' }
  } finally { Pop-Location }
} finally { docker rm -f $r3Db }
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
npm --prefix apps/web run test:v7-stale-evidence
docker build -f apps/api/Dockerfile -t inspection-pwa-r3-pdf-engine .
docker run --rm --network none inspection-pwa-r3-pdf-engine node dist/cli/renderTemplateSample.js
git diff --check
git status --short
```

P0 remaining: 0. P1 remaining: 0. P2: image footprint should be reviewed at deployment.
Ready for Sol review; no staging or other Git mutations performed.
