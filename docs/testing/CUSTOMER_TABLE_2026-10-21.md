# Customer desktop table — 2026-10-21

Ready for focused review. Scoped P0/P1/P2: **0/0/0**.

## Prompt B menu review remediation

2026-10-21: fixed the two new menu defects identified by focused review. A document click listener closes open customer action disclosures when a click lands outside them, including controls that stop event propagation; it is removed when the table unmounts. Outside clicks retain the clicked control's normal focus. Archive returns focus to the disclosure trigger before invoking the unchanged confirmation handler, so cancelling confirmation keeps keyboard navigation at the customer's actions.

Added a Playwright regression for outside clicks on a heading and the search field, keyboard Archive cancellation with zero writes, trigger focus restoration, and subsequent Tab navigation. The new regression failed on the original outside-click behavior before the implementation fix. Existing Escape, responsive layout, Archive domain/network/authorization, and IndexedDB draft tests remain intact.

Verification rerun: **19 customer-record tests + 2 search/configuration tests passed, no skips**; web typecheck and production build passed (existing large-chunk warning). `git diff --check` passed with line-ending warnings only. No CSS, API, schema, lockfile, deployment or Git mutations. The mixed working-tree scope finding from review remains; unrelated tasks were not changed by this remediation. No physical-phone, actual screen-reader, live API or installed-PWA acceptance was performed. Ready for focused re-review of the two defects.

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
$env:S3A_TEST_PORT='4198'
npx playwright test --config tests/manager-customer-records.config.ts --workers=1 --reporter=line
npx playwright test tests/manager-customer-filter.spec.ts tests/manager-customer-configuration.spec.ts --workers=1 --reporter=line
npm run typecheck
npm run build
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

## Changes

- `apps/web/src/manager/ManagerCustomerRecords.tsx`: five desktop columns, real focusable customer-name and Manage buttons, whole-row Manage, site count/code, Active/Unconfirmed chips, contact lines or muted No contact, UK short-month dates, native keyboard-accessible actions disclosure. Archive still calls the unchanged confirmation/authority handler in `ManagerCustomerConfiguration.tsx`.
- `apps/web/src/manager/managerCustomerRecords.css`: fixed desktop column widths, token-based styling, ellipsis/title support, single-line action cells, menu positioning and focus/hover states. Phone card content and layout retained below 768px.
- `apps/web/tests/manager-customer-records.spec.ts`: updated date/badge assertions; added 1920px single-line action-height proof, empty contact/long text coverage, keyboard/row Manage, Archive cancellation/domain/network/authorization handling, and distinct Archived/Restore coverage.
- `apps/web/tests/manager-customer-filter.spec.ts`: current table/search selectors, retaining search-on-submit/name/code/clear behavior assertions.
- `HANDOVER.md` and this note: checkpoint and verification evidence.

## Verification

| Gate | Result |
| --- | --- |
| Focused Playwright | PASS: 20 tests, no skips |
| Web typecheck | PASS |
| Web production build | PASS; existing large-bundle warning |
| `git diff --check` | PASS; line-ending warnings only |
| 1920px actions | PASS: Manage and disclosed Archive equal their single-line/minimum height; labels do not wrap |
| Responsive screenshots | PASS: 1920×1080, 375×800, 360×800, 768×1024, 1280×800; no horizontal page overflow |
| UI audit | PASS for changed desktop controls: native focusable buttons/disclosure, named ellipsis control, Escape/focus return, text status, truncation, empty state, Intl dates, visible focus and token styling |

Screenshots from the final focused run:

- [1920px desktop](../../apps/web/test-results/manager-customer-records-d-10976--and-long-text-are-readable/customers-1920.png)
- [375px phone](../../apps/web/test-results/manager-customer-records-d-10976--and-long-text-are-readable/customers-long-375.png)
- [768px tablet](../../apps/web/test-results/manager-customer-records-d-10976--and-long-text-are-readable/customers-long-768.png)

## Limits and deferred test maintenance

An additional exploratory run included `manager-site-archive-restore.spec.ts`. Its first two cases failed: line 38 cannot find the Archived sites disclosure; line 67 cannot click the site Archive action. The helper opens the customer on Details while these controls are inside the hidden Sites tab. The broader run was interrupted after those failures; it is **not** an all-green suite claim. These site-detail tests were left unchanged; full-release test maintenance owns this unrelated harness issue. The focused customer-list Archive/authority regressions above pass.

Screenshots use isolated mocked browser fixtures, including deliberately extreme long text. No live API/database, physical phone, installed-PWA restart or actual offline-persistence acceptance was performed. The network-failure Archive case is a mocked request failure.

No Git mutations, Docker/Compose, schema, lockfile or customer-data edits. Only the requested read-only Git whitespace check was used; existing worktree changes and historical byte identity were not independently audited. Historical templates were not edited by this task. Broad API/deployment gates are outside this Level 1 UI checkpoint.

## Reproduce

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
$customerCheckConfig = Join-Path (Get-Location) 'playwright.customer-layout-check.config.ts'
if (Test-Path -LiteralPath $customerCheckConfig) { throw 'Temporary config already exists' }
(Get-Content playwright.config.ts -Raw).Replace('4175', '4198') | Set-Content -LiteralPath $customerCheckConfig
try {
  npx playwright test tests/manager-customer-records.spec.ts tests/manager-customer-filter.spec.ts tests/manager-customer-configuration.spec.ts --config $customerCheckConfig --workers=1 --reporter=line
  if ($LASTEXITCODE -ne 0) { throw 'Focused customer checks failed' }
} finally {
  Remove-Item -LiteralPath $customerCheckConfig
}
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
```

Port 4198 must be free. Browser execution required an unsandboxed runner because the sandbox could not reach the local dev server. Temporary config was removed after the final run. Stop before staging.
