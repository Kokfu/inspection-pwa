# Ready-to-paste agent prompts — client change requests (Oct 2026)

Companion to [CLIENT_CHANGE_REQUESTS_2026-10.md](CLIENT_CHANGE_REQUESTS_2026-10.md). One prompt per item, to paste
into the implementing agent (Terra / Codex). Run **one at a time**, review the result, commit manually, then the next.

**Prompt types**
- **BUILD** — safe to implement now.
- **PLAN ONLY** — high risk (touches evidence contract, sync, Dexie or Postgres = protected scope). The agent produces a
  plan and stops. Paste its plan back to Claude for review; the BUILD prompt follows after your confirmation.

**Recommended order:** CR-11 → CR-05 → CR-03/04 → CR-06 → CR-08 → CR-01 plan → CR-07 plan → CR-02 plan → CR-09 plan/A → CR-10 plan.

> Verification note: `.agents/skills/codex-task-brief/SKILL.md` "Standard gates" are written for the V7 evidence
> work. These prompts use the `AGENTS.md` verification levels instead (Level 1 for UI-only, Level 2 for sync/data).
> The skill's standing rules (no git, no scope widening, report honestly) still apply.

---

## Shared rules (already included in every prompt below)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules only). Repo: cd C:\PWA_OfflineRecordWebApp,
branch phase-8e-client-demo-polish.
- No git mutations (no stage/commit/push/stash/restore/reset). Stop before staging.
- The working tree already has other uncommitted changes. Do not revert, reformat or "tidy" files unrelated to this task.
- Do not touch Docker Compose, Caddy, .env, package-lock, Postgres migrations or the Dexie schema/version unless the
  task below explicitly says so. Do not run Docker Compose.
- Inspect first, smallest change, no unrelated refactor, never weaken an existing test to make it pass.
- Report: files changed (one line each), behavior changed, tests run + results, P0/P1/P2 findings, limitations,
  and what the owner should test on the phone. Do not claim a phone/browser/offline test you did not perform.
```

---

## CR-01 — Good → optional photo (PLAN ONLY)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read
.agents/skills/v7-evidence-acceptance/SKILL.md, sync-engine, backend-api-security and offline-first-pwa.
THIS IS A PLAN-ONLY TASK. Modify NO files. Print the plan in your reply and stop.

CLIENT REQUEST (CR-01): "Good -> Optional Upload Photo." When a checklist item's result is Good, the technician may
OPTIONALLY attach a photo. It must never block Submit. Poor / Not Good rules (remark + photo) do not change.

INSPECT, then produce a plan that answers:
1. Where photo rules live today for every inspection system (apps/web/src/<system>/*V7Evidence.ts and the other
   evidence files; apps/api/src/inspections/evidence/v7EvidenceContracts.ts; v7StagedEvidence.ts; attachments/*).
   List each system and whether it is already V7 / legacy (V1-V6) so the change is scoped correctly.
2. Does the server currently REJECT a photo on a Good field (strict validation)? Exact file:line.
3. Can this be done WITHOUT changing a published template version or the DB schema? If a forward-only new template/
   contract version or a migration is required, say so explicitly with the reason — do not hide it.
4. Impact on: evidence-first sync ordering, photo upload/idempotency, frozen manifest, accepted detail view, final
   report/PDF (do optional Good photos appear in the report?), corrected-copy flow, photo retention.
5. Smallest shared implementation (one shared web component/policy vs per-system edits) and the number of files.
6. Test plan (focused tests per layer + Level 2 checks: idempotency, exact UUID confirmation, server authority,
   existing-system regressions).
7. Phasing (e.g. 1 pilot system first, then the rest) and risks.

Owner defaults to confirm in your plan: one optional photo per item, same size limits as Poor photos, all systems.
```

## CR-02 — Manual site, saved after first visit, Admin approval (PLAN ONLY)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read offline-first-pwa,
indexeddb-data-model, sync-engine and backend-api-security.
THIS IS A PLAN-ONLY TASK. Modify NO files. Print the plan in your reply and stop.

CLIENT REQUEST (CR-02): "New Service Visit, Manual Key in Select Site. Need Save after first visit. Supervisor approval."
Owner's reading: on New Service Visit the technician can type a site that is not in the Site list. It is saved after
the first visit so it appears in that customer's Site list next time, but only once an ADMIN (the role currently labelled
"Supervisor" in the UI; the label is being renamed to Admin under CR-11) has approved it.

