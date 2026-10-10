# CR-11 — Admin display wording

10 October 2026. Wording-only change. Internal roles, ProductRole, routes, API/JSON fields, stored records, schema, keys and permissions are preserved. Existing `admin` accounts still use **Manager**; `supervisor` accounts now choose **Admin** and use their existing review workspace.

## Definition of Done — explicit Level 1 scope

| Gate | Result |
|---|---|
| Web typecheck and production build | PASS; existing large-chunk warning only |
| Affected Playwright specs | PASS: all 55 cases covered; initial 54/55, then complete manager-corrections spec 12/12 after updating its last old-wording assertion |
| Touched web node tests | PASS: roleAccess + locationProposalReviewShape, 8/8 |
| API typecheck | PASS |
| Changed API wording integration tests | PASS: managerTechnicians + reportApprovals, 2/2, no skips |
| Report/PDF regressions | PASS: reportReview 1/1, renderReportHtml 13/13, including real Chromium PDF generation and legacy snapshot |
| Card/sign-in at 360×800, 768×1024, 1280×800 | PASS: 3 browser checks; no horizontal overflow, six screenshots; phone card and desktop sign-in visually inspected |
| Final grep and per-hit classification | PASS: 446 matching lines; [exact GNU grep output](CR11_SUPERVISOR_GREP.txt), [every hit classified](CR11_SUPERVISOR_AUDIT.md) |
| git diff --check | PASS; CRLF notices only |
| Protected scope | PASS: no migrations, Dexie/schema/index changes, lockfiles, historical template or infrastructure edits, production-data writes or Git mutations |

The task's explicit Level 1 gates supersede the standing brief's broader suite. Deployment, real offline/force-close and phone acceptance were not performed. Initial PDF checks lacked a Windows Chromium path; the successful rerun set REPORT_CHROMIUM_PATH. Initial disposable DB startup was not host-TCP-ready; successful runs explicitly checked host TCP readiness. New staff-error fixtures were corrected to reach their intended validation branches; validators stayed unchanged. All successful API suites used a fresh disposable Postgres on 127.0.0.1:55432, removed afterward.

## Duplicate Admin labels — owner decision deferred

Both underlying review roles now read **Admin** in each of these places:

1. AcceptedCorrectionsPanel: correction-author role in accepted-record history.
2. ManagerCorrectionEditor: correction-author role in field history.
3. ManagerFinalReportView: approval/last-decision actor role.
4. ManagerFinalReportView: correction-author role in the correction list.
5. ManagerLocationProposals: approval/rejection actor role.

The following also use Admin for the review role alongside the existing administrator concept:

- ManagerTechnicians: Admin (review only), Add Admin, badge, Assigned Admins, empty-state and deactivation prompt. Old `admin` accounts remain excluded from the staff endpoint/list.
- ManagerEmailReminders: Admin staff label; old `admin` accounts remain excluded.
- ManagerReminderPlan: active technicians and Admins, recipient role label; old `admin` accounts remain excluded.
- RoleSelection/LoginForm/App/ManagerHome/ManagerOperations: Admin review-card/access/workspace wording; Manager still opens the existing administration workspace.
- API staff errors and PDF-approval wording now say Admin; internal codes, identities and permission checks remain distinct.
- USER_GUIDE, ADMIN_ACCOUNT_RECOVERY and EVIDENCE_POLICY: Admin review-role wording alongside administrator/Manager terminology. References to the existing sign-in cards clarify recovery and differing access. No new role label was invented.

## Already-submitted reports and stored data

