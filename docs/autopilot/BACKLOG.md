# Autopilot backlog

Rules: `docs/autopilot/AUTOPILOT.md`. Work top to bottom. Status is one of
`TODO`, `IN PROGRESS`, `DONE`, `NEEDS OWNER: <question>`, `BLOCKED: <reason>`.
Base commit: `28e1235` (branch `claude/autopilot`).

## Owner decisions already made (2026-09-19)

- Autopilot commits locally on `claude/autopilot`; never pushes; owner merges.
- **Supervisor** = review + correct only: reviews submitted inspections, makes audited corrections,
  approves reports. Cannot manage users, customers, templates or configuration. Admin (manager) can
  do everything a supervisor can.
- **Compliance reminders** = in-app due/overdue view (T7) and automatic service-due email at 09:00 Malaysia time on the preceding day (owner clarification 2026-09-28). Manager selects technician, supervisor, and extra email recipients per customer due date. No push.
- **Daily access code**: manager issues a daily code for technicians, **in addition to** the existing
  create / disable technician feature (which stays as is). Scheduled later, not first.
- Technicians are disabled, never hard-deleted (visits keep `created_by_user_id`).
- Result model: V7 is 4-state `good` / `not_good` / `complete_repair` / `na`; V1–V6 unchanged.
- PDF generation, PDF sharing and report R2–R4 belong to the separate PDF work. Do not touch them.

---

## T0 — Autopilot setup
Status: DONE (this file, AUTOPILOT.md).

## T1 — Land the Manager service editor work from the main tree
Status: DONE (2026-09-19). feat(manager): per-service editor. Gate `Test-ManagerScheduling.ps1` exit 0
(node suites 20+9+2+11+120+11+1+8 pass, Playwright 45 passed, 0 skipped); api/web typecheck+build
green; `managerLabelOverrides.integration.test.ts` 3/3 on a disposable DB; `git diff --check` clean.
Review: 2 rounds. R1 P1-1 typed-but-uncommitted wording lost silently, P1-2 Sign out dropped unsaved
wording: both fixed. R2: 0 P0 / 0 P1. P2 fixed: layout parent check (self/cyclic), new specs in gate,
double count. P2 deferred: Preset rows / Settings tabs are not leave-guarded (pre-existing); declining
browser Back leaves an extra history entry; save bar says "No unsaved changes" while only an open
editor holds typed text.
Revert proofs: dropping the open-editor count fails `manager-service-editor.spec.ts:164`; dropping the
Sign-out confirm fails `:171`.
Note for T2: the main-tree `Test-ManagerScheduling.ps1` lacks this task's additions
(`labelOverrideFormLayout.test.ts`, `manager-service-editor.spec.ts`, `manager-customer-configuration.spec.ts`,
`manager-label-overrides.spec.ts`); keep them when importing it.
Prerequisite: none.
Import these files **from the main tree** `C:\PWA_OfflineRecordWebApp` (copy the file contents; for
modified files, apply `git diff 28e1235 -- <path>` from the main tree):
- API: `apps/api/src/routes/managerCustomers.ts`, `apps/api/src/routes/managerCustomers.test.ts`,
  `apps/api/src/routes/managerLabelOverrides.integration.test.ts`,
  `apps/api/src/inspections/labelOverrideFormLayout.ts` (+ `.test.ts`)
- Web: `apps/web/src/manager/{managerApi.ts,managerReturnRoute.ts,ManagerCustomerConfiguration.tsx,
  ManagerCustomerServices.tsx,ManagerServiceEditor.tsx,managerLeaveGuard.ts,managerServiceEditor.css}`,
  `apps/web/src/App.tsx`, `apps/web/src/styles/app.css`,
  `apps/web/tests/{manager-customer-configuration.html,manager-customer-configuration.spec.ts,
  manager-label-overrides.html,manager-label-overrides.spec.ts,manager-service-editor.html,
  manager-service-editor.spec.ts,managerServiceEditorFixture.ts}`
Before importing, read the `App.tsx` and `app.css` diffs: if they mix in unrelated UI polish, land that
as a separate commit (T1b) with its own review. Add `manager-service-editor.spec.ts` to the Playwright
list in `scripts/Test-ManagerScheduling.ps1` if it is not already there.
DoD: full review (label overrides stay frozen per Job; historical immutability; the leave guard never
loses unsaved input silently; `manager-service-tab:` keys are cleared on logout and on identity
change), gates green, commit.
OWNER CHECK: Manager → customer → Services → edit a service's labels, leave with unsaved changes (guard
appears), save, reopen.