INSPECT, then plan:
1. Current flow: apps/web/src/jobs/NewServiceVisit.tsx (site <select>, "Add New Customer"), jobApi.ts,
   apps/api/src/jobs/serviceVisits.ts, referenceData site loading.
2. The existing location-proposal flow (TechnicianLocationProposal.tsx, technicianLocationProposalDraft.ts,
   migration 048_customer_location_proposals.sql, the reviewer inbox): can it be reused/extended for SITES, or is a new
   proposal type needed? Prefer reuse.
3. Data model: where does an "unapproved site" live (server table state vs separate proposal table)? Does it require a
   Postgres migration or Dexie change (protected scope — name each one and why it is unavoidable)?
4. Can the visit be created and worked on BEFORE approval? (owner default: yes; site is "pending" until approved.)
   What does the report/PDF show for a pending site? What happens if the Admin rejects it?
5. Offline Contract: new visits are currently online-only (see PHONE_TESTING_STATUS I-02). Say whether this keeps that.
6. Admin review UI: where it appears in the Admin/Supervisor screens; permissions; idempotent approve; audit fields.
7. Tests (Level 2: authentication, authorization, idempotency, server authority, existing-system regressions) and phasing.
```

## CR-03 + CR-04 — Remove Departure; Arrival becomes automatic (BUILD)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read mobile-first-ui and
backend-api-security. Shared rules: no git, unrelated working-tree changes stay untouched, no migrations, no scope widening.

CLIENT REQUESTS: CR-03 "Departure (Remove)". CR-04 "Arrival (not necessary, if got auto one)".

TASK
1. Inspect first: apps/web/src/jobs/NewServiceVisit.tsx (arrivalTime/departureTime state + the two <input type=time>),
   apps/web/src/jobs/jobApi.ts, apps/api/src/jobs/serviceVisits.ts, apps/api/src/routes/inspectionJobs.ts,
   apps/api/src/reports/finalServiceReport.ts, migration 030_service_visit_cover_fields.sql.
2. Remove the Departure input and the Arrival input from New Service Visit.
3. Arrival becomes automatic: send the visit-creation time (device clock, Malaysia local time, same HH:mm format the
   existing arrivalTime field already uses) in the EXISTING arrivalTime field, so the API, DB column and report keep
   working with no migration. Departure is simply no longer collected (send nothing).
4. FIRST verify the API treats departureTime as optional. If the API or report REQUIRES it, STOP and report instead of
   guessing.
5. Final report/PDF header: keep the layout; an uncollected Departure must render exactly like any other empty optional
   cover field today (do not print "undefined"/"null"). Report which way it renders.
6. Do not drop the DB columns or change API validation strictness (unknown keys must still be rejected).
7. Add focused regression coverage: New Service Visit has no Arrival/Departure inputs; the create request contains an
   arrivalTime in HH:mm and no departureTime; existing visits that already have both values still display unchanged in
   the report. Update existing specs that fill these inputs (do not weaken their other assertions).
8. Check the 360 px layout of the form still looks right (mobile-first-ui).

DoD: web typecheck, web build, the affected Playwright specs, API typecheck + the serviceVisits unit tests (and the
integration tests only against the disposable Postgres on 127.0.0.1:55432, never the runtime DB), git diff --check.
Owner defaults assumed (state them in the report): auto arrival = moment the visit is created; Departure hidden/blank in report.
```

## CR-05 — Shrink the "Remaining Inspections" block (BUILD)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read mobile-first-ui; use
.claude/skills/web-design-guidelines for the UI audit. Shared rules: no git, unrelated working-tree changes stay untouched.

CLIENT REQUEST (CR-05, clarified by the owner): On each service visit, ABOVE the services forms, the "Remaining Inspections"
section lists which services are not done yet. It takes too much space. Remove it, or make it compact (dropdown / table /
other).

TASK
1. Inspect: apps/web/src/jobs/TechnicianHome.tsx (section.remaining-inspections, ~lines 391-405: one .completion-requirement
   card per incomplete unit), styles .remaining-inspections / .completion-requirement in apps/web/src/styles/app.css, and
   every test that references "Remaining Inspections" or "Completion requirements".
2. Implement the recommended option: a COLLAPSED-BY-DEFAULT disclosure (native <details>/<summary>, keyboard accessible).
   The one-line summary shows "Remaining Inspections - N of M complete"; expanding shows the same list, but each
   incomplete unit as ONE compact line (system name - unit label, with the reason as secondary text on the same line or
   a smaller second line). Keep touch target >= 44 px on the summary.
