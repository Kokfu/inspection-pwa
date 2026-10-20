# S2 — Manager Site Requests

Verified 2026-10-20. Ready for focused review; stop before staging.

## Review P2 follow-up — rapid double-click coverage

Closed 2026-10-20. Two new cases in `supervisor-site-proposals.spec.ts` hold
the decision response while double-clicking approval or rejection. They assert
exactly one POST with the expected body, no early success or follow-up detail read,
and no available decision controls while the response is pending. After releasing
the response, they assert the server-confirmed outcome and a fresh detail read,
with the total POST count still exactly one. Existing retry assertions remain intact.

Verification: **27 S2 browser cases / 65 focused browser cases passed**, zero
failures/skips; web typecheck and production build passed (existing bundle-size
warning); `git diff --check` clean. The focused files are the same six listed below.
Port 4175 was left alone: the run used an in-memory Playwright server/worker
base-URL override to loopback port 4199, with no saved config change.
Only the spec, this verification note and `HANDOVER.md` changed for this follow-up.
No application code, phone, actual offline persistence, live database or browser
restart acceptance was involved. **S2 P0/P1/P2 remaining: 0/0/0. Ready for next step.**

The original implementation verification below is retained as historical evidence.

Admin and supervisor navigation/Home now include **Site Requests**, at
`#/manager-site-proposals`. Home shows an authoritative pending count when the
list is readable; a count failure leaves Home usable without inventing a zero.
The inbox shows customer, submitted site name/address, technician, submission
time and status, with pending requests first. Opening a request reads its current
server detail. Approval adds exactly the technician's submission, with no edit
controls. Rejection requires a trimmed 3–500 character note and explains that the
technician's visit is unchanged. Optional approval notes use the same bounds.

Each decision attempt keeps its UUID and exact body for retries, including an
unknown result after a lost response. POST responses must confirm the proposal ID,
decision, request ID and note. The UI then independently re-reads the detail and
list, requiring both to confirm the status and request ID before showing success.
Failures remove stale detail/actions and offer retry/reload. Domain refusals show
the API's already-decided, active-name-conflict and not-found messages. A 401/403
uses the existing manager authority failure path. Malformed identities, timestamps,
statuses, decision events, unknown fields and duplicate list IDs fail closed.

## Definition of Done

| Gate | Result |
|---|---|
| Navigation, route, admin/supervisor role gate, Home pending badge | PASS |
| Inspector cannot render the page or call its review API | PASS |
| Pending-first list with required submission fields and three statuses | PASS |
| Exact submitted name/address; no edit-on-approve | PASS |
| Approval, rejection, note validation, exact-body/UUID retry after a lost response | PASS |
| Exact POST confirmation plus authoritative detail/list refresh | PASS |
| Already decided, name conflict, not found, unavailable/malformed data, authority refusal | PASS |
| New Playwright mock spec | PASS: 25 tests |
| Focused existing manager/location browser regressions plus new spec | PASS: 63 tests; zero failures/skips |
| Existing role/location API/parser Node regressions | PASS: 16 tests; zero failures/skips |
| Web typecheck / production build | PASS / PASS; existing bundle-size warning |
| Responsive checks | PASS: 360×800, 768×1024, 1280×800; no horizontal overflow, 44px targets, keyboard focus, actions below note field |
| Screenshot inspection | PASS: phone and desktop detail images visually inspected; inbox/detail captures for all three sizes in ignored `apps/web/test-results/` |
| `git diff --check` | PASS; line-ending advisories only |
| Protected paths and historical sources | Working-tree status empty for protected schemas, migrations, lockfiles, deployment files, local DB and historical template/evidence paths |

The final 63-test command covers `supervisor-site-proposals`,
`supervisor-location-proposals`, `location-proposals-unreadable`,
`manager-dashboard-navigation`, `manager-supervisor`, and
`manager-app-auth-transitions`.

An additional broad run included every existing `manager-*.spec.ts`. Its existing
manager/location subset produced **141 passes, 1 failure, 2 existing skips**.
The unrelated failure is `manager-email-reminders.spec.ts:115`: the unscoped
`getByText("Coordinator · coord@example.test")` matches both the effective-recipient
and editable-recipient list entries. That test uses the standalone unchanged
`manager-upcoming-services.html` fixture, without App/Home/Site Requests. No existing
test or reminder implementation was weakened or changed for this failure. The skips
are the existing correction conflict test and former four-option Manager preview.
The broad suite is therefore **not all green**.

