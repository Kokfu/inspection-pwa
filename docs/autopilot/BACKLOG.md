# Autopilot backlog

Rules: `docs/autopilot/AUTOPILOT.md`. Work top to bottom. Status is one of
`TODO`, `IN PROGRESS`, `DONE`, `NEEDS OWNER: <question>`, `BLOCKED: <reason>`.
Base commit: `28e1235` (branch `claude/autopilot`).

## Owner decisions already made (2026-09-19)

- Autopilot commits locally on `claude/autopilot`; never pushes; owner merges.
- **Supervisor** = review + correct only: reviews submitted inspections, makes audited corrections,
  approves reports. Cannot manage users, customers, templates or configuration. Admin (manager) can
  do everything a supervisor can.
- **Compliance reminders** = in-app only (no email, no push).
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
Status: NEEDS OWNER: review `docs/autopilot/designs/T5.md` and write APPROVED with answers to its §9 (V7 only?
detector N/T/I excluded? corrections to Not Good without photo? technicians see corrections? PDF download
for corrected visits until the PDF work integrates? reason mandatory?). Prerequisite: T4 DONE.
Carried from T4 (owner, 2026-09-20): the design must also give supervisors read access to accepted
detail (`masterSystemInspections` GETs) **and** evidence photos (`inspectionAttachments`, `stagedEvidence`
accepted GETs); these still refuse supervisors after T4.
Hard constraint: an Accepted inspection is immutable forever (v7-evidence-acceptance skill). A
correction must therefore be an additive, versioned record that references the accepted authority
(who, when, field path, old value, new value, reason), never an in-place update. The design must say
how Accepted Detail and the Final Report show corrected values while keeping the original visible,
and how this interacts with the PDF work (coordinate: do not edit report/PDF files; describe the
view-model input the PDF work will need).

## T6 — Report approval
Status: TODO — DESIGN FIRST. Prerequisite: T4 DONE.
A completed visit's report moves `awaiting approval` → `approved` (by admin or supervisor), with audit.
Decide whether technicians see the state and whether unapproved reports can be downloaded. Do not
touch PDF rendering files.

## T7 — In-app compliance reminders
Status: TODO. Prerequisite: T3.
Manager Home: "Due soon" and "Overdue" counts plus a list, computed from the existing service due
dates (Next Upcoming Service). No email, no push, no background scheduler: computed on request from
the server (read-only query), respecting the owner's time zone rules already used by the scheduling
code. DoD: API tests (boundary days, time zone), Playwright on Manager Home, gates, commit.
OWNER CHECK: set a customer's next service to tomorrow → Manager Home shows it under Due soon.

## T8 — Attachment source label (camera vs gallery)
Status: TODO. Prerequisite: T3.
Audit how photos are captured today (camera `capture` vs file picker) and whether the source is
stored and shown. If missing: record `source: "camera" | "gallery" | "unknown"` locally at capture time,
send it with the evidence metadata (additive, optional field; old records stay `unknown`), show it in
Accepted Detail. Never change evidence identity, hashes or the frozen manifest shape for existing
records. DoD per v7-evidence-acceptance tests that apply. If the change needs a new migration or touches
the frozen manifest, switch to DESIGN FIRST.

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
Status: TODO. Prerequisite: none (can run any time the others are blocked).
Consolidate `scripts/Backup-*.ps1`, `Restore-*.ps1`, `Verify-Backup.ps1` into
`docs/operations/backup-and-restore.md` for the client host. Prove a restore ONLY into a disposable
Postgres container (never the runtime DB, never Docker volumes). The real client-host restore test and
the admin handover session are OWNER tasks: list them under OWNER CHECK.

## Not for autopilot (other owners)
- PDF generation, R2 renderer, R3 PDF engine, R4 pending report fields: PDF work (GPT-6).
- PDF sharing via the phone's share sheet / email app: after the PDF work lands.
- MFE company details and logo: waiting for the client.