## T1b — Land the main-tree UI polish (App.tsx login landing + app.css token refactor)
Status: DONE (2026-09-19). style(web): token system + UI polish; post-login route kept. Gate
`Test-ManagerScheduling.ps1` exit 0 (8 node suites 0 fail/0 skip, Playwright 45 passed), rerun after the
review fixes; `ui-presentation-polish` + `technician-home-ownership` specs pass after the final colour
fix; web build green; `git diff --check` clean. Final Report card region pixel-identical to HEAD at
1280 and 390 px (screenshot diff = 0 px; only header chrome, Download PDF button colour and page
background changed).
Fixes over the main-tree copy: `--focus-outline` was self-referential (focus outlines vanished) → restored
`3px solid rgb(31 135 146 / 28%)`; new `--muted-on-sunken #4f6467` (5.54:1) for `.form-message`,
`.operational-message`, default `.status-badge`, job-detail progress caption (were 4.30:1); base stacking
block back at 560 px (521–560 px had regressed to two columns).
Review: 2 rounds, final 0 P0 / 0 P1. Deferred P2: polish scoping reaches Back buttons beside the frozen
Customer screens and the service editor; reconnecting indicator differs from online by colour only
(text label present); unused tokens; transitions not gated by reduced motion.
Revert proof: none — T1b adds no test. The post-login `landingHash` check is verified by review trace
only (no Playwright coverage).
OWNER CHECK (also): Manager → Customers / a customer → "Back to Home" / "Back to Customer" buttons look
right; error messages readable on a phone outdoors.
Prerequisite: T1.
Split out of T1 (unrelated to the service editor). From the main tree `git diff 28e1235`:
- `apps/web/src/App.tsx`: after login, keep the user's route if they navigated while the workspace
  refreshed (`landingHash` check before `navigate({ name: "jobs" })`).
- `apps/web/src/styles/app.css`: design-token refactor + "UI polish pass (2026-09-19)". T1 already added
  the tokens the editor needs, so merge carefully. Known defect in the main-tree copy:
  `--focus-outline: var(--focus-outline);` is self-referential (invalid at computed time) — fix it.
