# Prompt B — disposition, evidence policy and client guide

Date: 8 October 2026. Scope: the approved one-off rejection and client documentation. Stop before staging; no Git mutations performed. This is not production/release acceptance.

## Outcome and behavior changed

Only proposal `678f1e17-34b2-42f5-9674-2bd8d0392524` changed status, from Pending to Rejected, through the existing authenticated admin API. The immutable submission remains intact. Nothing was deleted. No validators, endpoints, schema, migrations, app UI, configuration or accepted inspections were changed by this task.

Admin `mobiletest` rejected it at `2026-10-08T14:18:59.327Z` (22:18:59 Malaysia). Decision ID: `b4dbed42-6e58-4869-8d7b-1e075a38d864`; request ID: `c8193b36-4aee-4935-a453-3e0b5db3a247`. An authoritative API reread confirmed the returned decision and unchanged payload. Read-only database inspection confirmed one rejected decision and its success audit.

The [complete saved output](LEGACY_PROPOSAL_REJECTION.json) includes both dry-run and apply, all printed BEFORE/AFTER objects, submission identities, status and decision details. No session credentials are included. Original full payload:

```json
{
  "zones": [{ "key": "54ad152f7e95", "sortOrder": 1, "displayName": "1" }],
  "locations": [{ "key": "3319d2416c98", "zoneId": "54ad152f7e95", "rowPreset": {}, "sortOrder": 1, "displayName": "1", "presetRowCount": 3 }]
}
```

The owner confirmed these generic names and three empty preset rows were demo debris and chose rejection rather than deletion. The customer database flag was not a demo flag; the owner's explicit confirmation supplied authorization. Neither active FM200 configuration revision 2 nor historical revision 1 contained these proposal locations.

## Diagnosis and API preflight

The legacy writer in commit `0024707` submitted a full `{zones, locations}` shape. Commit `058d2f9` replaced it with the patch model on 29 September. Current creation validates `body.patch`, whose `kind` must be `add-location` or `update-format`. No current source creation path for the old shape was found. The browser correctly refuses to render an actionable card for that old payload.

The existing decision route supports rejection without interpreting the proposal payload. Before applying, a focused test exercised the actual Express router with an isolated fake database: the legacy payload fails the current parser, yet admin rejection succeeds and preserves it. Rejection requires a note; an identical request replays once, and a later conflicting decision fails. No SQL UPDATE or API change was needed.

The one-off script defaults to dry-run and accepts only `--apply`. It locks the exact proposal, expected identity and entire reviewed payload, requires an authenticated admin, refuses nonpending state, rechecks immediately before writing, then validates both the response and authoritative reread. The same exported function was executed in the signed-in browser with same-origin authenticated requests; the cookie was neither read out nor printed. Both runs are saved in the JSON report.

## Browser verification and test-data cleanup

- Live Pending: “No pending location proposals.” The unreadable-row notice is gone from Pending. [Screenshot](legacy-proposal-pending.png).
- Live Rejected: the exact reference appears in the unreadable submission summary. Its payload remains unreadable, so the notice remains on **Rejected** by design. [Screenshot](legacy-proposal-rejected.png).
- Readable proposal behavior: browser tests create isolated intercepted API fixtures, exercise readable Pending approval beside an unreadable row, and show readable Rejected details beside this legacy rejected shape. All four browser tests passed. Test contexts dispose these fixtures; no extra runtime proposal was created or deleted.
- Limitation: readable proposal coexistence was verified in a real browser using isolated fixtures, not by creating another append-only proposal in the runtime database.

The existing unreadable-row notice code and tests were retained. The added test covers the rejected-list case without changing production UI.

## Files changed by this task

| File | Purpose |
|---|---|
| `scripts/reject-legacy-location-proposal.mjs` | Guarded dry-run/default and explicit apply script. |
| `scripts/reject-legacy-location-proposal.test.mjs` | Five focused script safety/confirmation tests. |
| `apps/api/src/routes/legacyLocationProposalRejection.test.ts` | Existing reject-route compatibility and replay preflight. |
| `apps/web/tests/location-proposals-unreadable.spec.ts` | Rejected unreadable/readable coexistence regression. |
| `docs/testing/LEGACY_PROPOSAL_REJECTION.json` | Complete printed payload/status audit for both runs. |
| `docs/testing/legacy-proposal-pending.png` | Live Pending verification. |
| `docs/testing/legacy-proposal-rejected.png` | Live Rejected verification. |
| `docs/client/EVIDENCE_POLICY.md` | Actual evidence requirements, states, retention and report authority. |
| `docs/client/USER_GUIDE.md` | Role-based guide, quick start, troubleshooting and IT appendix. |
| `docs/testing/PROMPT_B_REPORT.md` | This scoped report and limitations. |
| `HANDOVER.md` | Current outcome and links. |

Other concurrent working-tree changes, including web location forms, package scripts, extra browser tests and `docs/testing/FINAL_CHECK_EMAIL_AND_LOCATIONS.md`, belong to the other chat and were preserved. They are not attributed to this task.

## Gates and tests