| Surface | Classification |
|---|---|
| Accepted records, Operations, correction editor, web Final Report review heading | Built at read/render time: Reviewed by Admin. Existing identities, answers and dates unchanged. |
| Correction/decision actor role annotations | Display adapter only. Stored and API `correctedByRole`/`decidedByRole` remain `admin` or `supervisor`. |
| Fresh PDF downloads | Built on request by createFinalReportPdfHandler/current renderer; new PDFs show Reviewed by Admin when review metadata exists. Historical sections lacking review metadata retain their layout/text. |
| reviewedBy | Identity selected from reviewer username via stored user ID in managerCorrections/finalServiceReport; not a saved Supervisor label. Not rewritten. |
| Existing generated PDFs/files, saved text, usernames, display names and user-authored content | Not rewritten. Previously generated PDFs retain their original wording. No migration or retroactive update. |
| Outgoing reminders/e-mail | Remaining source matches are internal filters/fixtures. No Supervisor label was found in outgoing templates; recipients and stored addresses unchanged. |

ManagerServicesDone contains internal names/comments only and needed no edit. roleAccess keeps its existing authority logic and adds a pure display-label function. CSS comments are intentionally untouched by CR-11.

## Findings and checkpoint

P0 remaining: 0. P1 remaining: 0. P2: owner-directed duplicate Admin terminology above, deferred to a later owner decision; it does not block this checkpoint.

Historical immutability intact for CR-11: V1–V6 templates, V6 evidence/acceptance, historical report and migrations unchanged from HEAD; scoped git status empty. The standing brief's older e30c649 baseline already differs in fireAlarmV6Evidence.ts by two committed line replacements before this task. CR-11 did not touch that file and does not claim the current repository is wholly byte-identical to that old commit.

Unrelated edits, including concurrent CR-05 work, remain outside this report. Existing modified Roller Shutter form/setup and referenceDataApi received only the necessary CR-11 text changes; their other hunks were preserved. HANDOVER retains the other checkpoint.

SAFE FOR OWNER REVIEW: Y. Stop before staging. No deployment or Git mutations.

## Reproducible Level 1 checks

Fresh PowerShell with Docker Desktop running. Port 4186 must be free. DATABASE_URL is explicitly overridden. Only the newly named disposable test container is removed. The temporary browser config must not already exist.

```powershell
cd C:\PWA_OfflineRecordWebApp
$env:REPORT_CHROMIUM_PATH=(node -e "import('./apps/web/node_modules/@playwright/test/index.mjs').then(m=>console.log(m.chromium.executablePath()))").Trim()
if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Chromium unavailable' }
cd apps/web
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build; if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
..\api\node_modules\.bin\tsx.cmd --test tests/roleAccess.test.ts tests/locationProposalReviewShape.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Web node tests failed' }
$configPath='C:\PWA_OfflineRecordWebApp\apps\web\playwright.cr11.config.ts'
if (Test-Path -LiteralPath $configPath) { throw 'Temporary config exists' }
@'
import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({ ...base, use: { ...base.use, baseURL: "http://127.0.0.1:4186" }, webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4186 --strictPort", url: "http://127.0.0.1:4186", reuseExistingServer: false, timeout: 120_000 } });
'@ | Set-Content -LiteralPath $configPath
try {
  npx playwright test --config playwright.cr11.config.ts tests/manager-supervisor.spec.ts tests/manager-technicians.spec.ts tests/accepted-corrections-panel.spec.ts tests/location-proposals-unreadable.spec.ts tests/manager-corrections.spec.ts tests/manager-report-approval.spec.ts tests/manager-email-reminders.spec.ts tests/supervisor-location-proposals.spec.ts tests/technician-location-proposal-form.spec.ts tests/technician-location-proposal-sync.spec.ts --workers=1 --reporter=line
  if ($LASTEXITCODE -ne 0) { throw 'Browser tests failed' }
} finally { Remove-Item -LiteralPath $configPath }
cd C:\PWA_OfflineRecordWebApp\apps\api
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed' }
$env:NODE_ENV='test'
$env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:cr11-disposable-test-only@127.0.0.1:55432/phase6_seed_integration'
$env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
docker run -d --rm --name cr11-wording-verify -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=cr11-disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable database failed to start' }
try {
  node --input-type=module -e "import pg from 'pg'; let ready=false; for(let attempt=0;attempt<30;attempt++){const client=new pg.Client({connectionString:process.env.DATABASE_URL}); client.on('error',()=>{}); try{await client.connect();await client.query('SELECT 1');ready=true;}catch{}finally{await client.end().catch(()=>{});}if(ready)break;await new Promise(r=>setTimeout(r,1000));}if(!ready)throw Error('Host TCP database readiness failed');"
  if ($LASTEXITCODE -ne 0) { throw 'Host TCP database unavailable' }
  foreach ($testFile in @('src/routes/managerTechnicians.integration.test.ts','src/routes/reportApprovals.integration.test.ts','src/reports/reportReview.test.ts','src/reports/template/renderReportHtml.test.ts')) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $testFile
    if ($LASTEXITCODE -ne 0) { throw "Failed: $testFile" }
  }
} finally { docker rm -f cr11-wording-verify }
cd C:\PWA_OfflineRecordWebApp
& 'C:\Program Files\Git\usr\bin\grep.exe' -rni supervisor apps/web/src apps/api/src docs/client
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
git status --short
```

