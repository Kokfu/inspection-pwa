# Customer-centred history â€” progress

Last updated: 2026-10-21 (S3a re-review passed; Done; S5 prerequisite cleared)

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
| A | S1 | Shared visit row + unified Service/Repair read query | none | No | Not started | |
| A | S3a | Manager customer table + detail (Details, Sites) + audited edit | none | No (existing audit_events) | Done | 2026-10-21 |
| A | S4 | Near-duplicate customer name warning | none | No | Not started | |
| B | S2 | Customer timeline + non-owner guard | S1 | No | Not started | |
| B | S5 | Confirmed flag + Unconfirmed chip + Confirm action | S3a | Likely (flag) | Not started | |
| C | S3b | Timeline tab inside manager customer detail | S2, S3a | No | Not started | |
| C | S6 | Technician Home: Open work + Recent completed shortcut | S2 | No | Not started | |
| D | S7 | Verification, phone check, docs | all | No | Not started | |

## Step log
(Append an entry per step when work happens. Format below.)

### S? â€” <title>
- Status:
- Date:
- Files changed:
- Behaviour changed:
- Tests run:
- P0/P1/P2 findings:
- Limitations / next:

## Open questions
- Resolved by S3a: migration 002 provides audit_events; customer updates and structured old/new audit values share one transaction. No migration required.
- Confirmed flag: can an existing column carry it, or is a migration justified? (S5 to check first)

### S3a â€” Manager customer table + detail + audited edit
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

### S3a review remediation â€” 2026-10-21
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

### S3a commit checkpoint â€” 2026-10-21
- Status: Done. User explicitly authorized staging and committing S3a, overriding the standing manual-Git rule for this commit only.
- Focused re-review passed: P0/P1/P2 0/0/0; Chromium 9/9, role-access 4/4, web typecheck/build and git diff --check passed. API was unchanged by remediation; its earlier disposable-PostgreSQL suite passed 15/15.
- Commit scope: S3a API, table/detail/editor, browser tests and S3a documentation only. Shared-file index content excludes concurrent S1/S2/S3b/S4 implementations and logs; their working files are preserved.
- Next: S5 is unblocked; S3b also requires S2 acceptance. Physical-phone/offline/restart/deployment acceptance remains with S7. Nothing pushed.