3. Do not change the "Ready to Complete" panel, the completion rules, the Complete Service button or any API/data.
   Display only. When completion data is unavailable keep the existing "Reconnect and refresh..." message.
4. Add/adjust a Playwright test: collapsed by default (list not visible), summary shows the counts, expanding shows the
   incomplete units, "Ready to Complete" unchanged. Check at 360 px width that the block is a single line when collapsed.
5. Update affected existing specs without weakening them.

DoD: web typecheck, build, affected Playwright specs (Level 1), git diff --check.
Note in the report: if you believe a different compact layout is clearly better, say so, but implement the collapsed
<details> version.
```

## CR-06 — Selecting a form option sometimes jumps to the top (INVESTIGATE, then FIX)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read offline-first-pwa,
pwa-release-testing, mobile-first-ui and .claude/skills/vercel-react-best-practices. Shared rules: no git, unrelated
working-tree changes stay untouched, no scope widening.

CLIENT REPORT (CR-06): "Click Form selection (Not Good, sometimes will jump to the top of the [page/form])". The page
sometimes scrolls to the top after the technician taps a result option such as Not Good. Which form it happens in is
not known yet. Root cause is UNKNOWN.

TASK
1. Reproduce in a browser harness first (Playwright, mobile viewport 360x800). For EVERY inspection form (Automatic
   Sprinkler, Hose Reel, Hydrant, Dry/Wet Riser, Fire Alarm, Fire Intercom, CO2, FM200, Smoke Ventilation, Fire Rated
   Roller Shutter, Wet Chemical, Portable Fire Extinguisher): scroll to a field part-way down, tap Not Good (and Good,
   Complete Repair/N.A. where present), and assert window.scrollY (and the form container scrollTop) is unchanged within
   2 px. Include the autosave tick: wait past the autosave interval and assert again. Record which forms/options jump.
2. Find the root cause. Candidates (verify, do not assume): (a) the form or a parent remounts on state change (changing
   `key`, component defined inside a component, route/state change); (b) content ABOVE the field changes height (autosave
   strip, banners, validation summary) so the browser scroll-anchors; (c) a focus() or scrollIntoView call (existing ones:
   AutomaticSprinklerInspectionForm.tsx ~276, HoseReelInspectionForm.tsx ~242, Co2InspectionForm.tsx ~131 run only after
   a failed Submit - confirm they are not also triggered here); (d) the Not Good branch mounting a remark/photo block that
   steals focus; (e) autosave/sync refreshing the record and resetting state.
3. BEFORE editing, print the evidence: which forms reproduce, the root cause with file:line.
4. Fix at the root cause with the smallest change (shared fix if the cause is shared). Do not add scroll-restoring hacks
   unless the root cause cannot be fixed; if you must, explain why.
5. Add a regression test that FAILS before the fix and PASSES after (prove it by temporarily restoring the original
   source with `git show HEAD:<file>`, never `git stash`).
6. If you cannot reproduce in the harness, STOP and report exactly what you tried plus the extra information the owner
   should capture on the phone (form name, which option, whether the autosave strip changed, Android Chrome version).

DoD: web typecheck, build, the new/affected Playwright specs, git diff --check. Then tell the owner the exact phone
retest steps.
```

## CR-07 — Per-section free-text remarks (PLAN ONLY)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read indexeddb-data-model, offline-first-pwa,
sync-engine, backend-api-security and mobile-first-ui.
THIS IS A PLAN-ONLY TASK. Modify NO files. Print the plan in your reply and stop.

CLIENT REQUEST (CR-07), clarified by the owner: "Add new remark." The technician can add a NEW free-text remark inside each
inspection form, tied to the SECTION where it was added. Example: Automatic Sprinkler System -> "S.A.J Main Water Supply":
a remark added there appears in the remark choices of "S.A.J Main Water Supply" ONLY, not in other parts of that system.

INSPECT, then plan:
1. How the remark picker works today: docs/client-format-request/service-remarks-catalog.md (client catalog from REMARK.pdf)
   and the code that renders common remarks per system/section (find it; list per system).
2. A stable "section key" per form section for every system (so a remark attaches to the right section). Does one exist?
3. Where a technician-added remark is stored. Options: (a) device-local only (IndexedDB), (b) shared per customer+section
   on the server, (c) global catalog. Recommend one and justify. Owner default: shared per customer + section, add-only
   (no edit/delete in v1), usable offline.
