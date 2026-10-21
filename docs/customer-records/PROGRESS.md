# Customer-centred history — progress

Last updated: 2026-10-21 (status review: S1-S7 all done and committed; open items listed in the final section)

RULE: whoever finishes a step MUST update this file in the same task: status, date, files changed, tests run, findings, limitations. Do not mark Done with an open P0/P1. Git is handled by the user.

Status values: Not started | In progress | Blocked | Review | Done

## Decisions (final)
- D1 Customer is a LIVE reference. Editing a customer changes the details on all records, past and future. No snapshots, no "apply latest" step.
- D2 Technician-created customers are usable immediately. Manager "Confirm details" only marks them verified; nothing is gated on it.
- D3 Exact duplicate names are already blocked (migration 016 unique index on lower(btrim(display_name))). Only near-match warning is new.
- D4 Technician sees other technicians' visits as summary rows only, not tappable. Server refuses detail for non-owners.
- D5 Home = open work + "Recent completed" shortcut into the customer timeline filtered to Completed.
- D6 Merge-duplicates is out of scope for v1.
- D7 Customer edits must be audited (who, when, old -> new). If no audit table exists, the step stops and asks before adding a migration.

## Steps and waves
Steps in the same wave touch different files and may run in parallel chats. Run waves in order.

| Wave | Step | Title | Depends on | Schema change? | Status | Updated |
|---|---|---|---|---|---|---|
| A | S1 | Shared visit row + unified Service/Repair read query | none | No | Done | 2026-10-21 |
| A | S3a | Manager customer table + detail (Details, Sites) + audited edit | none | No (existing audit_events) | Done | 2026-10-21 |
| A | S4 | Near-duplicate customer name warning | none | No | Done | 2026-10-21 |
| B | S2 | Customer timeline + non-owner guard | S1 | No | Done (reviewed) | 2026-10-21 |
| B | S5 | Confirmed flag + Unconfirmed chip + Confirm action | S3a | Yes (059, additive) | Done (reviewed) | 2026-10-21 |
| C | S3b | Timeline tab inside manager customer detail | S2, S3a | No | Done (reviewed) | 2026-10-21 |
| C | S6 | Technician Home: Open work + Recent completed shortcut | S2 | No | Done (reviewed) | 2026-10-21 |
| D | S7 | Verification, phone check, docs | all | No | Done (committed `db85dd9`, docs `4454fe8`; automated + phone checks green, WebAPK/production HTTPS not done) | 2026-10-21 |

## Step log
(Append an entry per step when work happens. Format below.)

### S3b — Manager customer Timeline tab
- Status: Review; implemented under the explicit S3b task request. Other steps' statuses and user-managed commit checkpoints are not certified by this step.
- Date: 2026-10-21.
- Files changed by S3b:
  - `apps/web/src/manager/ManagerCustomerConfiguration.tsx`: embed CustomerTimeline using the current manager identity, route both kinds through manager callbacks, import existing timeline styles and show a count badge scoped to customer/account/mode.
  - `apps/web/src/visits/CustomerTimeline.tsx`: optional total-count callback for the embedding tab, undefined during loading/refresh/error. Existing fetch/cache/filter/access behavior is reused.
  - `apps/web/src/App.tsx`: pass current identity/session mode and the existing manager repair-route callback into customer detail. Service visits reuse the existing manager-service-visit callback.
  - `apps/web/tests/manager-customer-records.html`: activate the test workspace and supply manager timeline context/navigation callbacks.
  - `apps/web/tests/manager-customer-records.spec.ts`: replace the placeholder assertion; add pagination/count/filter/error, foreign-owner rows, keyboard activation, responsive checks and actual App destination tests for both kinds.
  - `docs/customer-records/PROGRESS.md`: S3b row and this entry. HANDOVER.md is outside this task's permitted scope and was not edited by S3b.
- Behaviour changed: Timeline displays S2 history; every Service/Repair row opens its existing manager detail route regardless of technician ownership. Badge shows the total across fetched pages (including zero), stays independent of filters and clears on refresh/error. The timeline mounts inside the hidden tab panel so its count is available from Details/Sites too. No duplicate summary request or separate count authority. Missing/unverified manager context fails closed.
- Tests run: manager customer Chromium suite 12/12 PASS, including actual App service and repair navigation; shared CustomerTimeline/VisitRow tests 9/9 PASS; web typecheck PASS; production build PASS (existing large-chunk advisory); `git diff --check` PASS (line-ending warnings only). Layout and 44px targets checked at 360x800, 768x1024 and 1280x800; phone and desktop screenshots visually inspected. Focused visual test reran successfully. Initial sandbox browser lookup/loopback restrictions were resolved using the installed browser path and approved execution outside the sandbox; stalled sandbox test processes were interrupted.
- Broader regressions: existing timeline/sidebar browser suite 7/9 PASS, 2 FAIL. Standalone timeline test selects Completed after Repairs but still displays its Repair row; isolated rerun reproduces it. Its status handler is unchanged by S3b; S2 re-review owns investigation/correction. Sidebar test expects “My Service Jobs”, while current TechnicianHome renders “Open work”; S6 owns reconciling this assertion. Neither out-of-scope path was modified or its test weakened.
- P0/P1/P2 findings: S3b wiring P0 0, P1 0, P2 0. Broader P2 follow-ups: 2 (shared status-filter regression and stale Home-heading expectation), deferred to S2/S6 before S7 acceptance. Full feature regression gate is not green; readiness is for scoped review only.
- Limitations / next: intercepted APIs and real browser IndexedDB; actual App destination hashes verified, not backend detail/authorization acceptance. No physical-phone, full offline launch, browser restart, installed-PWA force-close, database, Docker or deployment acceptance performed. No schema, migration, lockfile, deployment, historical template, entry/save/camera or production data changes by S3b. No Git mutations/staging. Review S3b; owning steps must resolve the broader failures before S7. Concurrent updates marking S3a Done and clearing S5's prerequisite were retained.