| Check | Result / evidence |
|---|---|
| Script tests | PASS — 5 tests, no skips. |
| Existing rejection route test | PASS — 1 test using the real router with fake database fixtures. |
| Location proposal parser/browser suite | PASS — 8 parser tests and 4 browser tests, no skips. |
| Web typecheck | PASS — `npm run typecheck`. |
| API typecheck | PASS — `npm run typecheck`. |
| `git diff --check` | PASS; line-ending warnings are not whitespace errors. |
| Live owner-approved dry-run/apply | PASS — complete saved output and authoritative reread. |
| Live Pending/Rejected UI | PASS — saved screenshots. |
| Readable proposal coexistence | PASS with isolated browser fixtures; runtime lifecycle not tested. |
| Protected historical files: working tree | PASS — scoped `git status --short` is empty. |
| Historical byte equality against `e30c649` | FAIL — pre-existing committed V6 evidence change, described below. |
| Builds, full historical/release matrix, disposable PostgreSQL integration | NOT RUN — script/test/docs scope, no production application code change; AGENTS verification-level rules take precedence over the broader skill gate scaffold. |
| Physical phone, real offline/camera/force-close, HTTPS deployment and backup/restore drill | NOT RUN — separate acceptance checkpoint. |

The initial script test invocation failed because the new script module did not yet exist. That is scaffolding evidence, not a demonstrated regression in old application behavior. The existing API already supported rejection and therefore needed no failing application test followed by a route fix. The new rejected-list test adds coverage to existing behavior. Do not interpret these tests as proof of a new production-code fix.

Loopback tests initially encountered sandbox access restrictions; reruns with approved execution passed. No test SQL targeted runtime PostgreSQL. The API fixture is not a real PostgreSQL transaction/concurrency test. Runtime SQL inspection used read-only transactions only.

Reproduce focused checks from the project directory (these require the repository's installed dependencies and normal browser-test prerequisites; they do not start or seed PostgreSQL):

```powershell
cd C:\PWA_OfflineRecordWebApp
node --test scripts/reject-legacy-location-proposal.test.mjs
cd apps\api
node --import tsx --test src/routes/legacyLocationProposalRejection.test.ts
npm run typecheck
cd ..\web
npm run test:location-proposal-list
npm run typecheck
cd ..\..
git diff --check
```

Do not repeat `--apply`: the proposal is now rejected and the script will refuse it.

## Findings and documentation differences

P0 remaining: **0 identified within this task's scope**. P1 remaining: **0 identified within this task's scope**. These counts do not certify the entire app or resolve unrelated historical findings in HANDOVER.

P2 / next documentation-policy checkpoint:

1. The V7 evidence skill describes three states and Poor-only evidence. Current V7 uses **Good / Not Good / Complete Repair / N.A.**, with a separate remark and photo for both findings. The client policy documents actual behavior and explains older labels.
2. The brief requests admin-only accepted-record corrections; current API/UI allow **Admin and Supervisor** to append audited V7 corrections. No permission change was authorized or made. The owner must decide whether to adopt this policy or request a separate change.
3. Corrected values appear in the browser report, but corrected visits currently cannot download PDF. The guide states this limit; PDF correction support belongs to its existing follow-up checkpoint.
4. No password-reset UI/API flow was found. The guide directs users to an authorized recovery contact marked `[CONFIRM]`; it does not invent a reset button.
5. Older documentation can imply re-drafting the same rejected record permits photo replacement. Current submitted-photo protection requires a corrected copy. The older report-template README also retains an obsolete “no template today” analysis beneath newer notes.
6. The task skill's historical baseline gate fails: `fireAlarmV6Evidence.ts` already changed in committed `10f3bbb` (“Fix evidence staging retry returning IDEMPOTENCY_CONFLICT”), converting the returned uploader ID comparison to its PostgreSQL string representation. This task did not modify it. Other scoped historical files have no baseline difference, and all protected files have clean working-tree status. Baseline ownership/reconciliation is a separate checkpoint; historical byte equality is **not** claimed.

## Guide verification, limitations and confirmations

Built-in-browser admin screens inspected: Home/Menu, Technician List, Add Customer, Customer Configuration and FM200 locations, Service Catalog, Email reminders, Next Upcoming Service and service routine, Company Profile, Service Common Remarks, Current Services Done, Final Report, Operations and the accepted-record correction editor. Unsaved location/routine exploratory edits were discarded without submission. No account, customer, visit, email recipient, configuration, report approval or correction was created/changed during the guide walkthrough.

The owner supplied admin and technician sign-ins directly in the browser. Technician screens inspected: My Service Jobs, New Service Visit form, visit system lists and an accepted Smoke Ventilation inspection. Supervisor permissions were checked in source, not in a supervisor session. No new draft was started merely to inspect an editable form.

The guide marks source-only or unexercised actions `[CONFIRM]`: editable inspection/save/submit and camera/gallery, corrected copy, technician proposal submission, account/customer/configuration changes, visit creation/deletion/closing, report approval/correction/withdrawal, supervisor and technician completed-report menus, sender/recipient saves, logo/common-remark changes, monthly recurrence fields and native date save. Source labels were used where live actions were unavailable, including **Submit Inspection**.

Client setup confirmations: company HTTPS address, phone installation, Gmail sender and Google app-password menus, support/recovery contacts, letterhead details, installed paths, email encryption-key custody, backup schedule/storage/retention and Windows/Docker operation. Google setup is linked to official instructions. No Gmail credentials were entered or email sent. A sent reminder means Gmail accepted it, not that the recipient read it; failed mail is not automatically retried.

Evidence policy retention distinguishes unsent work (kept), eligible unused draft photos after a synced parent (24 hours), and uploaded local copies (30 days). These are cleanup eligibility rules, not unsent-work expiry. Accepted originals and old templates remain frozen; reports use server-accepted evidence.

## Readiness

Ready for owner review of the rejection audit and client documentation. **SAFE FOR DOCUMENTATION REVIEW: YES.** Marked client confirmations, policy decisions and the pre-existing historical baseline exception remain open for their respective checkpoints. **PRODUCTION RELEASE ACCEPTANCE: NOT CLAIMED.** No staging, commit or other Git mutation performed.
