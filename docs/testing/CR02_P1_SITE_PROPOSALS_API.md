# CR-02 Phase 1 — Manually typed site + Admin approval (API + database only)

Date: 2026-10-11 · Branch `phase-8e-client-demo-polish` · Level 2 (new stored data, auth, idempotency, concurrency) · No web change · No Docker Compose.

**Result:** built and green. **P0: 0 · P1: 0 · P2: 4 (below).** The web UI is Phase 2.

## What it does

A technician creating a service visit may send `newSite: {displayName, address?}` instead of `siteId`.
The server creates that site **inactive** (so every existing site list keeps hiding it), creates the visit against it, and records a proposal.
An Admin (role `admin` or `supervisor`) approves it (the site becomes active and appears everywhere) or rejects it (it stays hidden; the technician can read the reason).
The visit proceeds either way. Report approval is not blocked while a site is pending.

## Owner decisions applied (D1–D7)

| | Decision | How |
|---|---|---|
| D1 | admin **and** supervisor can decide | `requireRoleAudited(database, "admin", "supervisor")`; technicians get 403 |
| D2 | same pending name is reused | a pending site of the same normalised name (any technician, same customer) is reused; no second proposal |
| D3 | rejection note visible to the technician | `siteApproval: {status:"rejected", note}` on the job DTO (the note of an *approval* is never exposed) |
| D4 | report approval not blocked | nothing in the report/approval path reads the proposal |
| D5 | approve exactly as typed | the decision body accepts only `requestId`, `decision`, `note`; approve flips the stored site active and never takes a name from the request |
| D6 | own pending sites are not in the site list | every existing site read filters `is_active = true`; unchanged |
| D7 | "Add New Customer" unchanged | not touched |

## Migration `apps/api/migrations/050_customer_site_proposals.sql` (additive; no change to `customer_sites`; no backfill)

```sql
CREATE TABLE customer_site_proposals (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  site_id UUID NOT NULL UNIQUE REFERENCES customer_sites(id) ON DELETE RESTRICT,
  job_id UUID,                                              -- audit only, no FK (as 048)
  submitted_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_role TEXT NOT NULL CHECK (submitted_by_role = 'inspector'),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_display_name TEXT NOT NULL CHECK (length(proposed_display_name) BETWEEN 1 AND 160 AND proposed_display_name = btrim(proposed_display_name)),
  proposed_address TEXT CHECK (proposed_address IS NULL OR length(proposed_address) BETWEEN 1 AND 500)
);
-- indexes on customer_id, submitted_by_user_id; append-only triggers: UPDATE/DELETE and TRUNCATE are refused.

CREATE TABLE customer_site_proposal_decisions (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES customer_site_proposals(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note TEXT CHECK (note IS NULL OR length(btrim(note)) BETWEEN 3 AND 500),
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by_role TEXT NOT NULL CHECK (decided_by_role IN ('admin', 'supervisor')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  request_id UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  UNIQUE (proposal_id, sequence)
);
-- indexes on proposal_id, request_id; the same append-only triggers.
```
Registered in `apps/api/src/db/migrations.ts` (replay marker `to_regclass('public.customer_site_proposals')`). Proven: cold install, re-run ×2 keeps data,
dropping both tables and re-running recreates them empty; `customer_sites` still has exactly its 7 columns.

## API

* `POST /api/inspection-jobs/service-visits` — body now takes **exactly one** of `siteId` or `newSite` (unknown keys still rejected, also inside `newSite`).
  Name: trim + collapse whitespace, 1..160. Address: optional, ≤500. Control characters, newlines, zero-width/bidi characters are refused.
  New error bodies: `403 NEW_SITE_NOT_ALLOWED` (an admin typing a site), `409 SITE_ALREADY_EXISTS {existingSiteId}` (an **active** site already has that name; nothing is written).
* `GET /api/manager/site-proposals?status=pending|approved|rejected`, `GET /api/manager/site-proposals/:id`,
  `POST /api/manager/site-proposals/:id/decision {requestId, decision, note?}`.
  Reject needs a 3..500 note. Same `requestId` + same body → 200 replay; same `requestId`, different body → 409 `SITE_PROPOSAL_DECISION_REQUEST_REUSED`;
  a second decision under a new id → 409 `SITE_PROPOSAL_ALREADY_DECIDED`. Approve re-checks that no active site took the name meanwhile (409 `SITE_NAME_CONFLICT`)
  and that the customer is active (404 `CUSTOMER_NOT_FOUND`).
* Job DTO: new additive key `siteApproval: null | {status:"pending"|"approved"|"rejected", note?}` on the canonical job (`GET /inspection-jobs/:id`, the create response)
  **and** on the technician list (so the Phase 2 UI can show a chip offline from the cached list). `null` for every visit whose site was never typed.