4. Protected-scope impact: any Dexie schema/version change, Postgres migration, API route. Name each and why it is
   unavoidable; prefer the design that needs the fewest.
5. Offline contract: creating a remark offline, surviving refresh/restart, idempotent sync with client UUID, conflict if two
   technicians add the same text.
6. Validation (length, trimming, duplicates, allowed characters), and how an added remark appears on the saved
   inspection/report (the remark text is copied into the inspection, so old reports never change if a remark is removed).
7. UI: the "Add new remark" control inside the section picker (mobile-first, 44 px targets); phasing (pilot Automatic
   Sprinkler first, then the other systems).
8. Test plan (Level 2).
```

## CR-08 — Date and time watermark on photos (BUILD)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read offline-first-pwa,
indexeddb-data-model and pwa-release-testing. Shared rules: no git, unrelated working-tree changes stay untouched, no
Dexie/Postgres schema change.

CLIENT REQUEST (CR-08): "Take Photo (Watermark, Date and Time)". Photos taken in the app must carry a visible date and
time stamp.

TASK
1. Inspect: apps/web/src/attachments/imageProcessing.ts (processInspectionPhoto: decode -> canvas -> JPEG compress to
   <= 2 MB -> SHA-256), CameraCaptureDialog.tsx, PhotoEvidenceField.tsx, correctedCopy.ts, attachmentRepository.ts, and
   EVERY caller of processInspectionPhoto. List the callers in your report.
2. Burn the stamp into the pixels inside processInspectionPhoto, BEFORE compression and BEFORE the SHA-256, so the
   stored blob, its hash and its size are the stamped image. Offline-safe (canvas only, no network).
3. Stamp content: date and time in Malaysia time (Asia/Kuala_Lumpur), format "10 Oct 2026 14:32" (24 h). Use the existing
   Malaysia date/time helper if one exists (e.g. formatMalaysiaDateTime) instead of a new one. Date source: the moment of
   processing (device clock) for both camera captures and gallery picks (owner default).
4. Placement/legibility: bottom-right, white text on a semi-transparent dark rounded box; font size scales with image width
   (about 2.5% of the long edge, minimum 14 px) and is drawn AFTER scaling to the output size so it stays crisp. It must
   remain readable after JPEG compression and must not push output above the 2 MB hard limit (the existing quality/size
   loop must still converge).
5. Never stamp twice: confirm no path re-runs processInspectionPhoto on an already-stamped blob (corrected copy, retry,
   sync, resize). If one does, handle it and say how.
6. Existing stored photos are unchanged. No change to the attachment record shape.
7. Tests: unit/browser test that a processed photo (a) still decodes as JPEG, (b) is <= 2 MB, (c) is NOT pixel-identical to
   the input, with non-background pixels in the bottom-right region, (d) differs for two different timestamps (inject the
   clock). Update existing tests that assert exact photo bytes/hashes without weakening them.
8. Report anything that would block a full-size phone camera photo (memory, time) and what you measured.

DoD: web typecheck, build, focused photo tests + affected Playwright specs, git diff --check. Tell the owner the phone
retest steps (camera capture, gallery pick, offline capture, sync, view in accepted detail/PDF).
```

## CR-09 — Plan the Repair List feature (PLAN ONLY)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read v7-evidence-acceptance, sync-engine,
indexeddb-data-model, backend-api-security, offline-first-pwa, mobile-first-ui.
THIS IS A PLAN-ONLY TASK. Modify NO files. Print the plan in your reply and stop.

CLIENT REQUEST (CR-09): "Repair feature can remove. Add new form from the navigation bar section (Repair List, only repair
the particular part). Before and After comparison."
Requirements: (1) remove the Complete Repair result from the inspection forms (code kept recoverable, see CR-09 Phase A);
(2) a new Repair List form reachable from the navigation bar (apps/web/src/layout/AppShell.tsx); (3) it covers ONLY the
particular failed part(s), not a full re-inspection; (4) each repaired part shows a Before vs After comparison (original
finding/photo vs repair photo).

INSPECT, then plan:
1. How "complete_repair" is used today across web (~50 files) and API (inspections/evidence, templates, corrections, reports):
   what it means in the data model and in the report. How Not Good / Poor items are recorded (field key, remark, photo).
