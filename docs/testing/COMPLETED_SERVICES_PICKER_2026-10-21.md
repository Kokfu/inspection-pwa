# Completed Services customer picker — 2026-10-21

Ready for focused review. No Git mutations, Docker/Compose, database/Dexie schema, lockfile, deployment, historical-template or report-renderer changes were made. The only Git command used was the explicitly requested `git diff --check`; status/history commands were not used, respecting the task's instruction not to touch Git.

## Behavior

Technician Completed Services now owns one left-aligned workspace heading (Technician workspace / Completed Services), has no Back button, and uses Select customer for both label and placeholder, with the exact helper sentence: Pick a customer to see their finished visits.

Customer history is opened by buttons on technician Home and New Service Visit. It retains Back to Home. The shared component defaults showBack to true. The offline customer-catalog branch, service-detail 10-second timeout and AbortController handling remain intact.

Manager Current Services Done uses the same CustomerTimelineRoute in server mode with initialStatus closed. A labeled Filter customers search input filters the native Select customer by name or code as the user types. Native keyboard selection, aria-controls, descriptive help and a live option count support assistive technology. A selected customer remains available if the filter text changes.

Manager service summaries come from the existing authorized manager history API, including pagination; repairs come from the existing repair-list hook. This preserves supervisor access without changing the admin/inspector-only customer-summary endpoint. Results pass the shared strict timeline parser; stale responses cannot replace a newer customer. Site names are mapped to a current catalog ID only when unambiguous.

Retained manager capabilities beneath the timeline: technician names, service/repair opening, Final Report view and PDF download, site-grouped history, From/To/Status/Technician filters with Apply/Clear, archived visibility, admin archive (with confirmation) and restore, pagination, Change customer, selected-customer/applied-filter session restoration, report-return navigation, and supervisor restrictions. Existing data helpers remain in place. ManagerHome and roleAccess were inspected and needed no edits.

## Verification

| Gate | Result |
| --- | --- |
| Focused Playwright (four specs) | PASS — 36 tests, no skips |
| Timeline unit/regression tests | PASS — 6 tests |
| Web typecheck | PASS |
| Production web build | PASS — existing large-chunk warning |
| git diff --check | PASS — CRLF notices only |
| Live technician-demo / mobiletest at 1920 and 375 | PASS |
| Additional live widths 360, 768, 1280 | PASS |
| Live technician history Back / manager Final Report | PASS |
| Phone/PWA force-close/reopen acceptance | Not run; not this UI checkpoint |

Live Chromium used the edited Vite source with requests proxied to the existing https://localhost API. Both supplied credentials were verified; no credentials were saved in source. The temporary preview normalized Origin to the API origin; the first preview attempt was rejected by the existing origin protection, despite the UI's generic login-error message. No production application or proxy security setting was changed. Business data was read only; normal login/session auditing occurred. The Docker-served bundle was not redeployed. Screenshots are retained under `apps/web/test-results/completed-services-live/`. Desktop/phone viewport screenshots were visually inspected for layout, clipping, native picker focus and no horizontal overflow.

The initial broader run observed three unrelated stale-heading failures: both manager-dashboard-navigation tests still expect Customer Configuration where the untouched screen now says Customers, and one manager-experience-restore test still expects My Service Jobs where untouched Home says Open work. These are deferred to existing-navigation test maintenance before a full release gate. The task-related Search-button and old search-field selectors were updated and their full focused suites pass. The remaining Customer name or code expectation belongs to the separate Customer Configuration filter and still matches its implementation; it was preserved.

P0 remaining in scope: 0. P1 remaining in scope: 0. P2 remaining in scope: 0. Deferred outside scope: stale-heading test maintenance (three tests) and the existing bundle-size warning. This checkpoint is ready for review, not a claim that the full repository suite or physical-phone release acceptance passed.

## Files changed