## Files changed by S2

| File | Reason |
|---|---|
| `apps/web/src/manager/ManagerSiteProposals.tsx` | Server-authoritative inbox, detail, decisions and retries |
| `apps/web/src/manager/managerSiteProposals.css` | Scoped token-based phone-first layout copied from Location Proposals; actions at content bottom avoid covering note input |
| `apps/web/src/manager/managerApi.ts` | Site proposal DTO, strict validators and API methods only |
| `apps/web/src/manager/roleAccess.ts` | Supervisor route allowlist entry |
| `apps/web/src/manager/ManagerHome.tsx` | Shared navigation entry and independent pending count |
| `apps/web/src/App.tsx` | Import, route parsing/serialization and gated rendering only; concurrent S1 callback changes preserved |
| `apps/web/tests/supervisor-site-proposals.spec.ts` | 25 focused mocked browser cases and responsive screenshots |
| `apps/web/tests/manager-supervisor.spec.ts` | Add the authorized Site Requests card to two exact navigation assertions |
| `HANDOVER.md` | S2 checkpoint while preserving concurrent S1/S3a entries |
| `docs/testing/S2_SITE_REQUESTS.md` | Verification, limitations and reproduction |

## Findings and limits

**S2 P0 remaining: 0. S2 P1 remaining: 0. S2 P2 remaining: 0.**
The phone action overlap found during screenshot inspection is fixed and has a
regression assertion. One unrelated P2 test-selector issue above is deferred to
reminder-test maintenance before a full-release all-green checkpoint. The existing
bundle-size warning remains outside this change.

Retry IDs live for the mounted review page; a browser reload reads current server
state and begins a new review attempt. No decision outbox or IndexedDB change was
introduced. Tests used mocked APIs in real headless Chromium, not the production
API/database. No physical phone, actual offline persistence, installed-PWA restart,
deployment or Level 3 acceptance was performed. Full historical/API integration
gates were not rerun for this web-only task. Historical sources were not edited;
the previously documented baseline exception remains owned by the earlier handover.
Concurrent S1/S3a files and the pre-existing untracked plan directory were preserved.

**READY FOR FOCUSED REVIEW: Y. FULL RELEASE ACCEPTANCE: NOT CLAIMED.**

## Reproduce the focused gates

Run from a normal local shell with Chromium installed and loopback access. Port
4196 must be free; this uses a temporary config and leaves the existing 4175 server
alone. The config is removed in `finally`. No Git mutation is performed.

```powershell
cd C:\PWA_OfflineRecordWebApp
npm run typecheck --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp\apps\web
node --import ../api/node_modules/tsx/dist/loader.mjs --test tests/locationProposalApiW0.test.ts tests/roleAccess.test.ts tests/locationProposalList.test.ts tests/locationProposalReviewShape.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Role/location Node regression failed' }
$s2Config = Join-Path (Get-Location).Path "playwright.s2.verify-$PID.config.ts"
if (Test-Path -LiteralPath $s2Config) { throw 'Temporary config already exists' }
try {
@'
import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({ ...config,
  use: { ...config.use, baseURL: 'http://127.0.0.1:4196' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4196 --strictPort', url: 'http://127.0.0.1:4196', reuseExistingServer: false, timeout: 120000 }
});
'@ | Set-Content -LiteralPath $s2Config -Encoding utf8
  node node_modules/@playwright/test/cli.js test tests/supervisor-site-proposals.spec.ts tests/supervisor-location-proposals.spec.ts tests/location-proposals-unreadable.spec.ts tests/manager-dashboard-navigation.spec.ts tests/manager-supervisor.spec.ts tests/manager-app-auth-transitions.spec.ts --config=$s2Config --workers=2
  if ($LASTEXITCODE -ne 0) { throw 'Focused browser regression failed' }
} finally {
  if (Test-Path -LiteralPath $s2Config) { Remove-Item -LiteralPath $s2Config }
}
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff whitespace failed' }
git status --short
```
