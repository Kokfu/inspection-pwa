# CR-05 — Compact remaining inspections

2026-10-10. Display-only change; ready for owner review. Stop before staging.

The requested native details/summary disclosure is collapsed by default. Its summary uses the existing server
completion counts. Each incomplete unit retains its system name, unit label and original reason in a compact
row. The unavailable-data reconnect message stays visible. Ready to Complete and the Complete Service action
are unchanged. No alternative layout was clearly better for this scope.

| Definition of Done | Result |
| --- | --- |
| Web typecheck | PASS |
| Web production build | PASS; existing large-chunk warning |
| Affected Playwright specs | PASS, 5/5, no skips |
| Static UI regressions | PASS, 19/19, no skips |
| 360px single-line collapsed block, hidden list, counts, expansion | PASS |
| Keyboard Enter/Space, visible focus, summary >=44px | PASS |
| 768px and 1280px browser checks; phone/desktop screenshots inspected | PASS |
| Ready panel and unavailable message preserved | PASS |
| Web Interface Guidelines audit of changed markup/styles | PASS, no findings |
| git diff --check | PASS |
| Protected historical file status | PASS, targeted git status --short returned no entries |

Historical templates and acceptance paths were not edited. This task does not run the broader API/integration
or release gates: the owner's explicit Level 1 DoD governs this display-only change. Physical phone, installed
PWA force-close and deployment acceptance were not performed or claimed.

P0 remaining: 0. P1 remaining: 0. P2 findings in this scope: 0.
SAFE FOR OWNER REVIEW: Y. Unrelated working-tree changes remain untouched.

Files changed:

- `apps/web/src/jobs/TechnicianHome.tsx`: native collapsed disclosure and compact unit identities.
- `apps/web/src/styles/app.css`: token-based compact layout, touch target and focus/hover styles.
- `apps/web/tests/final-ui-acceptance.test.tsx`: asserts collapsed markup and retained identities/reasons.
- `apps/web/tests/job-completion-workflow.html`: production styles, display fixtures; updates obsolete progress
  wording assertions to exact current text while retaining the count and synced-status checks.
- `apps/web/tests/job-completion-workflow.spec.ts`: viewport, keyboard, visibility and completion regression checks.
- `HANDOVER.md`: latest checkpoint.
- This report: evidence and reproducible commands.

The normal Playwright port 4175 was occupied. Verification used isolated port 4178. The initial sandbox build
failed with EPERM resolving main.tsx; the same production command passed outside the sandbox. An isolated
sandbox browser run stalled and was cancelled; the successful browser run also used the host environment.

Run in a host PowerShell terminal with dependencies and Playwright Chromium installed. Port 4178 must be free.
No API or database is needed; these harnesses render the real component with fixture props.

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps/web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/final-ui-acceptance.test.tsx
if ($LASTEXITCODE -ne 0) { throw 'UI regressions failed' }
if (Test-Path -LiteralPath .cr05-verify.config.ts) { throw 'Temporary config already exists' }
@'
import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({ ...config, outputDir: './test-results/cr05', use: { ...config.use, baseURL: 'http://127.0.0.1:4178' }, webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort', url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 120000 } });
'@ | Set-Content -LiteralPath .cr05-verify.config.ts
try {
  npx playwright test tests/job-completion-workflow.spec.ts --workers=1 --config .cr05-verify.config.ts
  if ($LASTEXITCODE -ne 0) { throw 'CR-05 browser checks failed' }
} finally {
  Remove-Item -LiteralPath .cr05-verify.config.ts
}
cd C:\PWA_OfflineRecordWebApp
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
git status --short -- apps/api/src/inspections/templates apps/api/migrations/017* apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
```