## CR-11 files changed

| File | Reason |
|---|---|
| `apps/web/src/App.tsx` | Admin access and sign-in labels; internal experience selectors unchanged. |
| `apps/web/src/auth/LoginForm.tsx` | Admin presentation label and review heading selection. |
| `apps/web/src/manager/RoleSelection.tsx` | Admin card title; ProductRole and callback unchanged. |
| `apps/web/src/manager/roleAccess.ts` | Pure display adapter; existing role/route authority predicates unchanged. |
| `apps/web/src/corrections/AcceptedCorrectionsPanel.tsx` | Admin review notices and correction-author display role. |
| `apps/web/src/jobs/FinalReportPresentation.tsx` | Read-time Reviewed by Admin label. |
| `apps/web/src/jobs/TechnicianLocationProposal.tsx` | An Admin reviews it grammar. |
| `apps/web/src/jobs/SingleInstanceFormatAction.tsx` | Admin format-review notice. |
| `apps/web/src/manager/ManagerCorrectionEditor.tsx` | Admin review label and correction history role. |
| `apps/web/src/manager/ManagerEmailReminders.tsx` | Admin staff role label. |
| `apps/web/src/manager/ManagerFinalReportView.tsx` | Admin approval notice and decision/correction role labels. |
| `apps/web/src/manager/ManagerHome.tsx` | Admin workspace heading. |
| `apps/web/src/manager/ManagerLocationProposals.tsx` | Admin decision role label. |
| `apps/web/src/manager/ManagerOperations.tsx` | Admin workspace and review labels. |
| `apps/web/src/manager/ManagerReminderPlan.tsx` | Admin recipient legend and role label. |
| `apps/web/src/manager/ManagerTechnicians.tsx` | Admin add/role/badge/assignment/deactivation copy. |
| `apps/web/src/referenceData/referenceDataApi.ts` | Tell your Admin refusal notice; pre-existing changes preserved. |
| `apps/web/src/co2/Co2InspectionForm.tsx` | Admin format-review notice. |
| `apps/web/src/dryWetRiser/DryWetRiserInspectionForm.tsx` | Admin format-review notice. |
| `apps/web/src/fireAlarm/FireAlarmInspectionForm.tsx` | Admin format-review notice. |
| `apps/web/src/fm200/Fm200InspectionForm.tsx` | Admin format-review notice. |
| `apps/web/src/hoseReel/HoseReelInspectionForm.tsx` | Admin format-review notice. |
| `apps/web/src/hydrant/HydrantInspectionForm.tsx` | Admin format-review notice. |
| `apps/web/src/fireRatedRollerShutter/FireRatedRollerShutterInspectionForm.tsx` | Admin layout/format review notices; pre-existing changes preserved. |
| `apps/web/src/fireRatedRollerShutter/FireRatedRollerShutterSetupPrompt.tsx` | An Admin approves setup copy; pre-existing changes preserved. |
| `apps/api/src/routes/managerTechnicians.ts` | Four user-readable errors; codes/role validation unchanged. |
| `apps/api/src/routes/inspectionJobs.ts` | An Admin approves PDF refusal copy. |
| `apps/api/src/reports/template/renderReportHtml.ts` | Freshly rendered Reviewed by Admin label. |
| `apps/api/src/reports/reportReview.test.ts` | Expected report wording updated. |
| `apps/api/src/routes/managerTechnicians.integration.test.ts` | Exact message/code/status regressions for four errors; existing assertions retained. |
| `apps/api/src/routes/reportApprovals.integration.test.ts` | Full error plus updated message asserted; existing error assertion strengthened. |
| `apps/web/tests/accepted-corrections-panel.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/location-proposals-unreadable.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/supervisor-location-proposals.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/manager-corrections.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/manager-report-approval.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/manager-supervisor.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/manager-technicians.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/manager-email-reminders.spec.ts` | Expected labels/card locators updated; internal-role fixtures retained. |
| `apps/web/tests/locationProposalReviewShape.test.ts` | Test display descriptions updated; shape assertions unchanged. |
| `apps/web/tests/roleAccess.test.ts` | Both review-role labels covered; existing role/authority tests retained. |
| `docs/client/USER_GUIDE.md` | Admin wording and card references; permissions unchanged. |
| `docs/client/ADMIN_ACCOUNT_RECOVERY.md` | Admin wording and recovery distinction by existing sign-in card. |
| `docs/client/EVIDENCE_POLICY.md` | Admin wording; existing correction policy clarified by card. |
| `HANDOVER.md` | CR-11 checkpoint; preceding concurrent checkpoint retained. |
| `docs/testing/CR11_ADMIN_WORDING.md` | DoD, limitations, duplicate labels, stored-data classification and reproducible commands. |
| `docs/testing/CR11_SUPERVISOR_GREP.txt` | Exact final grep output. |
| `docs/testing/CR11_SUPERVISOR_AUDIT.md` | Every remaining hit classified. |
| `docs/testing/cr11-card-360.png` | Chromium screenshot of card wording at 360px. |
| `docs/testing/cr11-login-360.png` | Chromium screenshot of login wording at 360px. |
| `docs/testing/cr11-card-768.png` | Chromium screenshot of card wording at 768px. |
| `docs/testing/cr11-login-768.png` | Chromium screenshot of login wording at 768px. |
| `docs/testing/cr11-card-1280.png` | Chromium screenshot of card wording at 1280px. |
| `docs/testing/cr11-login-1280.png` | Chromium screenshot of login wording at 1280px. |

