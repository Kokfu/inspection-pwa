# FR-08 account reactivation — 2026-10-22

Manager-only `POST /api/manager/technicians/:id/reactivate` restores an inactive
Technician (`inspector`) or review-only Admin (`supervisor`). Password hashes and
assignments are preserved. Previously revoked sessions remain revoked; any lingering
unrevoked sessions are invalidated during activation. A fresh sign-in is required.

The empty POST body mirrors deactivate. There is no request/operation-ID mechanism
on that route: idempotency here uses the locked current account state. An already
active account returns the same account without an update, session change or audit.
The activation and `manager_technician_reactivated` audit event commit atomically.
Unknown, hidden, deleted and Manager-role targets return 404. Unauthorized callers
receive 401/403 through the existing audited guard.

The schema has a global, case-sensitive `users.username` unique constraint, not an
active-only users-name index. Display names have no unique index. Reactivation checks
exact username or non-null display-name equality against another active account.
It returns 409 `ACCOUNT_NAME_CLASH` with a helpful message. A short table lock
serializes the check with all user writes, including concurrent activation/create/
rename, without a migration. Existing create/rename/deactivate/remove/reset behavior
is unchanged.

The inactive row offers Reactivate, with role-specific confirmation, busy disabling,
exact-account response validation, an authoritative list refresh and a success
notice only after that refresh succeeds. A 409 leaves the row inactive and shows the
server message. The concurrent Staff role-filter work is preserved; the guide uses
its new **Show deactivated staff** label. No IndexedDB, browser storage, outbox,
schema, migration, dependency lockfile, deployment or production-account change.

## Verification

| Gate | Result |
|---|---|
| API typecheck/build | PASS |
| Historical compatibility matrix | PASS — 20 tests |
| V6 evidence / contract regression | PASS — 11 tests |
| Wet Chemical definition | PASS — 2 tests |
| V7 evidence contracts + config + manager technician unit tests | PASS — 44 tests |
| Web API-client regression | PASS — 1 test |
| Web stale-evidence standard gate | PASS — 1 test |
| Shared Staff browser regression, including FR-08 | PASS — 27 tests (3 FR-08 + 24 existing/filter regressions) |
| Web typecheck/build after shared filter edits | PASS — production PWA build; existing large-chunk warning only |
| FR-08 + existing manager + standard V6/V7 cold-DB gate | PASS — 25 tests, 9 files, 0 failures, 0 skips; fresh container removed |
| `git diff --check` | PASS — CRLF notices only |
| Protected historical files unchanged by FR-08 | PASS — scoped `git status --short` has no entries |
| All protected files byte-identical to `e30c649` | EXCEPTION — pre-existing HEAD change described below |

The browser tests check confirmation/cancellation for both roles, list refresh,
busy state, 409 display with an open password form, 360/768/1280 layouts, 44px
targets, 16px button text and keyboard focus. Phone and desktop screenshots were
generated under the ignored `apps/web/.fr08/test-results/` directory and inspected.
No installed-PWA force-close, physical-phone, deployment or Level 3 claim is made.

Initial sandbox attempts failed because localhost access, temporary-file renames
and Chrome launching were restricted; those checks passed with the required local
execution access. Playwright browser download was unavailable (DNS), so installed
Chrome was used. Initial browser focus assertions were corrected to enter keyboard
navigation before checking `:focus-visible`. A run during the concurrent Staff
filter edit exposed three ambiguous test labels, corrected by that task.

The first cold-DB attempt could not bind 55432 because another run owned it. A later
fresh-container run reached concurrent `test_records` schema creation and failed
before executing the reactivation assertions. Older integration-test processes and
another full API gate were still active. Only this task's own disposable container
was removed. That attempt was not a passing integration result. The subsequent
clean run used unique disposable credentials and passed all 25 tests across nine
files, with no failures/skips, before removing its own container successfully.

Cold-DB counts by file: FR-08 5; manager technician unit 6; existing manager
technician integration 1; manager technician visits 1; V6 acceptance 1; CO2 V7 4;
Wet Chemical V7 2; Fire Alarm V7 4; V7 evidence race 1. The six manager unit tests
also appear in the separate 44-test gate; they are not additional unique coverage.

## Findings and limits

