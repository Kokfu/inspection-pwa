# Site proposal web retest — 2026-10-20

Source checkpoint: `29113fb`. Owner rebuilt API/proxy before this test.
Live URL: `https://localhost/`; verified app build `build-20261020T052523Z`.
The first browser view had an older cached build; Update now activated the rebuilt app.

## Owner objectives

| Objective | Result and evidence |
| --- | --- |
| Technician can propose a site while creating a visit | PASS live: two visits created with the confirmation “Site sent for approval. Your visit continues.” |
| Pending sites are excluded from the dropdown, including the submitter's own | PASS live: after the first proposal, only Retest Original Site was offered. Cross-technician exclusion and pending-site reuse also passed in the disposable integration tests. |
| Supervisor/admin can review, without editing the submitted site | PASS live: Supervisor1 rejected one request; mobiletest approved the other. Fresh detail showed the original names/addresses and reviewer identities. |
| Rejection requires a note and leaves the visit intact | PASS live: blank rejection was blocked; a valid note produced Server confirmed: Rejected. SV-20261020-118 retained its identity/site and remained In Progress; its inspection form opened and a local test draft saved. |
| Approval makes the site selectable | PASS live: fresh technician dropdown included Retest Approve Site and Retest Original Site, excluding Retest Reject Site. |
| Archive preserves visits and separates archived sites | PASS live: approved site moved to Archived sites; both visits remained in customer history with their original names. Rejected site was absent from both ordinary site lists. |
| Restore refuses an active name clash, then recovers | PASS live: creating a temporary active site with the archived site's name made Restore display “An active site already uses this display name.” Archiving that temporary conflict allowed the original approved site to be restored. |
| Offline input/local save remains available | PASS in the real rebuilt web app with CDP network emulation: Offline banner, editable inspection comment, Save Draft confirmation, and saved text visible after reload. Existing-site new-visit selection and Create remained enabled; Add new site was disabled with its connection explanation. Network emulation was restored online afterward. |
| Retry, double-submit, exact confirmation, malformed data, role and status boundaries | PASS automated browser/API regressions described below. Lost-response/concurrency faults were not injected into the live runtime. |
| Historical report names | Existing authority implementation and API regressions preserve site identity/names; live history also retained both names after archive. No new completed Final Report/PDF was generated in this run. |

## Verification executed

- Browser mocks: **90 passed, zero failures/skips**. Covers new-service-visit-add-site,
  new-service-visit-site-hint, supervisor-site-proposals, manager-site-archive-restore,
  and manager-supervisor. Includes responsive checks at 360, 768 and 1280 widths,
  exact-body/retry/double-click checks, malformed authority and delayed navigation.
- Cold disposable API runner `apps/api/src/routes/verifyManagerCustomerSites.ps1`:
  **48 unit + 22 integration = 70 passed, zero failures/skips**; API typecheck passed.
  Its disposable `s3a-site-verify` container was removed. The runtime database was
  not used for integration tests.
- Runtime services: rebuilt API/proxy running, PostgreSQL healthy. No Compose
  rebuild, restart, schema change or deployment configuration edit performed.
- `git diff --check`: passed. No application source changed during this retest.
- Physical phone: owner deferred it because another task was testing the phone.
  USB device discovery and existing forwarding setup occurred before that instruction;
  no phone app, network setting, login, data-entry or force-stop test was performed.

## Retained, clearly named test data

- Customer: Site Review Retest 2026-10-20 (`7869cb71-4537-4938-9a63-c25db70a6d13`).
- SV-20261020-117 (`f9292979-069d-40e6-9bd4-95f7e23667e6`): Retest Approve Site;
  proposal Approved; original proposed site restored and active.
- SV-20261020-118 (`f084238e-14c5-4c60-8734-e7b2036e73f2`): Retest Reject Site;
  proposal Rejected; visit retained. One local Portable Fire Extinguisher Draft
  contains the offline-retest comment; it was not submitted.
- Retest Original Site remains active. The temporary same-name conflict site remains
  archived. Nothing was permanently deleted, and existing customer records were not edited.
- Technician session already displayed Sync needs attention before test visits were
  created; its sign-out warning reported two existing submitted items needing attention.
  No manual sync or repair of those existing items was attempted.

## Evidence and limits

Ignored screenshots: `test-results/site-review-live-20261020/`:
`approved.png`, `rejected.png`, `archived-with-history.png`, `restore-name-conflict.png`,
`restored.png`, `active-only-dropdown.png`, `rejected-visit-preserved.png`,
`rejected-visit-editable.png`, `offline-reload-draft.png`, `offline-new-visit-controls.png`.

Some browser-control operations timed out after their action had reached the server.
Fresh tabs/server reads confirmed the actual decisions and archive state before
continuing; writes were not blindly repeated. No corresponding application-data
failure was established. The automation surface stall is a test-tool limitation.

No physical-phone, installed-PWA force-close/reopen, browser-process restart,
production-domain HTTPS, container-persistence, or live PDF-export acceptance is claimed.

P0/P1/P2 findings in the tested site-proposal scope: **0/0/0**.
**Web objectives met; physical-phone acceptance pending the owner's next checkpoint.**

## Reproduce automated checks

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\apps\api\src\routes\verifyManagerCustomerSites.ps1
if ($LASTEXITCODE -ne 0) { throw 'Site proposal API checks failed' }
cd C:\PWA_OfflineRecordWebApp\apps\web
npx playwright test tests/new-service-visit-add-site.spec.ts tests/supervisor-site-proposals.spec.ts tests/manager-site-archive-restore.spec.ts tests/new-service-visit-site-hint.spec.ts tests/manager-supervisor.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Site proposal browser checks failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
```