2. What a "repair item" is: a reference to the ORIGINAL accepted inspection field (job, system, unit, field key, original
   result, original photo + remark) plus the repair record (after photo, notes, who/when). Data model, stable UUIDs,
   idempotent sync, evidence-first ordering. Which Dexie stores and Postgres tables/migrations are needed (protected scope —
   list each, justify, and say whether repair can reuse the existing V7 staged-evidence mechanism).
3. Who can see/create the Repair List (technician nav item? Admin/Manager view?), which jobs/customers it lists, how items
   enter the list (every accepted Not Good/Poor field?), and how an item leaves it (repaired and synced).
4. Before/After UI (mobile first) and what happens offline.
5. Historical immutability: accepted records that already contain complete_repair must keep rendering in accepted detail
   and PDFs. State exactly what the server will accept after Phase A.
6. Phases with independent value and rollback: A) disable Complete Repair entry (comment-out, no server change),
   B) Repair List data + sync, C) Repair List UI + before/after, D) repair-only PDF (CR-10). Test plan per phase (Level 2).
7. Open questions for the owner (is the "after" photo required? one or many photos? can one item be repaired more than once?).
```

## CR-09 Phase A — Remove Complete Repair from new entry, keep code recoverable (BUILD)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read v7-evidence-acceptance and
offline-first-pwa. Shared rules: no git, unrelated working-tree changes stay untouched, no migrations, no Dexie change,
NO server/API behavior change.

OWNER DECISION: remove "Complete Repair" from ALL inspection forms, but keep the code RECOVERABLE: comment it out (do not
delete) with one searchable marker so it can be restored with little work later.

TASK
1. Inspect everywhere "complete_repair" / "Complete Repair" appears in apps/web/src (~50 files). Classify each hit:
   (a) NEW-ENTRY UI (result option buttons/choices in the inspection forms and their definitions) - DISABLE these;
   (b) READ-ONLY display of already-saved data (accepted detail views, ServerXxxView, AcceptedCorrectionsPanel,
       ManagerFinalReportView, ManagerCorrectionEditor labels, final report) - KEEP working: old accepted/draft records may
       already contain complete_repair and must still render with the label "Complete Repair";
   (c) types/validators/evidence policy - KEEP, so existing data and the server contract still parse (the server is NOT
       changed in this task).
2. For class (a): comment the option out with the exact marker `// REPAIR-DISABLED (CR-09): <what>` (use {/* */} in JSX) so
   `grep -rn "REPAIR-DISABLED"` lists every place to restore. Do not delete code or tests that cover it; where a test
   asserts the option, skip it with the same marker and a reason (a SKIP is not a PASS: list them).
3. Where a form's result options are generated from a shared definition, prefer ONE switch/constant in the shared place
   (marked REPAIR-DISABLED) over 12 scattered edits.
4. Existing DRAFTS that already hold complete_repair: do not crash, do not silently rewrite. Show the saved value as read-only
   text "Complete Repair (no longer selectable)" and let the technician change it to another option. Report how you handled it.
5. If removing the option would leave any form unable to be submitted (a rule that requires a complete_repair-only path),
   STOP and report that case instead of working around it.
6. Tests: new-entry forms for every system no longer offer Complete Repair; an accepted record containing complete_repair
   still renders in its accepted view and in the final report; a Draft containing it opens and can be changed. Update existing
   specs that click Complete Repair (mark REPAIR-DISABLED, do not weaken).
7. Print `grep -rn "REPAIR-DISABLED"` output in the report as the restore checklist.

DoD (Level 2-lite): web typecheck, build, affected Playwright and node tests, API unchanged (show git status for apps/api),
git diff --check.
```

## CR-10 — Repair-only PDF (PLAN ONLY, after CR-09 Phase B/C)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Also read v7-evidence-acceptance,
backend-api-security. THIS IS A PLAN-ONLY TASK. Modify NO files. Print the plan and stop.
PRECONDITION: the Repair List data exists (CR-09 Phase B/C). If it does not, say so and stop.

CLIENT REQUEST (CR-10): "Repair Form (PDF section, only put the repair section)". A PDF containing ONLY the repair section
(Repair List with Before/After), not the whole service report.

INSPECT apps/api/src/reports/ (finalServiceReport.ts, reportViewModel.ts, template/), docs/report-template/ (approved HTML
template, R1-R4 plan), the existing PDF download route and how approval gates a report. Plan: separate PDF vs exportable
section of the normal report (recommend one); which template parts are reused; Before/After image layout, page breaks,
photo sizing/memory; who may download and when (auth, approval state); filename; what shows when there are no repairs;
tests (including a rendered-PDF check) and phasing.
```