### How the transaction is built (`apps/api/src/jobs/serviceVisits.ts`)
One transaction: advisory lock on (actor, requestId) → replay check → customer row `FOR UPDATE` (the siteId path keeps `FOR SHARE`, byte-identical SQL) →
advisory lock on (customer, normalised name) → active same-name site ⇒ 409 / pending same-name site ⇒ reuse / else insert inactive site + proposal + audit →
the unchanged snapshot + job insert. If the job insert hits the idempotency conflict, the whole transaction is rolled back (no orphan site) and the winning visit is read outside it.
Lock order is customer → name → site everywhere, so the approve route (proposal → customer → site) cannot deadlock with visit creation.

## Files changed

* `apps/api/migrations/050_customer_site_proposals.sql` — the two tables (above).
* `apps/api/src/db/migrations.ts` — +10 lines: register 050.
* `apps/api/src/inspections/siteProposal.ts` — pure status derivation, `siteApproval`, text rules, name key, loaders, the `siteApproval` SQL fragment.
* `apps/api/src/jobs/serviceVisits.ts` — `newSite` input type, role gate, typed-site resolution, replay compare by name, error `details`; the `siteId` path is unchanged.
* `apps/api/src/routes/inspectionJobs.ts` — parser (one of `siteId`/`newSite`), passes the actor role, includes `existingSiteId`, adds `siteApproval` to the canonical and list queries.
* `apps/api/src/routes/siteProposals.ts` — the three Admin routes.
* `apps/api/src/server.ts` — +2 lines: import and mount.
* `apps/api/package.json` — +1 line: `test:site-proposals`.
* `apps/api/src/inspections/siteProposal.test.ts` — 6 no-database tests (derivation, note visibility, text rules, parser, role gate before any query).
* `apps/api/src/routes/siteProposals.integration.test.ts` — 16 scenarios on the disposable DB.
* `docs/testing/CR02_P1_SITE_PROPOSALS_API.md` — this file.

## Web-parser finding (step 6)

No web file was changed or needed. The web types a job as `InspectionJob` (structural) and reads jobs with loose checks only (`hasJobId` checks `id`;
the list is cast), and the offline job cache stores the payload as received. An extra `siteApproval` key is accepted by every web read path. Phase 2 should add
the key to `InspectionJob` in `apps/web/src/jobs/jobTypes.ts`.

## Tests

Disposable Postgres `cr02-site-proposals-verify` on `127.0.0.1:55432` (host TCP readiness checked). Never the runtime database.

