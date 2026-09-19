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
Status: TODO. Prerequisite: none.
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

## T2 — Land the Wet Chemical parser + live-spec wiring from the main tree
Status: TODO. Prerequisite: T1. Also wait until the main-tree session "Test-ManagerScheduling.ps1
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
Status: TODO. Prerequisite: T2.
Today a refresh returns to the role chooser (`selectedExperience` is in memory, `App.tsx`). Store it
per tab in sessionStorage, bound to the verified user through the existing owner stamp
(`claimManagerSession`): restore only when the same verified user returns; clear on logout, on login,
and on any identity change. Never restore Manager for a non-admin. Offline-first unchanged.
DoD: Playwright: reload keeps Manager for the same admin; different user after reload gets the
chooser; logout clears it; technician unaffected. Revert proofs. Gates. Commit.
OWNER CHECK: Manager → Services Done → F5 → still in Manager, same screen.

## T4 — Supervisor role (design first)
Status: TODO — DESIGN FIRST. Prerequisite: T3.
Design: a new forward migration adding `supervisor` to the users role CHECK (never edit an applied
migration); `requireRole` semantics (admin ⊇ supervisor for review routes); which existing Manager
screens a supervisor sees (review / Services Done / reports: yes; customers, configuration,
technicians, users: no); how a manager creates a supervisor (extend the existing create-technician
form with a role choice, admin only); audit log entries.
Implement only after the owner writes APPROVED in `docs/autopilot/designs/T4.md`.
Read: backend-api-security, offline-first-pwa.

## T5 — Supervisor corrections with version/audit (design first)
Status: TODO — DESIGN FIRST. Prerequisite: T4 DONE.
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