- P0/P1 implementation findings: none identified; requested integration proof closed.
- Pre-existing P2 baseline discrepancy: `fireAlarmV6Evidence.ts` in HEAD differs
  from `e30c649` in two lines: PostgreSQL bigint `uploader_user_id` is typed/string-
  compared with `String(actorUserId)`. FR-08 does not modify that file. V1–V6
  template sources and the other protected paths have no baseline delta. The owner
  should reconcile the stale baseline requirement at the next release checkpoint.
- This task does not stage, commit or alter Git history. Unrelated work already
  present in the shared tree is retained.

**P0 remaining: 0. P1 remaining: 0.** One pre-existing P2 baseline-documentation
exception is deferred to the owner at the next release checkpoint. FR-08 is ready
for focused review. **SAFE FOR SOL REVIEW: Y.** This is not a Level 3 release claim.

## Files changed for FR-08

| File | Reason |
|---|---|
| `apps/api/src/routes/managerTechnicians.ts` | Manager-only atomic, idempotent reactivation with clash/session checks |
| `apps/api/src/routes/managerTechniciansReactivate.integration.test.ts` | Real-login, authorization, retry, concurrency, clash, password-reset and rollback proofs |
| `apps/web/src/manager/ManagerTechnicians.tsx` | Confirmed Reactivate button, busy state and refreshed success notice; shared filters preserved |
| `apps/web/src/manager/managerApi.ts` | Exact-account and active-state-validated client function |
| `apps/web/tests/manager-technicians-reactivate.spec.ts` | Both roles, confirmation, busy state, refresh, 409 and responsive/focus checks |
| `apps/web/tests/managerTechnicianReactivateApi.test.ts` | Client request, response validation and 409 propagation |
| `apps/web/tests/fr08-chrome.config.ts` | Dedicated test port and optional installed-Chromium path |
| `scripts/testing/Test-Fr08Reactivate.ps1` | Reproducible fresh disposable DB and sequential per-file gates |
| `docs/handover/02-user-guide.md` | One reactivation instruction using current Staff copy |
| `HANDOVER.md` | Current checkpoint and link to this evidence |
| `docs/testing/FR08_REACTIVATE_2026-10-22.md` | Gate results, limitations, baseline exception and reproduction commands |

The filter task independently changed `ManagerTechnicians.tsx` and the existing
`manager-technicians.spec.ts`, including the Staff wording in the new FR-08 spec.
Those edits are preserved and covered by the 27-test shared browser run.

## Reproduce

Run when no other integration-test process uses port 55432. The cold script creates
and removes its own uniquely named container, overwrites `DATABASE_URL` even if it
was already set, and restores the previous environment afterward. It never stops
another run's database. It runs each suite in its own process.
It generates a disposable password unique to this run, preventing older test
processes using the shared placeholder credential from reconnecting to the new DB.

```powershell
cd C:\PWA_OfflineRecordWebApp
$env:REPORT_CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/testing/Test-Fr08Reactivate.ps1
if ($LASTEXITCODE -ne 0) { throw 'FR-08 cold-DB gate failed' }
cd apps/api
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed' }
npm run build; if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
npm run test:historical-matrix; if ($LASTEXITCODE -ne 0) { throw 'Historical matrix failed' }
npm run test:v6-evidence; if ($LASTEXITCODE -ne 0) { throw 'V6 evidence failed' }
npm run test:wet-chemical-definition; if ($LASTEXITCODE -ne 0) { throw 'Definition failed' }
node --import tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Contract/config tests failed' }
cd C:\PWA_OfflineRecordWebApp\apps\web
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build; if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/managerTechnicianReactivateApi.test.ts
if ($LASTEXITCODE -ne 0) { throw 'API-client test failed' }
npm run test:v7-stale-evidence; if ($LASTEXITCODE -ne 0) { throw 'Stale evidence failed' }
npx playwright test --config tests/fr08-chrome.config.ts tests/manager-technicians-reactivate.spec.ts tests/manager-technicians.spec.ts tests/manager-technician-services-done.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Browser gate failed' }
cd C:\PWA_OfflineRecordWebApp
git status --short
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

The browser config also works with Playwright's installed Chromium when
`REPORT_CHROMIUM_PATH` is omitted. Use an existing Chromium executable for PDF
gates; no browser installation or package change is part of FR-08.