Reproduce from PowerShell with installed dependencies, Chromium and loopback access:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
$env:PLAYWRIGHT_BROWSERS_PATH='C:/Users/kokfu/AppData/Local/ms-playwright'
$env:S3A_TEST_PORT='4195'
node node_modules/@playwright/test/cli.js test --config tests/manager-customer-records.config.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Manager customer regressions failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/CustomerTimeline.test.tsx tests/VisitRow.test.tsx
if ($LASTEXITCODE -ne 0) { throw 'Timeline/row regressions failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

Broader diagnostic command (currently 7 pass / 2 fail as above): from `apps/web` with the same browser path, run `node node_modules/@playwright/test/cli.js test --config tests/customer-timeline.config.ts --workers=1`.

### S7 — Verification, phone check, docs
- Status: Review. Automated Level 2 gates green; physical-phone and real offline/restart checks NOT performed (listed below). Feature committed first by user request as db85dd9.
- Date: 2026-10-21.
- Files changed by S7: `docs/customer-records/PROGRESS.md` only. No code changes were needed.
- Tests run:
  - API typecheck + build PASS; web typecheck + production build PASS (existing large-chunk advisory only); `git diff --check` PASS (line-ending warnings only).
  - API against a fresh disposable PostgreSQL 16 (127.0.0.1:55432, removed afterwards), `--test-concurrency=1`: confirmation, managerCustomers (unit + integration), customerCreation, customerTimelineGuards, inspectionReference, serviceVisits, repairVisitContract 61/61 PASS; managerCustomerDetails 1/1 PASS (own database); customerVisitSummaries 8/8 PASS (its guard requires a database named `visit_summaries_test`; the first run failed only on that name check, not on behaviour).
  - Web unit (CustomerTimeline, VisitRow, findSimilarCustomers, customerCreationReceipt, queuedWriteRefusal) 36/36 PASS; role-access 4/4 PASS.
  - Chromium: manager-customer-records 13/13, add-customer-similarity 6/6, customer-timeline + sidebar 9/9, technician-home 8/8 PASS.
- Browser checks (M1 customer table, M2 detail/Timeline tab, T1 add-customer warning, T2 timeline, Home): performed through the Playwright suites with intercepted APIs at 360x800, 768x1024 and 1280x800 (no horizontal overflow, targets >=44px, focus visible). 360px screenshots of the manager table, manager Timeline tab, technician similarity warning and Home were visually inspected. 375px was not run separately; 360px is narrower.
- Offline in automated suites is browser-emulated; the real device offline/force-close checks are in the phone bullet below.
- Physical phone (2026-10-21, device 182449ec CPH2375, Chrome via adb + CDP, dev origin `http://localhost:8081`, NOT production HTTPS/WebAPK). Containers api+proxy rebuilt first (`docker compose build api proxy`, `up -d --no-deps api proxy`); migration 059 applied (30/30 existing customers confirmed); phone moved to `build-20261021T044424Z` with a real Update-now tap. Results:
  - PASS Home shows "Open work" + "Recent completed" (no completed tabs); Recent completed -> customer picker; customer opened with Completed pre-selected (services + approved repair).
  - PASS other technicians' rows are inert locked divs (real tap changed nothing); own rows are buttons and a real tap opened job SV-20261019-116; `GET /api/customers/:id/visit-summaries` rows carry exactly the 9 summary fields; foreign service detail 403, own 200.
  - PASS offline timeline: Wi-Fi off + proxy stopped, Chrome force-stopped and reopened, role re-chosen: cached rows shown with "Offline - showing summaries saved on this device".
  - PASS offline Add Customer: near-match name "All Servicess" showed the similarity panel (Use All Services / Create anyway) while offline; inputs stayed enabled; Create anyway + Create Customer saved locally ("pending sync", outbox `technicianCustomer/Pending`); survived force-close/reopen; after reconnect exactly one server row (`is_confirmed=false`, created_by 436).
  - PASS manager (mobiletest) on phone: Unconfirmed (1) chip + badge, "Added by technician-demo on 2026-10-21", Confirm details -> badge cleared, server `is_confirmed=t`, confirmed_by 435, one `manager_customer_confirmed` audit; Timeline tab count and filters; at 360 css px no horizontal overflow, 58 rows all tappable for the manager, a foreign-owner row opened the manager service-visit route.
  - Not done: installed WebAPK / production HTTPS, 375 px specifically (phone is 360), real typing on the keyboard (fields set via CDP; buttons real taps), the near-match "Use existing" path on phone, camera. Test data left: customer "All Servicess" (confirmed, site "S7 Phone Site", no visits) in the demo DB. Phone left signed in as manager mobiletest.
- Final P0/P1/P2: P0 0. P1 0. P2 (documented, none blocking): (1) non-owner service-detail read returns 403 instead of 404 and is no longer audited; (2) Completed filter now covers closed services + approved repairs (shown as intended in the Home shortcut; confirm on phone); (3) "Added by" shows username, not display name; (4) migration 059 not yet applied to a production-sized database; (5) web bundle-size advisory; (6) WebAPK/production-HTTPS acceptance not done.
- Limitations: browser tests use intercepted HTTP; DB suites use disposable data, not production. Test-result screenshots stay in ignored `apps/web/test-results`.

### S5 — Confirmed flag + Unconfirmed chip + Confirm action
- Status: Review.
- Date: 2026-10-21.
- Migration decision: no existing column can carry "confirmed" (`customer_creation_requests` only covers technician creations and has no state). Added the smallest forward migration `apps/api/migrations/059_customer_confirmation.sql`: `customers.is_confirmed BOOLEAN NOT NULL DEFAULT true`, `confirmed_at`, `confirmed_by_user_id`, `created_by_user_id` (all nullable except the flag; `ADD COLUMN IF NOT EXISTS`, idempotent). Existing rows therefore become confirmed with unknown creator (`createdBy: null`). Registered in `apps/api/src/db/migrations.ts` beside 058 (runs every start; safe to re-run). No Dexie change.
- Files changed:
  - `apps/api/migrations/059_customer_confirmation.sql` (new), `apps/api/src/db/migrations.ts` (2 lines).
  - `apps/api/src/routes/managerCustomers.ts`: `loadManagerCustomer` returns `confirmed`, `confirmedAt`, `createdBy` (username), `createdAt` (so list, detail and every mutation response carry them); technician `createCustomer` inserts `is_confirmed=false` (manager path via the same helper = true) and both creation paths record `created_by_user_id`; new `POST /manager/customers/:customerId/confirm`.
  - `apps/api/src/routes/managerCustomerConfirmation.integration.test.ts` (new).
  - `apps/web/src/manager/managerApi.ts`: optional strict-typed fields in the customer validator; `confirmManagerCustomer` (accepts only the exact customer with `confirmed === true`).
  - `apps/web/src/manager/ManagerCustomerRecords.tsx`: `isUnconfirmed` helper and Unconfirmed badge in the Status column; `managerCustomerRecords.css`: chip styling.
  - `apps/web/src/manager/ManagerCustomerConfiguration.tsx`: "Unconfirmed (n)" toggle chip (combines with search), "Added by X on YYYY-MM-DD" line and "Confirm details" button in the detail header.
  - `apps/web/tests/manager-customer-records.spec.ts`: new browser test.
- Behaviour changed: technician-created customers start Unconfirmed; manager-created and legacy customers are Confirmed. Confirm is admin-only (401 anonymous, 403 inspector/supervisor), optional `x-expected-user-id` stale-account check (409), strict empty body, locks the row, audits `manager_customer_confirmed` once; repeating it is a no-op without a second audit. Nothing is gated on the flag: unconfirmed customers still appear in technician pickers, accept visits and stay editable. Technician screens/routes/files untouched; the technician customer-creation response now also carries the extra fields, which technician code ignores.
- Tests run: API (fresh disposable PostgreSQL 16 on 127.0.0.1:55432, `--test-concurrency=1`): new confirmation suite PASS (legacy/manager/technician defaults, creator, idempotent replay of technician creation, list+detail flag, authz, validation, stale actor, 404, repeat-confirm single audit, concurrent confirms), plus existing managerCustomerDetails, managerCustomers.test, customerCreation.integration, managerCustomers.integration: 17/17 and 2/2 in the two databases. Chromium manager-customer-records 13/13 (new test covers badge, chip count/filter/zero-state, header line, Confirm, unchanged/malformed responses failing closed, 360x800 and 1280x800 overflow, 44px targets, edit still enabled while unconfirmed). Technician regressions: add-customer-similarity + sidebar/creation/offline-queue 6/6; role-access 4/4. API and web typecheck + production builds PASS. `git diff --check` PASS (line-ending warnings only).
- Reproduce API checks: as the S3a block, but create the container with `POSTGRES_DB=phase6_seed_integration`, also `CREATE DATABASE customer_records_s3a_test`, and run `node --import tsx --test --test-concurrency=1 src/routes/managerCustomerConfirmation.integration.test.ts src/routes/managerCustomerDetails.integration.test.ts src/routes/managerCustomers.test.ts src/routes/customerCreation.integration.test.ts src/routes/managerCustomers.integration.test.ts` (Details test needs the s3a database URL; the others the phase6 one). Web: `S3A_TEST_PORT=4197` with `tests/manager-customer-records.config.ts`.
- P0/P1/P2 findings: P0 0, P1 0, P2 0 in scope. Notes: "Added by" shows the creator's username (the users table has no display name) and is hidden for legacy customers. Customers created by a technician before this migration are Confirmed by definition (no way to tell them apart).
- Limitations / next: browser tests use intercepted HTTP; the API suite exercises the real router and PostgreSQL. The migration is untested against a production-sized database and has not been applied to the client's running database (applies on next API start). No physical-phone, offline-launch, PWA force-close, Docker Compose or deployment checks. Timeline and Home untouched. No Git operations or staging.

### S5 preflight — prerequisite not complete
- Status: Prerequisite cleared on 2026-10-21: S3a focused re-review passed and is recorded Done. S5 implementation may start after the user-authorized S3a commit; none started in this task.
- Date: 2026-10-21.
- Files changed: `docs/customer-records/PROGRESS.md` only (S5 row and this entry).
- Behaviour changed: none. Customer creation, manager screens, timeline and Home are untouched.
- Schema inspection: existing customer columns do not provide confirmation state. Migration 016's `customer_creation_requests` already records `customer_id`, `created_by_user_id` and `created_at`; creator provenance may be reused, with legacy customers requiring a nullable/unknown creator. A small forward migration for confirmation state appears necessary and is explicitly authorized by S5, but none was added or applied while the prerequisite is unmet. Existing customers must default to confirmed when implemented.
- Tests run: `git diff --check` PASS (line-ending warnings only). No application tests, typechecks or builds; documentation-only preflight.
- P0/P1/P2 findings: no implementation findings assessed; the S3a prerequisite blocker is now cleared. This entry does not certify S3a or S5 correctness.
- Limitations / next: S3a focused re-review has passed and is recorded Done. After its user-authorized commit, implement and verify defaults, provenance, idempotent admin-only confirmation, status/filter/header controls and unchanged technician use. No phone, browser, offline, database or deployment acceptance claimed. No Git mutations or staging.

### S? — <title>
- Status:
- Date:
- Files changed:
- Behaviour changed:
- Tests run:
- P0/P1/P2 findings:
- Limitations / next:

### S1 — Shared visit row + unified Service/Repair read query
- Status: Done; ready for S2.
- Date: 2026-10-21.
- Files changed: `apps/api/src/routes/customerVisitSummaries.ts` (authenticated router); `apps/api/src/visits/visitSummaries.ts` (validated summary query and cursor); `apps/api/src/routes/customerVisitSummaries.test.ts` (HTTP + PostgreSQL regression tests); `apps/api/src/server.ts` (two registration lines, explicitly authorized by owner); `apps/web/src/visits/VisitRow.tsx` (presentational row); `apps/web/tests/VisitRow.test.tsx` (render, lock, interaction and responsive browser tests); `apps/web/src/styles/app.css` (scoped VisitRow CSS section only); this progress file.
- Behaviour changed: `GET /customers/:customerId/visit-summaries` returns `{ visits, nextCursor }`. Each summary has exactly `id`, `kind`, `date`, `status`, `siteId`, `siteName`, `technicianId`, `technicianName`, `ownedByCaller`. No answers, findings, configuration, photos, PDFs or report details. Both visit kinds merge newest-first, with deterministic date/kind/UUID cursor ordering. Filters: `kind`, source `status` enum, inclusive `dateFrom`/`dateTo` (YYYY-MM-DD), `siteId`, `cursor`, `limit` (default 50, maximum 100). Invalid/unknown/repeated filters and malformed output fail closed; expected-user header mismatch returns 409; successful reads are private/no-store.
- Access contract: `admin` (manager) can read all customer summaries. `inspector` can read all summaries for active, non-demo customers, matching the existing customer picker. Other roles remain refused, matching that customer catalog endpoint. Customer visibility is checked before visit reads; unknown/forbidden customer IDs both return 404. Operational service visits exclude samples/non-master jobs; archived and hidden-from-home visits remain in this customer history. Legacy service visits without a service date use their creation date. Existing service/repair detail endpoints are unchanged; their S2 detail guard remains required.
- Web contract: Service/Repair + status badges, ISO calendar date, technician name (Unassigned for null), optional lock and callback. Without a callback the default is a locked, inert div. Explicit lock overrides a callback; callers can hide the lock on an inert row. Tappable rows are semantic buttons with token-based minimum 44px targets, wrapping and visible focus. No fetching, local persistence, routing, customer snapshots or offline entry changes.
- Tests run: new API suite 8/8 PASS (real disposable PostgreSQL 16 on 127.0.0.1:55432 with connection-local TEMP fixtures; includes auth/roles, both kinds, projection/no-detail, filters, ownership, customer visibility, pagination including identical UUID/date across tables, malformed input/output). New web suite 4/4 PASS (SSR rendering/lock/callback plus headless Chromium at 360x800, 768x1024, 1280x800; no horizontal overflow, targets >=44px, visible keyboard focus; phone/desktop screenshots inspected). Existing `inspectionReference.test.ts`, `serviceVisits.test.ts`, `repairVisitContract.test.ts`: 41/41 PASS. API + web typecheck and production builds PASS. `git diff --check` PASS (line-ending warnings only).
- P0/P1/P2 findings: P0 0, P1 0, scope P2 0. Existing web build large-chunk warning remains; bundle work is outside S1. An intermediate API typecheck failure in concurrently edited `managerCustomers.ts` was fixed by the customer-table work; final API gates pass and this task did not edit that file.
- Limitations / next: integration fixtures exercise the query and HTTP contract, not a full migration/seed or production-data acceptance run. Browser checks render the standalone component with application CSS; no routed timeline exists yet. No physical phone, offline entry, browser restart, PWA force-close, Docker Compose runtime or deployment checks claimed. S2 owns timeline wiring, client parsing/cache and non-owner detail guards. No schema/migration, lockfile, Docker/Caddy/env or published-template changes by this task. No staging or Git mutations.

Reproduce S1 checks from a fresh PowerShell session (Docker Desktop and the installed Playwright Chromium are required; use a shell with loopback/Docker access):

```powershell
cd C:\PWA_OfflineRecordWebApp
$summaryContainer = 'visit-summaries-' + [guid]::NewGuid().ToString('N')
$summaryId = docker create --name $summaryContainer -e POSTGRES_DB=visit_summaries_test -e POSTGRES_USER=inspection_test -e POSTGRES_PASSWORD=disposable-summary-test -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Cannot create disposable database' }
try {
  docker start $summaryId
  if ($LASTEXITCODE -ne 0) { throw 'Port 55432 unavailable; no existing container was stopped' }
  for ($i=0; $i -lt 30; $i++) {
    docker exec $summaryId pg_isready -U inspection_test -d visit_summaries_test
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable database not ready' }
  $env:NODE_ENV='test'
  $env:VISIT_SUMMARIES_TEST_DATABASE_URL='postgres://inspection_test:disposable-summary-test@127.0.0.1:55432/visit_summaries_test'
  $env:DATABASE_URL=$env:VISIT_SUMMARIES_TEST_DATABASE_URL
  cd C:\PWA_OfflineRecordWebApp\apps\api
  node --import tsx --test src/routes/customerVisitSummaries.test.ts src/routes/inspectionReference.test.ts src/jobs/serviceVisits.test.ts src/repairVisits/repairVisitContract.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'API tests failed' }
} finally { docker rm -f $summaryId }
cd C:\PWA_OfflineRecordWebApp\apps\api
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/VisitRow.test.tsx
if ($LASTEXITCODE -ne 0) { throw 'Web row tests failed' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

## Open questions
- Resolved by S3a: migration 002 already provides `audit_events` (actor, server timestamp, entity, action, result, text reason). Customer detail changes store structured old/new values in reason inside the update transaction; no migration required.
- Resolved by S5: no existing column carries it; additive migration 059 added (see S5 log).

### S4 — Near-duplicate customer name warning
- Status: Done; ready for review / S7 acceptance.
- Date: 2026-10-21
- Files changed:
  - `apps/web/src/referenceData/findSimilarCustomers.ts`: pure ranked top-three matcher; lowercase/space/punctuation/corporate suffix normalization, contains and bounded edit distance.
  - `apps/web/src/referenceData/customerSimilarity.css`: token-based wrapping panel and touch targets.
  - `apps/web/src/jobs/TechnicianAddCustomer.tsx`: cached customer names; Use starts a visit with the existing ID; Create anyway uses the original submit path.
  - `apps/web/src/manager/ManagerAddCustomer.tsx`: loaded customer names; Use opens the existing customer route; Create anyway uses the original submit path.
  - `apps/web/tests/findSimilarCustomers.test.ts`: normalization, typos, unrelated names, ranking, top-three and input-immutability coverage.
  - `apps/web/tests/add-customer-similarity.html`, `add-customer-similarity.spec.ts`, `add-customer-similarity.config.ts`: component harness, both choices for both roles, offline queue identity, responsive checks and isolated test port 4189.
  - `docs/customer-records/PROGRESS.md`: step row and log.
- Behaviour changed: advisory panel below the name; typing and local draft/save remain available offline. No snapshots. Missing/invalid cached names show an informational message; malformed manager names trigger the existing authority-failure handler. Exact duplicate enforcement and creation/receipt/sync code unchanged.
- Tests run: 26/26 Node tests passed (matcher, customerCreationReceipt, queuedWriteRefusal); 6/6 Playwright tests passed (two component tests plus four technician-sidebar-navigation regressions). Includes browser-emulated offline local queue, persistence/reconnect regression and exact UUID receipt retry. Layout checked at 360x800, 768x1024, 1280x800; phone/desktop screenshots generated, technician phone and manager desktop screenshots visually inspected. Web typecheck and production build passed; git diff --check passed (line-ending warnings only).
- Reproduce from `C:\PWA_OfflineRecordWebApp\apps\web`:
  - `..\api\node_modules\.bin\tsx.cmd --test tests/findSimilarCustomers.test.ts tests/customerCreationReceipt.test.ts tests/queuedWriteRefusal.test.ts`
  - `node node_modules/@playwright/test/cli.js test --config tests/add-customer-similarity.config.ts --workers=1`
  - `npm.cmd run typecheck`
  - `npm.cmd run build`
  - From repository root: `git diff --check`.
- P0/P1/P2 findings: none remaining in S4 scope. Existing production bundle-size advisory remains outside this step. Initial typecheck/build failed on concurrently edited S1 visit files; later typecheck/build passed after those files changed elsewhere. Browser tests passed with approved execution outside the sandbox after sandboxed server startup stalled.
- Limitations / next: heuristic suggestions cover only cached technician names / loaded manager names. APIs were mocked; production duplicate enforcement was not exercised. No physical phone, installed-PWA force-close, real browser restart or deployment acceptance performed; S7 owns those checks. No schema/API/creation-flow changes; no Git mutations. Other wave steps left to their owners.


### S3a — Manager customer table + detail + audited edit
- Status: Done; focused re-review passed on 2026-10-21 (P0/P1/P2 0/0/0). User explicitly authorized this S3a commit; S5 may proceed after the commit.
- Date: 2026-10-21.
- Audit decision: reuse `audit_events` from migration 002. The new PATCH writes actor_user_id, server-created timestamp, customer UUID, action `manager_customer_details_updated`, success result and JSON `{old, new}` in reason. The customer update and audit share one transaction. No audit table or schema migration was added.
- Files changed:
  - `apps/api/src/routes/managerCustomers.ts`: strict admin-only PATCH plus list-only Service/Repair last-visit and open-work aggregates.
  - `apps/api/src/routes/managerCustomerDetails.integration.test.ts`: real PostgreSQL/API regression coverage.
  - `apps/web/src/manager/ManagerCustomerConfiguration.tsx`: reuse existing manager list/detail routes, responsive table, Details/Sites/Timeline tabs and existing Sites/service controls.
  - `apps/web/src/manager/ManagerCustomerRecords.tsx`: table/search and editable permanent details with account-scoped IndexedDB recovery, explicit retry and authoritative confirmation.
  - `apps/web/src/manager/managerCustomerRecords.css`: scoped token-based card/table styling and canonical desktop breakpoint.
  - `apps/web/tests/manager-customer-records.html`, `manager-customer-records.spec.ts`, `manager-customer-records.config.ts`: isolated browser harness, UI/recovery tests and independent dev-server port.
  - This progress file.
- Behaviour changed: Customers displays Customer, Contact, Sites, Last visit, Open and Status, searches name/code/contact/site/address/phone and opens detail on row click or keyboard-accessible customer button. Add customer keeps the existing route. Archive/restore remains available. Details edits name, contact person, phone, fax, contract number and service frequency; Save changes / Discard and the live-reference banner are visible. Sites retains existing add/address/archive/restore controls. Timeline is a coming-soon placeholder for S3b. Existing service assignment and per-service configuration controls remain reachable under Details. The initial implementation needed no App.tsx changes or new route names; the review follow-up below fixes the existing list-update callbacks in App.tsx.
- API contract: `PATCH /manager/customers/:customerId` accepts exactly `{changes, expected}`, each containing all six editable detail fields. Unknown keys, invalid UUIDs, types, lengths and service-frequency values are rejected. Admin is the manager role; technicians and supervisors receive 403, anonymous callers 401. An optional `x-expected-user-id` protects stale-account callers. Row locking and expected-value comparison reject stale edits with 409. Exact already-applied retries write no additional audit. PostgreSQL's existing active canonical-name index is authoritative; its unique violation maps to `CUSTOMER_NAME_CONFLICT` (409). Customer identities and visit references remain live; no snapshots were introduced.
- Local-save behaviour: Save changes persists a draft in the existing IndexedDB drafts table before PATCH. Failed/malformed confirmations leave that draft recoverable after page reload; retry is explicit through Save changes. Drafts are scoped to manager user ID and customer UUID. Only matching customer UUID/field confirmation plus the existing validated authoritative GET can clear the draft. Inputs are never disabled by network status. This step does not add an automatic background sync path for manager edits.
- Tests run: new database integration suite 1/1 PASS plus existing managerCustomers tests 14/14 PASS, using a fresh disposable PostgreSQL 16 container on 127.0.0.1:55432, removed afterwards. Covers 401/403, strict validation, duplicate-name conflict, edit/read round-trip, actor/time/old/new audit, retry without duplicate audit, stale edits/accounts, competing writers, audit-failure rollback and Service/Repair table counts. Chromium tests 2/2 PASS: search, Add customer route, tab content, save/reload/discard, network-request failure recovery across reload, malformed success refusal, local draft retention/removal; screenshots and no horizontal overflow at 360x800, 768x1024 and 1280x800, Save target >=44px. Phone and desktop screenshots inspected. API/web typecheck and production builds PASS; role-access regression 4/4 PASS; `git diff --check` PASS (line-ending warnings only).
- P0/P1/P2 findings (initial implementation claim, superseded by review below): scope P0 0, P1 0, P2 0. Existing web build large-chunk warning remains outside this step. Initial concurrent VisitRow typecheck errors were resolved by S1; final web gates pass. Initial loopback/Docker sandbox restrictions were resolved with permitted test execution outside the sandbox; no production database was used.
- Limitations / next: browser tests use intercepted API responses; database integration separately exercises the real router and PostgreSQL. No physical phone, installed-PWA force-close, browser restart, full offline launch or deployment acceptance claimed. S7 owns those release checks. The remote Web Interface Guidelines document could not be fetched; local mobile-first and React skill review plus screenshot checks were performed. S3b owns the Timeline content; S5 owns confirmed/unconfirmed state. No PostgreSQL/Dexie schema, migration, package-lock, Docker Compose, Caddy, env, runtime data, published templates changed. App.tsx changes are limited to the review follow-up below. No staging or Git mutations.

Reproduce S3a checks from a fresh PowerShell session with Docker/loopback access (only the newly created disposable container is removed):

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\api
$s3aContainerId = docker run -d --name ('customer-records-s3a-' + [guid]::NewGuid().ToString('N')) -e POSTGRES_DB=customer_records_s3a_test -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable database failed to start; no existing container was stopped.' }
try {
  for ($i=0; $i -lt 30; $i++) {
    docker exec $s3aContainerId pg_isready -U inspection_app -d customer_records_s3a_test
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable database did not become ready.' }
  $env:NODE_ENV='test'
  $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:disposable-test-only@127.0.0.1:55432/customer_records_s3a_test'
  $env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
  node --import tsx --test src/routes/managerCustomerDetails.integration.test.ts src/routes/managerCustomers.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Customer API tests failed.' }
} finally { docker rm -f $s3aContainerId }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
cd C:\PWA_OfflineRecordWebApp\apps\web
$env:S3A_TEST_PORT='4187'
npx playwright test --config tests/manager-customer-records.config.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Customer browser tests failed.' }
npm run test:role-access
if ($LASTEXITCODE -ne 0) { throw 'Role-access tests failed.' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed.' }
```

### S3a review remediation — 2026-10-21
- Status: Done; all three reported defects fixed and focused re-review passed on 2026-10-21. Re-review reran Chromium 9/9, role-access 4/4, web typecheck/build and whitespace checks successfully. P0/P1/P2 0/0/0. User explicitly authorized committing S3a; no unrelated feature code is included.
- Findings resolved: P1 typing during an in-flight Save was overwritten and its draft deleted; P2 successful detail replacement dropped list-only visit aggregates; P2 malformed/unavailable authority did not reach the existing fail-closed handler. Remaining scope P0/P1/P2: 0/0/0.
- Files changed in this follow-up:
  - `apps/web/src/manager/ManagerCustomerRecords.tsx`: track newer edits through asynchronous save cleanup; retain them in IndexedDB with the confirmed server baseline for explicit retry. Preserve drafts before reporting unavailable/authorization authority failures. Keep ordinary domain conflicts editable. Export the list-update helper that preserves visit aggregates when replacing validated customer details.
  - `apps/web/src/App.tsx`: one helper import and the two existing customer-detail/service-editor save callbacks use that helper. These narrow changes are required to fix aggregate loss at the parent that owns the list state; concurrent timeline changes in this file are unrelated and were preserved.
  - `apps/web/tests/manager-customer-records.html`: separate realistic list/detail responses and exercise the production list-update helper; authority failures clear the presented server data and allow explicit reopening.
  - `apps/web/tests/manager-customer-records.spec.ts`: retain existing search/layout/recovery checks and add delayed-save typing, recovery/retry baseline, aggregate retention, malformed PATCH/GET, failed GET, 401/403 and domain-conflict regressions. Detail fixtures no longer contain list-only aggregates.
  - `docs/customer-records/PROGRESS.md` and `HANDOVER.md`: record review status, fixes, verification and limits.
- Verification: Chromium 9/9 PASS; web typecheck PASS; production build PASS (existing large-chunk advisory only); role-access 4/4 PASS; `git diff --check` PASS (line-ending warnings only). Browser suite checks the existing 360x800, 768x1024 and 1280x800 layouts. No backend changes in this follow-up; API tests were not rerun here (the preceding review passed the real disposable PostgreSQL/customer suite 15/15).
- Scope and limitations: no migration, PostgreSQL/Dexie schema, lockfile, deployment configuration or published-template changes. No production-data or Git mutations. Tests use intercepted HTTP with real browser IndexedDB; no physical-phone, installed-PWA restart, full offline launch or deployment acceptance claimed. S7 retains those acceptance checks. No later step was started.
- Reproduce this follow-up from a fresh PowerShell session with installed dependencies, Playwright Chromium and loopback access:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
$env:S3A_TEST_PORT='4193'
node node_modules/@playwright/test/cli.js test --config tests/manager-customer-records.config.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'S3a browser regressions failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
npm.cmd run test:role-access
if ($LASTEXITCODE -ne 0) { throw 'Role-access regressions failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

### S2 — Customer timeline + non-owner guard
- Status: Review; initial completion claim superseded by the S2 review remediation below. Release acceptance remains owned by S7.
- Date: 2026-10-21.
- Files changed:
  - `apps/web/src/visits/CustomerTimeline.tsx`: reusable timeline, filters, loading/error/empty/offline states, owner/manager access through S1 VisitRow.
  - `apps/web/src/visits/CustomerTimeline.css`: scoped token-based wrapping filters and rows.
  - `apps/web/src/visits/CustomerTimelineRoute.tsx`: live customer picker, route-level service opening and stale-request cancellation.
  - `apps/web/src/visits/customerTimelineData.ts`: strict summary allowlist, pagination, filtering, per-user/customer summary cache in existing referenceData.
  - `apps/web/src/visits/customerTimelineServiceJob.ts`: validate and load the exact authorized service detail before opening the existing job screen, including visits omitted from Home.
  - `apps/web/src/App.tsx`: only S2 imports, hash route parsing/serialization, Home/customer-picker-context history entry points, technician/manager route rendering. Concurrent S3a edits in this shared file were preserved.
  - `apps/api/src/routes/inspectionJobs.ts`: service detail 403 with clear owner-only message; retained owner/admin reads, added expected-actor check and private/no-store.
  - `apps/api/src/routes/repairVisitWrites.ts`: clearer message for the existing repair-detail non-owner 403; underlying ownership rule unchanged.
  - `apps/api/src/routes/customerTimelineGuards.test.ts`: HTTP tests for both guards, owner/admin success, null owner, unauthenticated access, missing records, identity mismatch and unchanged supervisor role gates.
  - `apps/web/tests/CustomerTimeline.test.tsx`: summary parsing, locks/taps, combined filters, canonical detail validation.
  - `apps/web/tests/customer-timeline.html`, `customer-timeline.spec.ts`, `customer-timeline.config.ts`: browser harness and isolated port 4191; includes existing technician-sidebar-navigation regressions.
  - `docs/customer-records/PROGRESS.md`: S2 row and this log.
- Behaviour changed: `#/customer-timeline[/customerId]` is reachable beside Home and New Service Visit's customer picker. A picker-context link with an initial customer ID preserves that ID; otherwise the timeline has its own customer picker. `#/manager-customer-timeline[/customerId]` reuses the route for the manager (database role admin); the component can also be embedded directly by S3b. Services and Repairs merge newest-first; All/Services/Repairs, source status, inclusive date range and site filters combine. Technician-owned rows open; other rows remain inert locked divs. Managers can open every row. Service opening fetches the exact authorized job, so archived/hidden service visits do not depend on membership in Home's list. This path holds owner detail in React state only, without introducing customer snapshots or persisting foreign details.
- Offline/cache contract: all pages of validated S1 summaries are saved together under `customer-timeline:v1:<userId>:<customerId>` in the existing per-user referenceData store. No Dexie table/index/version change. Summary rows contain exactly S1's ten fields, including foreign rows; no answers, configurations, attachments, reports, PDFs or customer copies. Offline/server-transport failure uses the saved summaries with an explicit stale-summary notice. Reachable refusals, malformed JSON/data, duplicate identities and repeated cursors fail closed without displaying an older result. Workspace/session changes cannot publish another account's response or cache it in the new workspace. Filters work from the cached summaries; no entry/save/camera controls were changed.
- Tests run: API guard + serviceVisits + repairVisitContract suites 40/40 PASS (HTTP against injected database fixtures, not live PostgreSQL). Web CustomerTimeline + existing VisitRow suites 8/8 PASS. Playwright timeline + existing technician sidebar/navigation/queue regressions 8/8 PASS: owner/manager navigation, both manager detail destinations, pagination, combined online/offline filters, summary-only persistence across an API-blocked page reload, failed/malformed refresh, account isolation. Layout/focus/targets checked at 360x800, 768x1024, 1280x800; phone and desktop timeline screenshots visually inspected. API/web typechecks and production builds PASS. `git diff --check` PASS (line-ending warnings only). HTTP/browser tests required approved execution outside the sandbox for loopback/Chromium access.
- P0/P1/P2 findings: P0 0; P1 0; scope P2 0. Existing web large-chunk build advisory remains outside S2; bundle work belongs to release/performance follow-up. No protected schema, migration, dependency lockfile, Docker/Caddy/env or historical template changes by S2. Targeted Git status for protected files and TechnicianHome returned no changes; unrelated working-tree changes belong to other tasks and were retained.
- Limitations / next: only history already downloaded from S1 is available offline; device-only visits remain in their existing entry/queue screens until synchronized. An owner's uncached service detail requires reconnecting; no foreign detail is fetched by the timeline. The S1 customer catalog excludes supervisors, so this route follows the same inspector/admin roles. Home's open-work redesign and Recent completed shortcut remain S6; manager customer detail Timeline tab remains S3b. The shared component exposes `initialStatus` for a filtered embed. No physical phone, installed-PWA force-close, real browser restart, production server/database, Docker runtime, HTTPS or deployment acceptance is claimed. S7 owns those checks. Git mutations/staging were not performed.

Reproduce S2 checks from a fresh PowerShell session (installed dependencies and Playwright Chromium required; HTTP/browser commands need loopback/process access). These tests use injected database fixtures and do not need or connect to a production or disposable database:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\api
node --import tsx --test src/routes/customerTimelineGuards.test.ts src/jobs/serviceVisits.test.ts src/repairVisits/repairVisitContract.test.ts
if ($LASTEXITCODE -ne 0) { throw 'S2 API regressions failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/CustomerTimeline.test.tsx tests/VisitRow.test.tsx
if ($LASTEXITCODE -ne 0) { throw 'S2 web regressions failed' }
node node_modules/@playwright/test/cli.js test --config tests/customer-timeline.config.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'S2 browser regressions failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

### S2 review remediation — 2026-10-21
- Status: Review; both reported defects fixed and focused verification passed; ready for S2 re-review.
- Files changed in this follow-up:
  - `apps/api/src/routes/inspectionJobs.ts`: after authentication/ownership checks, detail reads resolve current customer identity from the job's PostgreSQL customer foreign key; missing, malformed or mismatched identities fail closed. Only the response projection changes; persisted job/system configuration is untouched.
  - `apps/api/src/routes/customerTimelineGuards.test.ts`: owner/admin rename-then-open, unchanged frozen systems/customer source, missing live customer and mismatched customer identity coverage; existing foreign-owner/auth assertions retained.
  - `apps/web/src/visits/customerTimelineData.ts`: timeline-specific catalog loader catches transport failures around fetch only; JSON parsing and catalog validation happen outside the fallback catch. Reachable malformed payloads, duplicate IDs and authorization/application refusals fail closed; transport failure and 502/504 retain existing cache fallback.
  - `apps/web/src/visits/CustomerTimelineRoute.tsx`: uses that loader rather than classifying parsing TypeErrors as unreachable transport.
  - `apps/web/tests/CustomerTimeline.test.tsx`: malformed catalog/envelope/JSON/IDs, duplicate IDs, 401/403/409/500/503 and valid expected-user request coverage.
  - `apps/web/tests/customer-timeline.html`, `customer-timeline.spec.ts`: route harness with seeded cached catalog; null/missing-envelope/malformed-JSON responses show an error without cached options; aborted API transport still offers the cached customer.
  - `docs/customer-records/PROGRESS.md`, `HANDOVER.md`: corrected S2 status/readiness and recorded remediation evidence.
- Tests run: same reproducible S2 block above: API regressions 40/40 PASS; web unit/row regressions 9/9 PASS; browser timeline/sidebar regressions 9/9 PASS; API/web typecheck and production build PASS. Final identity-mismatch assertion also rerun in the focused HTTP guard suite (1/1 PASS). `git diff --check` PASS. Loopback/Chromium checks ran with approved execution outside the sandbox.
- Findings: reported P1 (frozen customer name on timeline service opening) and P2 (malformed catalog falling back to stale names) closed. Remaining in this remediation: P0 0, P1 0, P2 0. Existing web bundle-size advisory remains outside S2.
- Limitations / next: HTTP database fixtures were injected; no real customer edits or production/disposable PostgreSQL were used. The rename proof covers the service-detail endpoint used by S2; it does not claim a whole-application audit of every historical customer label/report. Browser transport loss is API interception, not installed-PWA or physical-phone acceptance. No schema, migration, Dexie, lockfile, deployment, historical-template or TechnicianHome edits. S7 retains release/phone acceptance. S2 is ready for re-review; S3b also requires S3a completion, and the prompt's user-managed commit/wave gates still apply. No staging or Git mutations.

### S3a commit checkpoint — 2026-10-21
- Commit verification: the isolated staged S3a tree passed Chromium 9/9, API and web typechecks, web production build and staged whitespace checks. Concurrent later-step files were excluded from that export.
- Status: Done. User explicitly authorized staging and committing S3a, overriding the standing manual-Git rule for this commit only.
- Focused re-review passed: P0/P1/P2 0/0/0; Chromium 9/9, role-access 4/4, web typecheck/build and git diff --check passed. API was unchanged by remediation; its earlier disposable-PostgreSQL suite passed 15/15.
- Commit scope: S3a API, table/detail/editor, browser tests and S3a documentation only. Shared-file index content excludes concurrent S1/S2/S3b/S4 implementations and logs; their working files are preserved.
- Next: S5 is unblocked; S3b also requires S2 acceptance. Physical-phone/offline/restart/deployment acceptance remains with S7. Nothing pushed.

### S6 - Technician Home: Open work + Recent completed shortcut
- Status: Review; implementation and focused Level 1 verification complete. S2 remains Review; this step does not certify its review or the user-managed wave/commit checkpoint.
- Date: 2026-10-21.
- Files changed by S6:
  - `apps/web/src/jobs/TechnicianHome.tsx`: remove completed tabs, counts and embedded history; show open service visits and actor-owned unfinished repair visits using the existing live local hook and presentation rules. Repair cards identify visits by number/date without adding customer snapshots.
  - `apps/web/src/styles/app.css`: one Home-scoped anchor-card rule for undecorated text and token-based minimum tap height; preserve other tasks' CSS.
  - `apps/web/src/App.tsx`: reuse the existing completed-services entry as a filtered customer timeline; preserve selected customer in the hash and preserve this entry through workspace restoration/role selection/sign-in redirects. Existing Repair List/new/detail routes remain unchanged.
  - `apps/web/src/visits/CustomerTimelineRoute.tsx`: user explicitly approved this ownership extension; pass initialStatus through to the shared timeline.
  - `apps/web/src/visits/customerTimelineData.ts`: user explicitly approved this ownership extension; Completed (existing closed filter key) combines closed service visits and approved repairs, still intersecting type/date/site. Approved remains a repair-specific choice. Summary validation, transport/cache fallback and ownership guards are unchanged.
  - `apps/web/tests/technician-home-ownership.html`, `technician-home-ownership.spec.ts`: repair lifecycle fixtures and regression coverage; seed only once so reload does not repeat legacy workspace migration setup. Verify owner filtering, open-only lists, reactive completion removal, combined completed shortcut, reload, retained repair creation link and existing draft/account/deletion regressions.
  - `apps/web/tests/technician-home.config.ts`: isolated port 4196 and output directory for Home/navigation checks.
  - `apps/web/tests/technician-sidebar-navigation.spec.ts`: Home heading assertion only.
  - `apps/web/tests/CustomerTimeline.test.tsx`, `customer-timeline.spec.ts`: focused combined-completion unit coverage and corresponding existing browser filter expectations (approved repairs now match Completed).
  - `docs/customer-records/PROGRESS.md`: S6 row and this log; other entries retained. HANDOVER.md is outside S6 ownership and was not edited by this task.
- Behaviour changed: Home is Open work, with service and repair sections, empty/loading/read-error states for local repairs, and Recent completed linking to the customer picker/timeline with Completed selected. Completed service rows and approved repair rows are absent from Home. Draft/Pending/Syncing/Failed/Conflict/Returned/Awaiting approval repairs remain open work. The legacy `#/technician-completed-services[/customerId]` entry stays functional as the filtered timeline, including after reload. Repair List is deliberately not redirected: it owns draft/retry/refresh/create capabilities that the summary timeline cannot replace. No entry/save/camera/readiness rules changed.
- Tests run: focused CustomerTimeline/jobProgress/offlineStartRule/offlineNewStartRefusal/quietOfflinePreparation unit suites 26/26 PASS; Home + existing sidebar/account/queue Playwright suites 8/8 PASS; timeline + existing sidebar Playwright suites 9/9 PASS. Web typecheck and production build PASS. Browser tests used fixture APIs and approved local Chromium/loopback access. Home checked at 360x800, 768x1024, 1280x800 for overflow, >=44px controls and visible keyboard focus; phone-width and desktop screenshots visually inspected. `git diff --check` PASS (line-ending warnings only).
- P0/P1/P2 findings: scope P0 0, P1 0, P2 0. Corrected completed-entry reload redirects found during verification. Existing large web bundle build advisory remains outside S6 and belongs to release/performance follow-up. The shared working tree contains other tasks' edits, including an unrelated confirmation migration; S6 did not create or edit any migration, schema, lockfile, deployment configuration, historical template or runtime data. No Git mutations/staging by S6.
- Limitations / next: Home repairs reflect only visits already on this device and explicitly show last-known-state guidance; Repair List retains authoritative refresh and retry. Customer selection is required for the completed shortcut; there is no new global completed-history endpoint or cache. Source statuses remain server-owned; the combined filter is presentation-only. Browser reload and API-intercepted offline/cache regressions were exercised, not a real browser restart, installed-PWA force-close, physical phone, production database or deployment acceptance. S7 owns those acceptance checks. Ready for S6 focused review; do not mark dependent release acceptance complete from these results.

Reproduce S6 checks from a fresh PowerShell session (installed dependencies and Playwright Chromium required; browser commands require loopback/process access):

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/CustomerTimeline.test.tsx tests/jobProgress.test.ts tests/offlineStartRule.test.ts tests/offlineNewStartRefusal.test.ts tests/quietOfflinePreparation.test.ts
if ($LASTEXITCODE -ne 0) { throw 'S6 unit regressions failed' }
node node_modules/@playwright/test/cli.js test --config tests/technician-home.config.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'S6 Home/browser regressions failed' }
node node_modules/@playwright/test/cli.js test --config tests/customer-timeline.config.ts --workers=1 --output test-results/s6-timeline
if ($LASTEXITCODE -ne 0) { throw 'S6 timeline regressions failed' }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

### Review of S1-S6 before S7 — 2026-10-21 (reviewer: Claude)
- Verdict: S1, S2, S3a, S3b, S4, S5, S6 accepted. P0 0, P1 0.
- Independently re-run: API typecheck PASS; web typecheck PASS; customerTimelineGuards 1/1 PASS; web unit suites (CustomerTimeline, VisitRow, findSimilarCustomers) 23/23 PASS; Chromium customer-timeline + sidebar 9/9 PASS; Chromium manager-customer-records 13/13 PASS. Not re-run by reviewer: disposable-PostgreSQL suites (customerVisitSummaries, managerCustomerConfirmation, managerCustomerDetails) - they need the opt-in disposable DB; S7 must run them.
- Diff read: inspectionJobs.ts detail guard (owner = created_by_user_id, same rule as before; admin reads all), repairVisitWrites.ts message only, managerCustomers.ts confirm route + creator provenance, migration 059 (additive, existing rows confirmed), server.ts registration.
- P2 (document, no fix needed): (1) non-owner technician opening a service-visit detail now gets 403 with a message instead of the old 404 JOB_NOT_FOUND, and that read is no longer audited by the removed middleware; acceptable because summaries already expose the row. (2) S6 widened the "Completed" filter to closed services + approved repairs and edited S2's browser expectations accordingly; this matches the Home shortcut intent, confirm in S7 UI check. (3) "Added by" shows username, not display name (users table has no display name). (4) Working tree also holds unrelated upcoming-services edits (TechnicianUpcomingServices, ManagerUpcomingServices, UpcomingServiceDrawer, docs/upcoming-services): commit them separately from this feature.
- Next: commit this feature (user), then S7.

### Status review — 2026-10-21
- All steps S1-S7 are done and committed (`db85dd9` feature, `4454fe8` S7 docs). The per-step headings above still say "Review" in places; the table at the top is the current status.
- Still open (none P0/P1): S2 non-owner detail returns 403 not 404 and is no longer audited; "Completed" filter now means closed services + approved repairs; "Added by" shows username; migration 059 not yet applied to a production-sized database; WebAPK / production HTTPS acceptance and the near-match "Use existing" path on the phone not done; web bundle-size advisory.
- Test debris: customer "All Servicess" (confirmed, site "S7 Phone Site", no visits) left in the demo DB.
- Separate failing spec noted by Upcoming Services: `manager-dashboard-navigation.spec.ts` (2 tests) still expects the old "Customer Configuration" heading, now "Customers"; this feature's owner must update it.
