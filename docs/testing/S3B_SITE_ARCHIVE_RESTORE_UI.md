# S3b — Manager site archive / restore UI

2026-10-20. Implements the existing S3a contract without API, schema, migration,
Dexie, lockfile, deployment or production-data changes.

## Behaviour

- Admin customer configuration has Archive in each active site row. Confirmation
  explains new-visit availability and preservation of existing visits/reports;
  archiving the last active site adds a warning without blocking.
- Archived sites starts collapsed and offers Restore. A 409 name clash displays
  the server message and keeps the site available for retry.
- Both helpers POST `{}` through the existing manager request/error path.
  Success requires a validated customer response with matching customer ID,
  both site lists, unique IDs across the lists, and the exact requested site
  in the expected list only. The UI replaces customer data with that response.
- Customer-detail loading validates the existing full customer shape and any
  supplied archived entries before rendering. The new optional type field keeps
  older customer fixtures/callers compatible; mutation responses require it.
- Authorization, network, server and malformed-response failures use the existing
  authority-failure callback. There is no optimistic list update or stale fallback.
- The existing admin route gate also gates Add Site and these new controls.
  Supervisors retain their existing read-only customer/review routes.

## Review fixes (2026-10-20)

- Archive/restore completion callbacks are scoped to the originating customer
  screen generation. Leaving that screen invalidates late success, error and
  cleanup callbacks, so an old response cannot replace a newly opened customer
  or revoke its authority after a stale authorization failure. The server write
  itself is not cancelled or assumed unsuccessful.
- Shared customer validation rejects duplicate site IDs within the active list,
  within the archived list, or across both lists. Detail GET and mutation responses
  now enforce the same invariant before rendering any site controls.
- Seven added mock-browser regressions cover three duplicate-list cases and both
  archive/restore actions returning delayed success or authorization failure after
  navigation to another customer. Existing assertions remain intact.

## Task-owned changes

- `apps/web/src/manager/ManagerCustomerConfiguration.tsx`: controls, confirmation,
  collapsed archive list and server-returned customer replacement.
- `apps/web/src/manager/managerApi.ts`: additive archived-site type/validation,
  archive/restore helpers and validated customer-detail loader. Earlier S2 API
  client changes in this file are preserved.
- `apps/web/tests/manager-site-archive-restore.spec.ts`: 33 mock browser cases,
  including existing add/address flows, authority failures, supervisor gate,
  responsive sizing and screenshots.
- `HANDOVER.md`: checkpoint entry; earlier work preserved.
- This verification note.

## Verification

| Gate | Result |
| --- | --- |
| New site archive/restore spec | PASS — 33 cases, including all seven review regressions |
| Existing App authorization, customer configuration and supervisor specs | PASS — 18 cases (App harness includes 24 internal scenarios) |
| Existing service editor | PASS — 10 cases; 1 pre-existing CR-09 former-four-option preview test intentionally skipped |
| Web typecheck / production build | PASS — final repeated run passed; existing bundle-size warning |
| Responsive checks | PASS — 360×800, 768×1024, 1280×800; no horizontal overflow, action targets at least 44px, keyboard focus checked |
| Visual inspection | Phone and desktop screenshots inspected under ignored `apps/web/test-results/site-archive-*.png` |
| Diff whitespace / protected files | PASS; line-ending advisories only; protected historical templates, migrations, V6 evidence/acceptance and lockfiles have no working-tree changes |

**Review-fix rerun: 61 browser cases passed; 1 pre-existing intentional skip. Web typecheck, production build and diff whitespace passed. Ready for focused S3b re-review.**

P0/P1/P2 in S3b scope: **0/0/0**. Existing build chunk-size warning remains.
No physical-phone, actual offline persistence, installed-PWA force-close/restart,
live API/database or deployment acceptance performed. No staging or Git mutations.
Other pre-existing worktree changes belong to earlier checkpoints.

## Reproduce

```powershell
cd C:\PWA_OfflineRecordWebApp
npm run typecheck --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp\apps\web
npx playwright test tests/manager-site-archive-restore.spec.ts tests/manager-app-auth-transitions.spec.ts tests/manager-customer-configuration.spec.ts tests/manager-supervisor.spec.ts tests/manager-service-editor.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Browser regressions failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff whitespace failed' }
git status --short
```

Playwright requires local Chromium and loopback access. The first sandboxed run
could not reach its test server; it was stopped and the successful suite ran
with loopback access. No real customer data is used by these mocks.