| Check | Result |
|---|---|
| `siteProposals.integration.test.ts` | **17/17 PASS** (16 scenarios + the test), 0 skipped |
| create: 1 inactive site, 1 proposal, visit points at it, snapshot site = typed text, 2 audit rows, snapshot keys unchanged | PASS |
| pending site absent from technician/admin site lists, manager active-site list and the old `siteId` path (404 `SITE_NOT_FOUND`) | PASS |
| replay (same body, even re-spelled name) → same visit, nothing created; different body or `siteId` under the same request → 409, no orphan site | PASS |
| 3 concurrent identical submits → 1 visit/1 site/1 proposal; 2 technicians typing one name at once → 1 site, 1 proposal, 2 visits (first submitter's address kept) | PASS |
| active same-name site (3 spellings) → 409 `SITE_ALREADY_EXISTS` with `existingSiteId`, nothing written | PASS |
| validation: both/neither, non-object, unknown keys, blank, missing/number name, 161/501 chars, newline/tab/zero-width/bidi, null — all 400; exactly 160 and 500 accepted | PASS |
| admin typing a site → 403 and nothing written; supervisor → 403; anonymous → 401; admin's existing `siteId` path still 201 | PASS |
| review routes: 401, technician 403, admin and supervisor list/read; bad status/uuid 400; unknown 404 | PASS |
| decision parser: 9 bad bodies incl. name/address edit attempts → 400, nothing stored | PASS |
| approve: active + visible everywhere, supervisor recorded, fingerprint never sent, replay 200, reused id 409, second decision 409 ×2, one decision row, audit row, next visit by id works, retyping the name → 409 pointing at it | PASS |
| reject: note reaches the technician (job + route), site stays hidden, visit loads, retyping a rejected name makes a new pending site | PASS |
| concurrent approve ×2 + reject → exactly one 201 and two 409, one decision row, site state matches the winner | PASS |
| approve refused when an active site took the name (409, nothing stored, can still be rejected); customer inactive → 404, then approves once active | PASS |
| deleting an unstarted visit leaves the site and proposal intact; the proposal can still be decided | PASS |
| existing `siteId` path: no approval, no proposal, snapshot site keys `address, displayName, id`, 404/400 unchanged | PASS |
| append-only: UPDATE/DELETE/TRUNCATE refused on both tables; site delete blocked by FK; role/padding CHECKs | PASS |
| migration: re-run ×2 keeps data; drop + re-run recreates empty; `customer_sites` columns unchanged | PASS |
| Mutation check (no git stash): with the customer `FOR UPDATE` and both advisory locks removed, "two technicians, same name" **fails**; restored, it passes | PASS |
| `siteProposal.test.ts` (6) + `serviceVisits.test.ts` (27, unmodified) + `managerRouteOrder` (3) + `managerServiceVisits` | **PASS** |
| Existing integration suites, all exit 0 / 0 skipped where checked: `serviceVisits`, `locationProposals`, `managerCustomers`, `customerCreation`, `managerServiceVisitDelete`, `managerServiceHistory`, `managerTechnicianVisits`, `technicianOwnership`, `reportApprovals`, `supervisorRole`, `sectionRemarks` (+web contract), `fireAlarmV6Acceptance`, `seedMasterServiceReport`, CO2/Wet Chemical/Fire Alarm V7, `v7EvidenceRace`, `finalServiceReport` | PASS |
| API `typecheck`, `build`, `historical-matrix` 20, `v6-evidence` 11, wet-chemical definition 2, sprinkler definition 7, service-visits 27, route-order 3, label-overrides 8, V7 contract + config 38 | PASS |
| `git diff --check`; no web file, no Dexie, no `customer_sites` change | clean |

## P0 / P1 / P2

* **P0 0 · P1 0.**
* **P2-1 Reuse keeps the first submitter's address.** If technician B types the same pending name with a different address, B's visit attaches to A's site and A's address wins (D2). B is not told. Phase 2 should show the pending site's stored address after creation.
* **P2-2 Replay compares the name only.** The brief asked for name + address. Because of D2 a reused site's stored address is not the second technician's, so comparing addresses would reject that technician's own legitimate retry. Every other field (customer, systems, cover fields, request id, owner) is still compared.
* **P2-3 A rejected visit cannot be re-pointed to another site in v1.** The visit stays on its rejected (hidden) site; correcting it means deleting the unstarted visit and creating a new one, or an Admin handling it.
* **P2-4 `siteNameKeySql` uses PostgreSQL `\s`** (locale-dependent for exotic spaces) while the typed text is collapsed with the JavaScript `\s`. They agree for ordinary text; an existing site whose stored name has an unusual space may not be matched as a duplicate.

## Limitations

* Visit creation stays online-only (as today); nothing offline was added. No Dexie change.
* The Final Report / PDF read the site from the frozen snapshot, so a pending site's typed name prints as typed; this was not changed and the report path was not exercised by these tests beyond the visit loading.
* No web UI: nothing in the app yet sends `newSite` or shows `siteApproval` (Phase 2).
* No phone, HTTPS or Docker Compose test (not in scope for this phase).

## Reproducible PowerShell block (starts its own disposable DB; works even if `DATABASE_URL` is already set)

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps\web
$env:REPORT_CHROMIUM_PATH=(node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Playwright Chromium is unavailable' }
cd C:\PWA_OfflineRecordWebApp
docker rm -f cr02-site-proposals-verify 2>$null
docker run -d --rm --name cr02-site-proposals-verify -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=replace-with-a-real-secret-outside-git -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not start' }
try {
  $ready = $false
  for ($i=0; $i -lt 60; $i++) {
    docker exec cr02-site-proposals-verify pg_isready -U inspection_app -d phase6_seed_integration | Out-Null
    if ($LASTEXITCODE -eq 0 -and (Test-NetConnection -ComputerName 127.0.0.1 -Port 55432 -WarningAction SilentlyContinue).TcpTestSucceeded) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Disposable PostgreSQL did not become reachable on 127.0.0.1:55432' }
  $env:NODE_ENV='test'
  $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
  cd C:\PWA_OfflineRecordWebApp\apps\api
  npm run test:site-proposals; if ($LASTEXITCODE -ne 0) { throw 'Site proposals failed' }
  node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test src/jobs/serviceVisits.integration.test.ts; if ($LASTEXITCODE -ne 0) { throw 'Service visits integration failed' }
  node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test src/routes/locationProposals.integration.test.ts; if ($LASTEXITCODE -ne 0) { throw 'Location proposals failed' }
  npm run test:v6-integration; if ($LASTEXITCODE -ne 0) { throw 'V6 integration failed' }
  foreach ($file in @('src/sync/co2V7.integration.test.ts', 'src/sync/wetChemicalV7.integration.test.ts',
    'src/sync/fireAlarmV7.integration.test.ts', 'src/sync/v7EvidenceRace.integration.test.ts')) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file
    if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
  }
} finally {
  cd C:\PWA_OfflineRecordWebApp
  docker rm -f cr02-site-proposals-verify
}
cd C:\PWA_OfflineRecordWebApp\apps\api
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed' }
npm run build; if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
npm run test:historical-matrix; if ($LASTEXITCODE -ne 0) { throw 'Historical matrix failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

## Definition of Done

| Item | Status |
|---|---|
| Typed site → inactive site + proposal + visit, idempotent and concurrency-safe | PASS |
| Admin/supervisor approve or reject; terminal; idempotent; audit | PASS |
| Pending site hidden from every existing site list and the old `siteId` path | PASS |
| `siteApproval` additive on the job DTO; web accepts it (no web change) | PASS |
| Existing `siteId` path, final report, closed-job trigger, unstarted-visit delete unchanged | PASS |
| API typecheck + build + historical gates | PASS |
| `git diff --check`; DO-NOT-MODIFY list clean | PASS |
| P0 / P1 remaining | 0 / 0 |