## CR-11 — Supervisor → Admin, label only (BUILD)

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Shared rules: no git, unrelated working-tree
changes stay untouched, no migrations, no Dexie change, no scope widening.

CLIENT REQUEST (CR-11): "Supervisor change to Admin (Just the name)". OWNER CONFIRMATION: wording change only. The existing
Admin role keeps signing in through the "Manager" card exactly as today. The role currently called "Supervisor" (internal
value `supervisor`, its own sign-in card) is shown as "Admin" everywhere a user can read it.

TASK
1. Find every USER-VISIBLE occurrence of "Supervisor"/"supervisor" (case variants, plural, "Supervisors", "Add Supervisor"):
   apps/web/src (RoleSelection.tsx card title, LoginForm.tsx heading text, App.tsx role/access messages, corrections/
   AcceptedCorrectionsPanel.tsx "Reviewed by Supervisor" + "Supervisor approval is pending", jobs/FinalReportPresentation.tsx,
   jobs/TechnicianLocationProposal.tsx copy, manager/* screens: ManagerTechnicians, ManagerHome, ManagerOperations,
   ManagerServicesDone, ManagerReminderPlan, ManagerEmailReminders, ManagerCorrectionEditor, ManagerFinalReportView, roleAccess),
   apps/api/src (any text that reaches a user: report/PDF text, e-mail/reminder text, error messages), docs/client/*
   (USER_GUIDE.md and other client docs), and strings in app.css comments are NOT user-visible (leave them).
2. Change the visible wording to "Admin". Fix grammar around it ("A Supervisor or Admin reviews it" -> "An Admin reviews it";
   "Supervisor/Admin" -> "Admin"; a/an).
3. DO NOT change: the internal role value `supervisor` / ProductRole / route names / API fields / JSON keys / DB columns,
   enums or migrations / CSS class names / localStorage or Dexie keys / test file names / fixtures with role: "supervisor" /
   already-stored data. The existing `admin` role and the Manager sign-in card are unchanged.
4. Some screens may now show "Admin" for both an old admin account and a former supervisor (e.g. a staff list). Follow the
   owner's instruction (label = Admin) and LIST each such place in your report so the owner can decide later. Do not invent
   new labels.
5. Already-submitted reports: a report text built at READ time is fine to change; text that was STORED in the database
   (e.g. a saved "reviewedBy" label or generated PDF already on disk) must not be rewritten. State which case each is.
6. Update tests that assert the old wording (e.g. manager-supervisor, manager-technicians, accepted-corrections-panel,
   location-proposals-unreadable, manager-corrections, manager-report-approval, manager-email-reminders specs and
   locationProposalReviewShape.test.ts, API tests that assert changed text). Change expected wording only; never weaken
   an assertion. Where a test locates the card by name /^Supervisor/, update it to the new visible name.
7. Print a final `grep -rni supervisor apps/web/src apps/api/src docs/client` and classify EVERY remaining hit as
   "internal identifier - intentionally kept" or "missed - fixed".

DoD (Level 1): web typecheck, web build, affected Playwright specs, web node tests touched, API typecheck + API tests for any
changed API string (disposable Postgres on 127.0.0.1:55432 only, never the runtime DB), git diff --check.
```

---

## CR-07 Phase 1 — Per-section "Add new remark", Automatic Sprinkler pilot (BUILD, Level 2)

Plan approved 2026-10-10. Uses **migration 049** (048 is the latest; CR-02 will be 050, CR-09 will be 051).

```
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Read indexeddb-data-model, offline-first-pwa, sync-engine,
backend-api-security, mobile-first-ui. Also read docs/client-format-request/CLIENT_CHANGE_REQUESTS_2026-10.md (CR-07) and
docs/client-format-request/service-remarks-catalog.md. Repo: cd C:\PWA_OfflineRecordWebApp, branch phase-8e-client-demo-polish.

TASK: CR-07 Phase 1 — a technician adds a NEW free-text remark inside one form SECTION; it is stored per customer + system + section and offered
ONLY in that section's remark choices (e.g. Automatic Sprinkler -> "S.A.J Main Water Supply" row; not other rows, not Comments). Pilot = Automatic Sprinkler only.

OWNER DECISIONS (final)
- Scope key = (customerId, systemKey, sectionKey). Repeated rows (drum/detector/device/location) share ONE list per template slot, never per row UUID.
- The Comments box is its own section.
- Add-only in v1 (no edit/delete UI). Show a confirm line before saving ("Adds to <section name> for this customer. This cannot be undone here.").
- In the Automatic Sprinkler form the old "Others -> Add to common remarks" (system-wide) is REPLACED by the section-scoped "Add new remark".
  Every other system keeps today's behavior unchanged in this phase. The Manager's global common-remarks screen and /api/service-common-remarks are unchanged.
- Server stores nothing in the inspection payload: the chosen remark TEXT is appended to the existing field string (appendCommonRemark). No remark id enters
  responses, no template/contract/evidence/report change.

DESIGN (print it before editing, then implement)
1. Section keys. Reuse the label-override canonical paths (apps/api/src/inspections/labelOverrides.ts collectResolvedLabelPaths; web labelAt(...)) for
   checklist rows and measurement rows, plus fixed constants for non-labelled slots (at least `comments`; add others the Sprinkler form needs, e.g.
   `<path>.fieldRemark` for V7 per-field Poor remarks, repeatable-row remark slot). Put the allowlist in ONE web module (e.g. src/inspectionControls/
   remarkSections.ts) and an API copy (e.g. apps/api/src/inspections/remarkSections.ts) with a PARITY TEST (pattern: tests/labelOverridesParity.test.ts).
   Every RemarksField site in AutomaticSprinklerInspectionForm.tsx (checklist ~176, measurements ~234, Comments ~340) must map to an allowlisted key.
2. Migration apps/api/migrations/049_service_section_remarks.sql (additive, new table only; register in apps/api/src/db/migrations.ts):
   service_section_remarks(id uuid PK, customer_id FK RESTRICT, system_key, section_key, wording, created_by_user_id FK, job_id uuid NULL (audit, no FK, as 048),
   create_fingerprint text, active boolean default true, created_at, updated_at); UNIQUE (customer_id, system_key, section_key, lower(wording)) WHERE active.
   CHECKs on lengths. No seed, no backfill. Do NOT alter service_common_remarks or any existing table.
3. API router apps/api/src/routes/sectionRemarks.ts, mounted in server.ts:
   - GET  /api/customers/:customerId/section-remarks  (only that customer's active rows; scoped like the POST)
   - POST /api/technician/customers/:customerId/systems/:systemKey/section-remarks  body {id, sectionKey, wording, jobId?}
   Auth required. requireExpectedActor for identity. Inspector must own a non-sample, non-closed-or-any job for that customer containing that system
   (same predicate as locationProposals.ts ~188); admin/supervisor allowed. Fail closed on unknown keys, unknown systemKey/sectionKey (allowlist), malformed uuid.
   Normalise (trim, NFC, collapse whitespace), length 3..300 after normalising; reject control chars (incl. newline) and zero-width/bidi-override chars
   (U+200B-200F, U+202A-202E, U+2066-2069). Cap 50 active remarks per (customer, system, section) counted under a transaction advisory lock.
   Idempotency: same id + same fingerprint -> 200 {duplicate:true, requestedId}; same id + different content -> 409 IDEMPOTENCY_CONFLICT;
   different id + same text in same scope -> 200 {merged:true, requestedId, remark:{canonical row}} (never 409). Echo the REQUESTED id in the response.
   Audit event row. Reject if the customer is demo/inactive.
4. Web store (mirror src/inspectionControls/commonRemarks.ts addCommonRemark/refreshCommonRemarks): cache in the existing `referenceData` store under key
   `service-section-remarks:<customerId>`; ONE Dexie transaction writes the cache entry + a syncOutbox item (entityType "sectionRemark", entityId = remark uuid
   from crypto.randomUUID()). NO Dexie version()/stores()/index change: in src/db/localDatabase.ts add "sectionRemark" to the entityType union ONLY
   (type-only edit; git diff must show no stores()/version() change). Refresh merges server rows with pending outbox items; after a merged/canonical response
   swap the local id for the canonical one (inspections store text, not ids). A malformed server response fails closed and keeps the previous cache.
   Prefetch the customer's rows when a form opens online (and keep working offline from the cache). Pure shared normalise/validate function used by web and tested for parity with the API.
5. Sync: add syncPendingSectionRemarks to src/sync/syncEngine.ts and ADD "sectionRemark" TO THE EXCLUSION LIST in the generic outbox loop (~line 534) —
   forgetting this is a P1. Mark an item Completed ONLY when the response echoes the exact requested uuid (not on HTTP 200 alone); timeouts/5xx retry; 4xx
   validation -> Failed with a visible reason; no duplicate outbox items on retry.
6. UI: src/inspectionControls/RemarksField.tsx gets optional props `customerId` and `sectionKey` (and uses them only when both are set, so other systems are untouched).
   Below the existing Remark <select> add a full-width "Add new remark" button (>= 44px, secondary-command style) -> inline editor: labelled <textarea>
   (300-char counter), "Save & use", "Cancel", plus the confirm line naming the section. On save: write locally (offline OK, never disabled by navigator.onLine),
   add to this section's choices, append to the field. Hidden when readOnly. Duplicate (case-insensitive, same section) or equal to a catalog entry for that
   system -> show an inline message, do not create. Mobile-first at 375px, one column, tokens only, no horizontal scroll. Put new CSS in ONE clearly marked
   block appended at the END of src/styles/app.css ("/* CR-07 ... */") and do not reformat anything else in that file.
7. Wire AutomaticSprinklerInspectionForm.tsx: pass customerId (from the record/job; if it is not available on the form, STOP and report) and the sectionKey for all
   three RemarksField kinds.

DO NOT TOUCH / PRESERVE
- Dexie stores()/version()/indexes, package-lock, Docker, Caddy, .env, V1-V7 templates, report/PDF code, evidence contracts, service_common_remarks and its route/screen.
- The working tree has OTHER uncommitted work from the older phone-fix batch. Do not edit, revert or reformat: src/App.tsx, src/layout/AppShell.tsx,
  src/jobs/NewServiceVisit.tsx, src/referenceData/referenceDataApi.ts, FireRatedRollerShutter*, apps/api/src/attachments/*, scripts/phone-testing/*,
  docs/testing/PHONE_TESTING_STATUS.md. In src/styles/app.css append only (see 6). In package.json add only the new test:* script line(s).
- No git mutations. Do not run Docker Compose. Integration tests only on a NEW disposable Postgres at 127.0.0.1:55432 (never inspection_pwa-postgres-1);
  host TCP readiness must be verified; a SKIP is not a PASS.

TESTS (fail before / pass after where applicable; prove with `git show HEAD:<file>`, never git stash)
API integration (disposable Postgres): create 201; replay same id+content 200 duplicate; same id different content 409; same text different id -> merged
canonical row; two concurrent POSTs of the same text -> 1 row; different sections and different customers independent; each validation rejection (control char,
zero-width, bidi, <3, >300, unknown key, unknown systemKey/sectionKey, cap 50); technician with no job for the customer -> 404 (uniform); admin allowed; identity
mismatch rejected; GET never returns another customer's rows; audit rows written; cold migration from 048 and re-run safe; global /api/service-common-remarks
GET unchanged. Existing common-remarks tests (common-remarks.spec.ts, commonRemarkFormatting.test.ts, serviceCommonRemarks.test.ts,
manager-common-remarks-mobile.spec.ts) must still pass; if one asserts the old Sprinkler "Add to common remarks" label, change it deliberately and call it out.
Web unit: section-key allowlist parity web<->API and "every Sprinkler RemarksField site has an allowlisted key"; normalise parity; cache+outbox atomic with
rollback when the second write fails; merge keeps pending items; canonical-id swap; malformed server response fails closed; 200 without the echoed id is NOT
Completed; timeout then retry creates no duplicate; "sectionRemark" excluded from the generic loop.
Browser harness (Playwright): offline, add a remark on "S.A.J Main Water Supply" -> appears there and NOT on another row or Comments; survives reload; submit
local -> reconnect -> sync -> exactly one server row; a second technician (same customer) sees it after refresh; 375px: 44px targets, no horizontal scroll;
read-only hides the control; Admin wording intact.
Run the standing typecheck/build gates (web + api), the relevant existing suites (sync, offline-start, technician-offline-regression), git diff --check.

REPORT: files changed (one line each), design decisions, the migration SQL, tests run + results, P0/P1/P2, limitations (offline first-use gap: a phone that never
fetched this customer's remarks online sees only the catalog + its own additions), owner phone-test steps, a reproducible PowerShell block that starts its own
disposable DB. Write the report to docs/testing/CR07_SECTION_REMARKS_P1.md. STOP when green. Do NOT stage or commit.
```