- apps/web/src/App.tsx — pass route-specific heading/showBack and authenticated manager actor; remove outer duplicate heading.
- apps/web/src/visits/CustomerTimelineRoute.tsx — optional Back, workspace heading, shared accessible customer picker.
- apps/web/src/visits/CustomerTimeline.tsx — optional manager loader and nested heading level.
- apps/web/src/visits/CustomerTimeline.css — token-based fluid picker styles and touch sizing.
- apps/web/src/visits/customerTimelineData.ts — allow supervisor read-only row navigation; server guards unchanged.
- apps/web/src/manager/ManagerServicesDone.tsx — shared timeline/picker with manager adapter; retain existing manager tools/helpers.
- apps/web/tests/customer-timeline.spec.ts — current label and preserved history Back coverage.
- apps/web/tests/technician-sidebar-navigation.spec.ts — no Back, exact heading/helper/label coverage.
- apps/web/tests/manager-technician-services-done.spec.ts — name/code filtering, keyboard selection, completed timeline, report round trip, existing manager/session coverage; valid site UUID fixtures.
- apps/web/tests/manager-supervisor.spec.ts — picker selectors, completed repair/site filtering and supervisor navigation.
- apps/web/tests/completed-services.config.ts — focused local Vite/Chromium harness.
- HANDOVER.md — checkpoint link/status.
- docs/testing/COMPLETED_SERVICES_PICKER_2026-10-21.md — this report.

## Reproduce focused gates

```powershell
cd C:\PWA_OfflineRecordWebApp
npm run typecheck --prefix apps/web
npm run build --prefix apps/web
cd apps/web
node --import ../api/node_modules/tsx/dist/loader.mjs --test tests/CustomerTimeline.test.tsx
node node_modules/@playwright/test/cli.js test --config tests/completed-services.config.ts --workers=1
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

Stop before staging. SAFE FOR FOCUSED REVIEW: YES.

## Focused review remediation — 2026-10-21

The review identified two P2 consistency defects: archive/restore refreshed only the manager cards, and Refresh history reused the repair list loaded earlier.

- Confirmed archive/restore now notifies the shared timeline to reload, retaining its current filters. Failed mutations do not invalidate it. A customer/unmount generation guard prevents a late mutation response from refreshing a different customer's view.
- The timeline loader now awaits a fresh repair-list reload and uses that exact result. The repair panel receives the same refreshed list. The reload callback has a stable identity, so its loading/ready state updates do not trigger a fetch loop. Failed, malformed, aborted or superseded repair loads cannot supply stale timeline rows; the existing authorization-failure handler remains in use.
- Added browser regressions for archive refusal, archive/restore consistency with preserved site filtering, newly approved repairs appearing after Refresh history, and malformed/503 refresh failures clearing timeline rows with successful retry recovery.

Files changed for remediation: `ManagerServicesDone.tsx`, `ManagerCustomerServiceHistory.tsx`, `repairVisits/RepairVisitEntries.tsx`, `manager-technician-services-done.spec.ts`, `manager-supervisor.spec.ts`, this report and `HANDOVER.md`. No technician loader, schema, API, lockfile or deployment changes.

Remediation verification:

| Gate | Result |
| --- | --- |
| Four focused Prompt A Playwright specs | PASS — 38 tests (2.4m), no skips |
| Timeline unit/regression tests | PASS — 6 tests, no skips |
| Web typecheck | PASS — exit 0 |
| Production web build | PASS — exit 0; existing large-chunk warning |
| git diff --check | PASS — CRLF notices only |
| Additional legacy customer-history spec | FAIL — one stale harness, described below |

The additional `manager-customer-service-history.spec.ts` run failed because its unchanged HTML harness waits for `#manager-service-history-title` inside Customer Configuration. That unchanged screen now renders Details/Sites/Timeline tabs and no longer imports `ManagerCustomerServiceHistory`. The harness fails before exercising the remediated component. Neither the test nor its assertions were changed or weakened. This outside-scope P2 belongs to full-release test maintenance before a full-suite acceptance gate; it is not counted as a passing regression.

Both review defects are closed by the focused regressions. P0/P1/P2 remaining in remediation: 0/0/0. Deferred outside scope: the legacy customer-history harness failure above, the previously documented stale navigation-heading tests and bundle-size warning. Ready for focused re-review. Live demo accounts, physical phones and installed-PWA force-close/reopen were not retested in this remediation. No Git mutations were performed.