## Final working-tree status (includes unrelated owner work)

```text
 M HANDOVER.md
 M apps/api/src/attachments/attachmentStorage.ts
 M apps/api/src/reports/reportReview.test.ts
 M apps/api/src/reports/template/renderReportHtml.ts
 M apps/api/src/routes/inspectionJobs.ts
 M apps/api/src/routes/managerTechnicians.integration.test.ts
 M apps/api/src/routes/managerTechnicians.ts
 M apps/api/src/routes/reportApprovals.integration.test.ts
 M apps/web/package.json
 M apps/web/src/App.tsx
 M apps/web/src/auth/LoginForm.tsx
 M apps/web/src/co2/Co2InspectionForm.tsx
 M apps/web/src/corrections/AcceptedCorrectionsPanel.tsx
 M apps/web/src/dryWetRiser/DryWetRiserInspectionForm.tsx
 M apps/web/src/fireAlarm/FireAlarmInspectionForm.tsx
 M apps/web/src/fireRatedRollerShutter/FireRatedRollerShutterInspectionForm.tsx
 M apps/web/src/fireRatedRollerShutter/FireRatedRollerShutterSetupPrompt.tsx
 M apps/web/src/fm200/Fm200InspectionForm.tsx
 M apps/web/src/hoseReel/HoseReelInspectionForm.tsx
 M apps/web/src/hydrant/HydrantInspectionForm.tsx
 M apps/web/src/jobs/FinalReportPresentation.tsx
 M apps/web/src/jobs/NewServiceVisit.tsx
 M apps/web/src/jobs/SingleInstanceFormatAction.tsx
 M apps/web/src/jobs/TechnicianHome.tsx
 M apps/web/src/jobs/TechnicianLocationProposal.tsx
 M apps/web/src/layout/AppShell.tsx
 M apps/web/src/manager/ManagerCorrectionEditor.tsx
 M apps/web/src/manager/ManagerEmailReminders.tsx
 M apps/web/src/manager/ManagerFinalReportView.tsx
 M apps/web/src/manager/ManagerHome.tsx
 M apps/web/src/manager/ManagerLocationProposals.tsx
 M apps/web/src/manager/ManagerOperations.tsx
 M apps/web/src/manager/ManagerReminderPlan.tsx
 M apps/web/src/manager/ManagerTechnicians.tsx
 M apps/web/src/manager/RoleSelection.tsx
 M apps/web/src/manager/roleAccess.ts
 M apps/web/src/referenceData/referenceDataApi.ts
 M apps/web/src/styles/app.css
 M apps/web/tests/accepted-corrections-panel.spec.ts
 M apps/web/tests/final-ui-acceptance.test.tsx
 M apps/web/tests/job-completion-workflow.html
 M apps/web/tests/location-proposals-unreadable.spec.ts
 M apps/web/tests/locationProposalReviewShape.test.ts
 M apps/web/tests/manager-common-remarks-mobile.spec.ts
 M apps/web/tests/manager-corrections.spec.ts
 M apps/web/tests/manager-email-reminders.spec.ts
 M apps/web/tests/manager-report-approval.spec.ts
 M apps/web/tests/manager-supervisor.spec.ts
 M apps/web/tests/manager-technicians.spec.ts
 M apps/web/tests/roleAccess.test.ts
 M apps/web/tests/supervisor-location-proposals.spec.ts
 M apps/web/tests/technician-sidebar-navigation.spec.ts
 M docs/client/ADMIN_ACCOUNT_RECOVERY.md
 M docs/client/EVIDENCE_POLICY.md
 M docs/client/USER_GUIDE.md
 M docs/testing/PHONE_TESTING_STATUS.md
 M scripts/phone-testing/proxy.js
?? apps/api/src/attachments/attachmentStorageReconciliation.integration.test.ts
?? apps/web/tests/autosave-strip-idle.html
?? apps/web/tests/autosave-strip-idle.spec.ts
?? apps/web/tests/job-completion-workflow.spec.ts
?? apps/web/tests/new-service-visit-site-hint.html
?? apps/web/tests/new-service-visit-site-hint.spec.ts
?? apps/web/tests/queuedWriteRefusal.test.ts
?? apps/web/tests/roller-shutter-cosmetics.spec.ts
?? docs/client-format-request/CLIENT_CHANGE_REQUESTS_2026-10.md
?? docs/client-format-request/CLIENT_CHANGE_REQUEST_PROMPTS.md
?? docs/testing/ATTACHMENT_RECONCILIATION_TASK_BRIEF.md
?? docs/testing/CR05_REMAINING_INSPECTIONS.md
?? docs/testing/CR11_ADMIN_WORDING.md
?? docs/testing/CR11_SUPERVISOR_AUDIT.md
?? docs/testing/CR11_SUPERVISOR_GREP.txt
?? docs/testing/cr11-card-1280.png
?? docs/testing/cr11-card-360.png
?? docs/testing/cr11-card-768.png
?? docs/testing/cr11-login-1280.png
?? docs/testing/cr11-login-360.png
?? docs/testing/cr11-login-768.png
?? scripts/phone-testing/mode.txt
?? scripts/phone-testing/proxyHeaders.js
?? scripts/phone-testing/proxyHeaders.test.js
```