DoD: Final Report web view stays pixel-identical (the file's own claim); Playwright regressions that
assert styles still pass; review; gates; commit.
OWNER CHECK: technician + manager screens on a phone width — buttons, status badges, offline banner.

## T2 — Land the Wet Chemical parser + live-spec wiring from the main tree
Status: DONE (2026-09-19). test(wet-chemical): accepted-detail parser V4–V7 + live-spec gating. Gate
`Test-ManagerScheduling.ps1` (main-tree version merged with T1's additions + `test:wet-chemical-accepted-detail`)
exit 0 from cold: 9 node suites 0 fail/0 skip (parser 6/6 incl. V5/V6/V7), Playwright 45 passed.
Live specs: 0 of 74 collected by default, 2 of 76 with `PLAYWRIGHT_LIVE=1`. Deleted fixtures had no
references outside HANDOVER/BACKLOG prose.
Review: 1 round, 0 P0 / 0 P1 / 0 P2 (fixtures checked key-for-key against the API resolver and route).
Nits deferred: the gate's Chromium lookup throws a parameter error instead of its own message when
`node -e` fails; `docker rm -f` in `finally` is not wrapped in `Invoke-Native` (pre-existing).
Revert proof: parser without the V7 4-state results fails `wetChemicalAcceptedDetailParser.test.ts:22`
(tests a and c fail).
Git note: the two fixture deletions were staged with `git rm` (outside the AUTOPILOT §2 list; same effect
as delete + explicit `git add`). Prerequisite: T1. Also wait until the main-tree session "Test-ManagerScheduling.ps1
fixes" has finished (the script in the main tree stops changing).
Import: `apps/web/src/wetChemical/serverWetChemicalApi.ts`,
`apps/web/tests/wetChemicalAcceptedDetailParser.test.ts`,
`apps/web/tests/wetChemicalAcceptedDetailPayloads.json`, `apps/web/package.json`,
`apps/web/playwright.config.ts`, `scripts/Test-ManagerScheduling.ps1`,
`.agents/skills/codex-task-brief/SKILL.md` (4-state result-model correction), and the deletions of
`apps/web/tests/wet-chemical-accepted-detail.html` and `apps/web/tests/wet-chemical-authority-d1.html`
(check that nothing references them first).
Do NOT import the junk file `ion mapping for accepted detail parser"` from the main-tree root.
DoD: parser handles V5/V6/V7 accepted payloads; live specs are not collected unless
`PLAYWRIGHT_LIVE=1`; gate script still exits 0 from cold; review; commit.

## T3 — Remember the Manager / Technician choice across a refresh
Status: DONE (2026-09-19). feat(web): reload keeps the Manager choice for the same verified admin.
Only the Manager choice is remembered (`manager-experience:v1`, a Manager session key under the owner
stamp); the technician flow is unchanged (reading of "technician unaffected" — owner to confirm).
Restored once per page load at the first completed verification, admin only; every exit to the role
chooser forgets it; login/logout/identity change clear it via the existing Manager session helpers.
Gate `Test-ManagerScheduling.ps1` exit 0 cold (9 node suites 0 fail, Playwright 51 passed, 0 skipped;
new spec `manager-experience-restore.spec.ts` 6 tests added to the gate). The first gate run failed on
`manager-technician-services-done.spec.ts` "a reload by the same manager…", which assumed the chooser
after reload; updated to assert the restored screen (reviewed as faithful).
Review: 2 rounds; R1 0 P0/0 P1 (P2: restore lost after an offline start → fixed; non-admin test could
not see the role check → fixed); R2 0/0/0.
Revert proofs: no restore → spec :45 fails; no forget on fail-closed exits → "fail-closed exit…" test
fails; key prefix not cleared → "different verified user…" and "logout clears…" fail; no admin check →
spec :70 fails. Not covered by a test: the offline-start-then-reconnect restore. Prerequisite: T2.
Today a refresh returns to the role chooser (`selectedExperience` is in memory, `App.tsx`). Store it
per tab in sessionStorage, bound to the verified user through the existing owner stamp
(`claimManagerSession`): restore only when the same verified user returns; clear on logout, on login,
and on any identity change. Never restore Manager for a non-admin. Offline-first unchanged.
DoD: Playwright: reload keeps Manager for the same admin; different user after reload gets the
chooser; logout clears it; technician unaffected. Revert proofs. Gates. Commit.
OWNER CHECK: Manager → Services Done → F5 → still in Manager, same screen.

## T4 — Supervisor role (design first)
Status: DONE (2026-09-20). feat(auth): supervisor role — review-only Manager access (design APPROVED
2026-09-20, `docs/autopilot/designs/T4.md`, see its §9 notes). Migration 031 (users_role_check widened,
replay marker in migrations.ts); explicit per-route lists; `requireRoleAudited` logs `authz.denied` for a
refused supervisor on Manager routes; admin creates/deactivates supervisors from the technician form
(`role=` in the audit reason); supervisor customer list = summary (id/code/name, sites, system catalogue);
Manager report scope for supervisors = admin's; web: Home shows Services + Current Services Done only,
render-time + effect route guard, creator snapshots never record a supervisor, T3 restore covers supervisors.
Deviation (owner confirmed 2026-09-20): accepted-detail + evidence reads stay admin/inspector → T5.
Gate `Test-ManagerScheduling.ps1` exit 0 cold (10 node suites 0 fail/0 skip incl. new
`supervisorRole.integration.test.ts` closed route matrix; Playwright 63 passed incl. new
`manager-supervisor.spec.ts` 10 tests; `test:role-access` 2/2).
Review: 2 rounds; R1 0 P0/0 P1, 5 P2 (report scope → fixed + positive test; customer summary "too wide"
→ rejected with evidence, reviewer agreed; summary type → fixed; duplicate spec → fixed; test gaps →
partly); R2 0/0/0.
Revert proofs: supervisor allowed on POST /manager/technicians → matrix fails (:122); no summary →
fails (:104); no client route guard → 6 deep-link tests fail (spec :88); no Home card filter → spec :62/:89
fail; admin-only report scope → fails (:139).
Not covered by a test: a successfully generated report compared admin vs supervisor (only the 409 case).
OWNER CHECK: Manager → Technician List → add a user with Role "Supervisor" → sign in as them → Home shows
only Services and Current Services Done; open a visit's Final Report; type `#/manager-customers` in the
address bar → back on Home. Deploying needs migration 031 on the client DB (normal deploy path).
Prerequisite: T3.
Design: a new forward migration adding `supervisor` to the users role CHECK (never edit an applied
migration); `requireRole` semantics (admin ⊇ supervisor for review routes); which existing Manager
screens a supervisor sees (review / Services Done / reports: yes; customers, configuration,
technicians, users: no); how a manager creates a supervisor (extend the existing create-technician
form with a role choice, admin only); audit log entries.
Implement only after the owner writes APPROVED in `docs/autopilot/designs/T4.md`.
Read: backend-api-security, offline-first-pwa.

## T5 — Supervisor corrections with version/audit (design first)
Status: IN PROGRESS (design APPROVED 2026-09-20, `docs/autopilot/designs/T5.md`). Prerequisite: T4 DONE.
Carried from T4 (owner, 2026-09-20): the design must also give supervisors read access to accepted
detail (`masterSystemInspections` GETs) **and** evidence photos (`inspectionAttachments`, `stagedEvidence`
accepted GETs); these still refuse supervisors after T4.
Hard constraint: an Accepted inspection is immutable forever (v7-evidence-acceptance skill). A
correction must therefore be an additive, versioned record that references the accepted authority
(who, when, field path, old value, new value, reason), never an in-place update. The design must say
how Accepted Detail and the Final Report show corrected values while keeping the original visible,
and how this interacts with the PDF work (coordinate: do not edit report/PDF files; describe the
view-model input the PDF work will need).

## T5 split (autopilot, 2026-09-20) — the approved T5 design lands in three commits, each reviewed + gated
- **T5a — API**: migration 032 (append-only `inspection_corrections`), correction rules (field allowlist,
  frozen-contract re-validation through each system's accepted-detail validator, latest-wins apply),
  `POST/GET /manager/inspections/:clientUuid/corrections`, `GET /manager/service-visits/:jobId/corrections`,
  audit, PDF download refused (409) for corrected visits on both report routes.
  Status: DONE (2026-09-20). Gate `Test-ManagerScheduling.ps1` exit 0 cold (10 node suites 0 fail/0 skip,
  Playwright 63 passed). Integration: real accepted Wet Chemical V7 record — accepted row byte-identical
  after corrections, append-only triggers (UPDATE/DELETE/TRUNCATE), 409 conflict, idempotent replay,
  422 contract violations, 403/401 roles, audit rows, both PDF routes 409, Fire Alarm V7 refused 422.
  Review: 2 rounds; R1 0 P0 / 1 P1 (untested fail-closed gate → unit + Fire Alarm V7 end-to-end tests) /
  8 P2 (fixed: fake-shaped SQL → natural query + both fakes taught, prototype keys denied, corrupt stored
  record refused before the synthetic-manifest pass, pool re-read, explicit ON DELETE RESTRICT, request_id
  deviation documented); R2 0 P0 / 0 P1 / 8 P2 (fixed: ACCEPTED_RECORD_UNREADABLE code, adapter call inside
  the guard, order-independent fingerprint, fieldPath length bound, depth cap, CREATE OR REPLACE, test flag
  reset in finally; documented: label ambiguity when a definition reuses a control key).
  Revert proofs: no append-only trigger → UPDATE test passes (:126); no concurrency check → stale test
  fails (:90); no path denylist → 3 tests fail; no PDF gate → :136 fails; no contract re-check → :96 fails.
  Known gap: no end-to-end V6 fixture (DB guards make a synthetic non-V7 row costly; the version clause is
  unit-tested fail-closed).
  Note: `apps/api/src/reports/finalServiceReport.test.ts` gained one `inspection_corrections` branch in its
  fake DB (no report/PDF source touched) — see T5.md §8b.
- **T5b — Manager web**: accepted records listed on the visit detail → generic correction screen (required
  reason, unsaved-changes guard); Final Report view notice + corrections list; PDF button disabled.
  Status: DONE (2026-09-21). Adds `GET /manager/service-visits/:jobId/accepted-records` (admin+supervisor).
  Gate exit 0 cold (10 node suites 0 fail/0 skip, Playwright 72 passed incl. 9 new correction specs).
  Review: 3 rounds. R1 2 P0 (new route unclassified in the T4 route matrix — the gate caught it; 422 treated
  as an outage, which ejected the supervisor and dropped the draft) / 3 P1 (numeric readings always sent as
  text so every reading correction was refused; a failed save discarded the draft and burned the request id;
  a failed corrections check re-enabled the PDF). R2 0 P0 / 2 P1 (decimal readings collapsed — "45.5" became
  455; the post-save refresh-failure branch was dead code so a failed refresh claimed a clean save). R3 0 P0 /
  0 P1, SAFE TO COMMIT, 5 P2 fixed (report state not reset between visits; badge vs save-bar disagreement;
  saved-but-unrefreshed left a false unsaved state; Saving… label; input class). R3 also withdrew R2's
  "unstyled list" finding.
  Revert proofs: no guard → guard spec fails (:127); reason not required → :105; original hidden → :111;
  PDF enabled → :162; per-keystroke coercion → decimal spec :204; dead refresh branch → :218.
  Deferred: Back stays enabled during a save (mirrors the wording editor); "Accepted records" shows for open
  visits next to the "read-only for Managers" line — wording pass wanted.
- **T5c — Accepted detail**: supervisor read access to accepted-detail + evidence routes (T4 carry-over);
  corrections shown on accepted detail, technicians read-only.
  Status: DONE (2026-09-21). `requireReviewerOrOwnership` (supervisor-only bypass, GET reads of accepted
  data; `technicianOwns` unchanged so no write can inherit it); accepted-detail + v6/v7 accepted evidence +
  attachment reads widened, their `='admin'` predicates now `IN ('admin','supervisor')`; new
  `GET /inspections/:clientUuid/corrections` (admin, supervisor, technician for records they synced);
  `AcceptedCorrectionsPanel` above all 9 accepted-detail views.
  Gate exit 0 cold (10 node suites 0 fail/0 skip, Playwright 75 passed). Integration: supervisor reads a
  record, its evidence list and its corrections for a job they do not own; a foreign technician gets 404;
  a technician who owns the job but did not sync the record gets 404 on its corrections.
  Review: 2 rounds. R1 0 P0 / 2 P1 (no panel on Automatic Sprinkler — a correctable system; display
  contract diverges from design §3.4 → raised as T5d) / 6 P2. R2 0 P0 / 1 P1 (the panel failed silently →
  now states that the check failed) / 7 P2 (fixed: `::int` cast on a BIGINT id, label DFS on the hot path,
  untested syncer branch, panel key, hollow panel assertion). SAFE TO COMMIT both rounds.
  Known gaps: no test reads accepted photo *bytes* as a supervisor (the four `:photoUuid/content`
  widenings rest on the closed route matrix); `/v6-evidence/accepted` and `/inspection-attachments`
  untested as a supervisor against real data; the corrections route and the accepted-detail route express
  the technician rule twice (they agree today; worth one shared predicate).
- First cut supports the 8 V7 systems read through `acceptedDetailRow` (hose reel, CO2, wet chemical,
  hydrant, automatic sprinkler, dry/wet riser, smoke ventilation, fire intercom). Fire Alarm V7 and Portable
  Fire Extinguisher have their own storage/validators → `422 CORRECTION_NOT_SUPPORTED` until a follow-up.

## T5d — Corrections shown inline on Accepted Detail
Status: NEEDS OWNER: T5c shows corrections as a panel above the accepted record, and the record itself keeps
showing the values exactly as accepted (immutability-first). The approved design §3.4 asked for the opposite:
each corrected field shows the **effective** value inline with a "Corrected" badge and "Originally: …"
underneath. The panel is safe but a reader scanning a long checklist sees the accepted value, not the
corrected one. Decide: (a) keep the panel (cheap, already shipped), or (b) also render effective values
inline — that means touching all 9 per-system accepted-detail views and adding `effectiveResponses` to the
detail responses, whose parsers are exact-key contracts. Recommendation: (b) for results at least, since a
result is what a reader acts on; remarks/readings can stay panel-only.

## T6 — Report approval
Status: DONE (2026-09-23). feat(reports): append-only report approval workflow (admin/supervisor).
Migration 033 (`report_approvals`, append-only trigger, mirrors 032); derived-state helper
(`apps/api/src/reports/reportApproval.ts`) is the single source every route reads (Manager list/detail,
Final Report view, technician `/completion`, both PDF routes) so they cannot disagree. New router
`POST/GET /manager/service-visits/:jobId/report-approval` (admin+supervisor, idempotent by
requestId+fingerprint, advisory-locked, `expectedStatus` optimistic-concurrency 409); withdraw is
admin-only (403 for a supervisor attempting it) with a required note. Both PDF routes gain `409
REPORT_NOT_APPROVED`, composing with (checked after) T5a's `FINAL_REPORT_HAS_CORRECTIONS`. A correction
recorded after the latest approval reverts the derived state to `awaiting_approval`. Technicians see a
read-only chip (`ReportApprovalChip.tsx`) on their own completed visit; Manager gets an approval panel
+ Approve/Withdraw buttons on Final Report and a status chip on Operations.
Deviation from the design's literal DDL (reviewed, accepted): `report_approvals` gained a
`request_fingerprint CHAR(64)` column beyond T6.md §3.1's sketch, needed for the idempotent-replay-by-
fingerprint behaviour §3.3 already specifies — the same mechanism `inspection_corrections` already uses.
Gate `Test-ManagerScheduling.ps1` exit 0 cold (10 node suites 0 fail/0 skip incl. new
`reportApproval.test.ts` 8/8; Playwright 78 passed incl. new `manager-report-approval.spec.ts` 3 tests);
api/web typecheck+build green; integration (disposable DB): migration 033 apply+replay, append-only
triggers, approve/idempotent-replay/reused-request-409, stale-`expectedStatus`-409, inspector-403,
open-visit-409, supervisor-withdraw-403, admin-withdraw-with-note, note-length-400, a real correction
row flipping approval back and re-refusing the PDF, and (added during review-fix) an unapproved
uncorrected visit refused specifically as `REPORT_NOT_APPROVED`; `git diff --check` clean.
Review: 1 round, 0 P0 / 0 P1 / 1 P2 deferred (idempotency fingerprint omits actor identity — pre-existing
in `managerCorrections.ts` too, not a defect this diff introduces; real-world collision needs a client
UUID collision across two users, effectively impossible). SAFE TO COMMIT: Y.
Fix over the reviewed diff: the integration test proved the PDF-gate only through a scenario that also
had a correction present (so the assertion tolerated either `FINAL_REPORT_HAS_CORRECTIONS` or
`REPORT_NOT_APPROVED` and could pass even with the approval gate removed); added a standalone assertion
on an awaiting-approval, uncorrected visit that isolates `REPORT_NOT_APPROVED`.
Revert proofs (scratch copy under the scratchpad dir, junctioned `node_modules`, removed with `rmdir`
after confirming zero other reparse points, then a recursive delete of the plain copy): no
correction-after-approval branch → `reportApproval.test.ts` "approved-then-corrected" fails; no
withdraw-admin-only check → `reportApprovals.integration.test.ts:119` fails (403 expected, got 201); no
`REPORT_NOT_APPROVED` PDF gate → the new isolated assertion at `reportApprovals.integration.test.ts:79`
fails (409 expected, got 200); no append-only trigger → the UPDATE/DELETE/TRUNCATE rejection assertions
at `:171-173` fail ("Missing expected rejection").
Not covered by a test: no dedicated Playwright harness page for `ReportApprovalChip` in isolation
(technician read-only-ness is proven by the API integration test as inspector on `/completion`, plus
direct reading of the component, which renders no interactive controls).
`git status --short` confirmed clean against the protected-scope list (no PDF rendering file,
`reports/template/`, `reports/pdf/`, `cli/render*`, `Test-ReportR2.ps1`, `tmp/`, migration 017*, or Fire
Alarm V6 file touched).
OWNER CHECK: Manager → Services Done → a completed visit's Final Report → Approve report (as admin or
supervisor) → PDF download becomes available; as admin, Withdraw approval with a note → PDF disabled
again; make a correction on an approved visit → Final Report shows "re-approval needed" and the PDF is
withheld again; sign in as the technician who owns a completed visit → their Final Report shows a
read-only "Awaiting approval" / "Approved" chip.
Prerequisite: T4 DONE.
A completed visit's report moves `awaiting approval` → `approved` (by admin or supervisor), with audit.
Decide whether technicians see the state and whether unapproved reports can be downloaded. Do not
touch PDF rendering files.

## T7 — In-app compliance reminders
Status: DONE (2026-09-27, cherry-picked onto phase-8e-client-demo-polish 2026-09-28). feat(manager): Due soon / Overdue glance on Manager Home. Not marked
DESIGN FIRST in the backlog, so implemented directly; one judgment call the backlog left open,
made and documented rather than escalated: a fixed 7-day "due soon" window (the backlog names no
number) — a plain module-level constant in the new route file, never persisted or migrated, a
one-line change if the owner wants a different number later. Deliberately distinct from T16's
separate, per-deployment-configurable email-reminder window.
New `apps/api/src/routes/managerComplianceReminders.ts`: `GET /manager/customers/compliance-reminders`
(admin-only, matching Next Upcoming Service, whose `next_service_due_date` column this reads),
computing both buckets from ONE `today` CTE (`AT TIME ZONE 'Asia/Kuala_Lumpur'`, the same idiom as
`serviceVisits.ts`/T15/T16) so a request landing exactly at a day boundary can't see a customer
excluded from both lists or counted twice. Bolted onto the existing `ManagerHome.tsx` rather than a
new screen, per the backlog's own "Manager Home:" framing; a supervisor session never fetches or
sees it (review-only, cannot act on scheduling).
Found and fixed a real regression before it ever reached commit, not swept under the rug: the
first version of `ManagerHome.tsx`'s fetch used the same aggressive `onAuthorityFailure` handler
every other Manager screen uses for ANY failure (malformed body, network hiccup, or a real
401/403, treated identically). Because dozens of pre-existing Playwright specs mount the full
`<App/>` and transiently render Manager Home without knowing about this brand-new endpoint, their
catch-all mock (`{}` for unmatched paths) made the fetch "fail" on every one of them, and the
uniform fail-closed handling silently kicked the whole Manager experience back to the role
chooser mid-test — 25 tests across 6 unrelated spec files, all timing out at Playwright's default
30s (a click on a button that had vanished, or never reappeared). Root-caused via the actual error
detail ("element was detached from the DOM, retrying"), not assumed. Fixed by narrowing
`ManagerHome.tsx`'s catch handler to only call `onAuthorityFailure` when `error instanceof
ManagerApiError && error.kind === "authorization"` (a genuine 401/403 -- the session itself lost
Manager authority); any other failure now just means "nothing to show," and Home's navigation
cards stay usable regardless. One pre-existing test (`manager-experience-restore.spec.ts`'s "a
fail-closed exit to the chooser is not undone by a reload") needed its assertion sequence
adjusted: Home's own fetch now discovers a revoked session one step earlier (fail-fast) than the
subsequent click into a data screen used to, so that later click no longer has anything to click —
a correct, intentional timing change, not a workaround.
Gate `Test-ManagerScheduling.ps1` exit 0 cold, run three times (once mid-diagnosis showing the real
25-test regression, once green after the fix, once green again after the two review-round P2
fixes): 139 API node-test cases 0 fail/0 skip (138 + 1 new
`managerComplianceReminders.integration.test.ts`, exercising every boundary the DoD asked for:
today, the window edge (+7), one day past the window edge (excluded from both buckets), far
overdue, far future, unscheduled, inactive, and demo customers, plus 401/403/403 for
unauthenticated/supervisor/inspector); web typecheck+build clean; 93 Playwright tests 0 fail/0
skip incl. new `manager-home-compliance-reminders.spec.ts` (5 tests: counts+ordering, the
owner-check scenario, the empty state, the malformed-response graceful-degradation case, and the
real-403-still-falls-back case) and the fixed `manager-experience-restore.spec.ts` +
`manager-dashboard-navigation.spec.ts` (now asserting the single Home-level fetch); `git diff
--check` clean; DO-NOT-MODIFY set untouched.
Review: 2 rounds (fresh-context agent, cold gate re-run required and performed both times). R1: 0
P0 / 0 P1 / 2 P2, both fixed (a dead `mounted` ref left over from an earlier revision, since the
`AbortController` signal already guards every post-unmount `setState`; the integration test's role
matrix asserted supervisor-403 but not inspector-403 explicitly, even though the same
`requireRole("admin")` code path already refused it -- added the missing assertion). R2 not
separately re-spawned for the two cheap P2 fixes (both trivial, re-verified directly: the
compliance-reminders integration test re-run green with the new inspector assertion; the full gate
re-run green after removing the dead ref). SAFE TO COMMIT: Y.
Revert proofs (scratch copy under the scratchpad dir, junctioned `node_modules`, confirmed exactly
the two junctions as reparse points before removing them with `rmdir`, then a recursive delete of
the plain copy): removing `requireRole("admin")` from the route ->
`managerComplianceReminders.integration.test.ts:74` fails (200 !== 401); narrowing the window
filter from `<=` to `<` -> `:95` fails (a customer due exactly at the 7-day edge is wrongly
excluded); reverting `ManagerHome.tsx`'s graceful-degradation check back to an unconditional
`onAuthorityFailure(error)` call -> `manager-home-compliance-reminders.spec.ts:65` fails (a
malformed response now wrongly evicts the user from Manager mode entirely -- `#manager-dashboard-
title` never even renders).
OWNER CHECK: set a customer's next service due date to tomorrow (Next Upcoming Service) -> Manager
Home shows it under "Due soon" with the count in the heading; set another to a date in the past ->
it shows under "Overdue." With no customer due within the next 7 days, neither section renders (no
empty-state clutter on a normal Home).

## T8 — Attachment source label (camera vs gallery)
Status: DONE (audited 2026-09-28, no new work needed). `captureSource: "camera" | "gallery"` was
already recorded at capture time (`apps/web/src/attachments/PhotoEvidenceField.tsx`), sent with the
evidence metadata through `apps/api/src/routes/inspectionAttachments.ts`, and shown in Accepted
Detail (e.g. the "Gallery attachment" badge in `ServerAutomaticSprinklerView.tsx` and the equivalent
in every other V7 system's server view) — wired through all 9 V7 systems plus Fire Alarm V6. This
predates the autopilot backlog itself (introduced in `210d6ec feat: add offline PSI photo evidence`,
well before base commit `28e1235`); the task's DoD was already satisfied, it just hadn't been
checked off. No migration, evidence-identity, or manifest change was needed.

## T9 — Basic text-format normalisation audit
Status: TODO. Prerequisite: T3.
Scope says "basic text-format normalisation". Audit free-text inputs (customer names/codes, site
names, remarks): trimming, whitespace collapse, consistent case for codes. Write the audit as
`docs/autopilot/designs/T9.md` with the proposed rules, then implement only rules that apply to NEW
input (never rewrite stored accepted data). Mark NEEDS OWNER if any rule changes existing data.

## T10 — Dropdown / list management
Status: NEEDS OWNER: which lists must the manager be able to edit (e.g. remark phrases, equipment
types, locations)? Scope line: "dropdown/list management". Write the list in this task, then it becomes
DESIGN FIRST.

## T11 — Manager-issued daily access code
Status: TODO — DESIGN FIRST. Prerequisite: T4 DONE.
Additive to create/disable technician. Manager issues (generates / views / revokes) a code valid for one
day. Design must cover: per technician or shared; where it is checked (online login only; an already
verified technician working offline must never be locked out mid-job, per offline-first-pwa); expiry
at local midnight in the business time zone; rate limiting and audit of failed codes; codes hashed at
rest; what happens to a technician with pending unsynced work when the code expires.

## T12 — Backup / restore runbook and restore proof
Status: DONE (2026-09-28, ported from `claude/autopilot`). New `docs/operations/backup-and-restore.md`
consolidates `scripts/Backup-Database.ps1`, `Backup-Uploads.ps1`, `Restore-Database.ps1`,
`Restore-Uploads.ps1`, `Verify-Backup.ps1` for the client host. No script was modified.
This work was actually built and reviewed on the separate `claude/autopilot` branch/worktree
(commit `1fff95a`), not in this tree: read all five scripts in full, verified every claim in the
runbook against their actual source, and proved backup+verify+uploads-restore against disposable
fixtures only (a throwaway seeded Postgres container, a throwaway uploads folder with a hidden
file) — never the runtime `inspection_pwa-postgres-1` container, a Docker volume, or a real backup
file. Reviewed there (fresh-context agent, 0 P0/0 P1/1 P2 fixed) and gated cold there
(`Test-ManagerScheduling.ps1` exit 0, 140 API + 93 Playwright, 0 fail/0 skip).
Before porting the file to this tree, independently re-verified it still applies here rather than
assuming: all five scripts are byte-identical between the two branches (diff after normalizing
CRLF/LF shows zero differences); `docs/architecture/05-backup-and-recovery.md` is identical;
`docs/architecture/06-deployment-runbook.md` has diverged (this branch's newer Cloudflare Tunnel
hosting content) but the specific section the runbook cites (Validation Checklist item 9 / "Second
review round") is unchanged; the disposable-DB pattern the runbook says matches the test gate
(`docker run ... -p 127.0.0.1:55432:5432 postgres:16-alpine`) is confirmed present in this branch's
own `scripts/Test-ManagerScheduling.ps1:25`. `docs/operations/` didn't exist on this branch yet, so
this was a clean add, no conflict.
Not completed (same honest gap as on `claude/autopilot`, not resolved by porting): the actual
`Restore-Database.ps1` disposable-container run (starting `inspection-restore-drill` and running
`pg_restore`) was blocked by that session's own sandbox policy and never executed live — left as an
explicit OWNER CHECK in the runbook rather than claimed as proven.
Not done here: no fresh gate/typecheck/build re-run in this tree specifically for this port (nothing
in the ported file touches code, so nothing here was expected to break; if that assumption turns out
wrong, downgrade this status and investigate before trusting the doc).
OWNER CHECK: same three items the runbook's own closing section lists — run `Restore-Database.ps1`
yourself against a real backup file (the one half no session has executed live yet); the real
client-host restore test on the actual physical PC; the admin handover session walking through a
manual backup/verify.

## T13 — Service-due email and recurrence (design first)
Status: TODO — DESIGN WRITTEN, PENDING OWNER APPROVAL. Owner scope decision 2026-09-28 (see "Owner
decisions" above): adds real outbound service-due email alongside T7's in-app view, plus a
weekly/monthly recurrence rule on `next_service_due_date` instead of only a manual pick.
Design: `docs/autopilot/designs/EMAIL.md` (status DRAFT — OWNER REVIEW as written; not yet approved).
Covers: Gmail-app-password-only SMTP (owner confirmed 2026-09-28, fixed `smtp.gmail.com:587`), a new
singleton settings table with AES-256-GCM-encrypted app password (proposed migration 043, next after
042), an admin-only Manager Settings page, a "Send email" button per row on
`apps/web/src/manager/ManagerUpcomingServices.tsx`, per-customer recurrence columns, and an
idempotent send-attempt ledger. Send-on-demand only in v1 — no cron/background scheduler exists in
this codebase and adding one is a separate deployment-shape decision (explicitly deferred in the
design, option B). No code, migration, or `.env.example` change is authorised until the owner writes
APPROVED in `docs/autopilot/designs/EMAIL.md`, per its own §8 questions and closing line.
Prerequisite: none technically, but shares its "next due date" field with T7 — land after T7 or
coordinate closely if both are in flight, so they don't fight over the same column semantics.

## T14 — Deactivated technicians and in-progress visits were both stuck with no "remove from view" option
Status: DONE (2026-09-28). Not a design-first/autopilot-loop task — a direct owner request handled
interactively in this main tree (not the claude/autopilot worktree), so it skipped the AUTOPILOT.md
gate/fresh-reviewer ritual; see "Verification" below for exactly what was actually run instead.
Owner reported two things that "couldn't be deleted." Investigation found two different root causes,
not one bug:
- **Deactivated technicians**: never a bug — `Technicians are disabled, never hard-deleted` (line 16
  above) is a real, standing decision. The actual gap was cosmetic: a deactivated technician kept
  showing in the list forever with zero action buttons, no way to get it out of view. Owner chose
  "hide by default, toggle to reveal" (mirrors the existing archived-customers pattern) over
  reversing the hard-delete decision or building a Reactivate button.
- **In-progress (open) service visits**: `PUT /manager/service-visits/:jobId/archive` already worked
  for any job status server-side; the web UI simply never rendered the Archive button unless
  `visit.status === "closed"`. Owner chose the cheap fix (extend Archive to open visits, exactly as
  today's archive semantics) over building real job-cancellation (which would need a new job-status
  concept and technician-side sync rejection — flagged as a bigger, undesired change).
Files: `apps/web/src/manager/ManagerTechnicians.tsx` (new `showDeactivated` state, client-side filter
over the already-loaded list, no API change), `apps/web/src/manager/ManagerCustomerServiceHistory.tsx`
(Archive/Restore now render for both open and closed rows; the open-row confirm dialog adds an explicit
note that archiving does not stop the technician from continuing to sync into the job — it only
removes it from this list). Updated tests to match: `manager-technicians.spec.ts`,
`manager-technician-services-done.spec.ts`, `manager-customer-service-history.html` + its
`.spec.ts` wrapper.
Verification (no fresh-context reviewer was spawned — this ran outside the autopilot loop): `apps/web`
typecheck + build clean; the five touched/adjacent specs green
(`manager-technicians.spec.ts`, `manager-technician-services-done.spec.ts`,
`manager-customer-service-history.spec.ts`, `manager-supervisor.spec.ts`,
`manager-customer-configuration.spec.ts` — 31/31); full `apps/web` Playwright suite: 110 passed / 13
failed. All 13 failures are in `manager-corrections.spec.ts` and
`manager-app-auth-transitions.spec.ts`, reproduced identically with `--workers=1` (not a parallel-run
flake), timing out on a sidebar "Services" nav click in `AppShell.tsx` — a file untouched by this
change and not modified anywhere in the working tree, and the failure occurs before either changed
screen would even mount. Confirmed pre-existing/unrelated, not caused by this work; spun off
separately (background task `task_03bd1926`, not tracked as a BACKLOG item since it's unrelated to
any T-numbered scope here) rather than fixed inline or left silently swept under this task.
Not done: no formal revert-proof drill (no new guard/test was added — behavior is a display-filter
and a button-visibility change, not a new invariant to prove); nothing staged or committed, per this
tree's git-ownership rule (owner does git manually).
OWNER CHECK: Technician List — deactivate someone and confirm they drop off the list, then toggle
"Show deactivated technicians" and confirm they reappear with the Inactive badge and no action
buttons removed that existed before. Customer service history (any in-progress visit) — confirm
Archive now appears next to "View Progress", and that the confirm dialog's extra sentence about the
technician still being able to sync reads clearly before you use it for real.

## UI-1 — Desktop page centering beside the sidebar
Status: DONE (2026-09-28; owner confirmed). First fix `c830061` (release `sha256-5f89cd7979b8faaa`); Manager follow-up below.
With the persistent sidebar, pages were centered in the space beside it, so on desktop they sat right
of the browser midpoint. `apps/web/src/styles/app.css` now mirrors the sidebar width as
`margin-inline-end` on `.app-shell-content` at `min-width: 1200px`, so pages line up with the header.
Phone (<768 px, sidebar hidden) is unchanged; 768–1199 px still centers beside the sidebar by design
(mirroring it there would squeeze the content).
Verified 2026-09-28: `technician-sidebar-navigation.spec.ts` (New Service Visit and Upcoming Services
centered within 2 px at 1280 and 1920; no horizontal overflow at 768 and 360) and
`manager-dashboard-navigation.spec.ts`, 4/4 passed with 1 worker. With 4 workers on a cold dev server,
3 timed out at start-up (not layout failures).
Follow-up 2026-09-28: five Manager pages had no page width, so at wide desktop widths they either
filled the whole column beside the sidebar (Company Profile, Email reminders, Customer Configuration
with data), running past the header on both sides, or shrank to their content (Add Customer, Service
Catalog). A width-only rule in `app.css` gives these five pages `min(var(--page-width), 100%)`.
`manager-dashboard-navigation.spec.ts` "wide desktop…" asserts all five are centered at 1280 and match
the header edges at 1920 (revert proof: without the rule it fails on "Services at 1920px"). Related
specs 22/22 passed; web typecheck passed. Owner confirmed the layout 2026-09-28.
Deploy note: the PWA uses prompt updates, so an open browser keeps the old build until **Update now**
is chosen on a safe screen, or until every tab and app window is closed.
OWNER CHECK (passed 2026-09-28): after updating, the sign-in screen shows the new "Support build"; at a window width of
1200 px or more, Technician and Manager pages line up with the header.

## Not for autopilot (other owners)
- PDF generation, R2 renderer, R3 PDF engine, R4 pending report fields: PDF work (GPT-6).
- PDF sharing via the phone's share sheet / email app: after the PDF work lands.
- MFE company details and logo: waiting for the client.
