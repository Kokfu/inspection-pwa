# Photo source (KPI) and Remark picker: build prompts

Plan, findings and the owner decisions: [PHOTO_AND_REMARKS_PROGRESS.md](PHOTO_AND_REMARKS_PROGRESS.md).
Decisions answered 2026-10-20 (section 4). P3 (gallery reason) is dropped.

Role names (CR-11): UI **Manager** = code role `admin`; UI **Admin** = code role `supervisor`.
"Admin/Manager" in these prompts = code roles `admin` + `supervisor`.

## Order and concurrency

```
Wave 1 (run at the same time — no shared files)
  P1  Camera-first photo controls (web)        attachments/, *EvidenceField.tsx, RepairItemCard.tsx
  R1  One-remark picker, Sprinkler (web)       inspectionControls/RemarksField.tsx (+ remark specs)
  R2  Remark requests: API + migration          api only (routes, migration, tests)        Level 2

Wave 2
  P2  Internal "GALLERY · uploaded <time>"      after P1 reviewed
  R3  Remark requests page + web wiring         after R1 and R2 reviewed (touches RemarksField.tsx + manager files)

Wave 3
  P4  Photo KPI page                            after P2 reviewed (shares manager routing files with R3: not in parallel with R3)
  R4  Hose Reel, Hydrant, Fire Alarm, FM200, CO2 after the Sprinkler phone test of R1-R3
```

- P1, R1 and R2 have no file in common. Same checkout is fine only if each agent edits ONLY its listed files;
  otherwise use separate worktrees.
- R3 and P4 both add a manager page (`App.tsx`, `roleAccess.ts`, `ManagerHome.tsx`, `managerApi.ts`): run them
  one after the other.
- Run the **Review prompt** (bottom) after each step.

---

## Standing rules (paste at the top of EVERY prompt below)

```
Project: Inspection PWA (C:\PWA_OfflineRecordWebApp). Read AGENTS.md first.
Read docs/photo-and-remarks/PHOTO_AND_REMARKS_PROGRESS.md (findings + owner decisions, section 4). The owner's
decisions are final; if something you need is not decided there, STOP and report it. Do not guess.
Read applicable skills before editing (only those that apply): .agents/skills/mobile-first-ui,
.agents/skills/offline-first-pwa, .agents/skills/indexeddb-data-model, .agents/skills/sync-engine,
.agents/skills/backend-api-security, .agents/skills/v7-evidence-acceptance, .agents/skills/pwa-release-testing.
Role names: UI "Manager" = code role admin; UI "Admin" = code role supervisor (CR-11).
- Git is mine. Never stage, commit, push, merge, reset, restore, switch branch or touch stash. Stop before staging.
- Do NOT change: existing Postgres migrations, Dexie schema/version/indexes, package-lock, Docker/Caddy/.env,
  client-material/, historical templates V1-V6, apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts,
  apps/api/src/sync/fireAlarmV6Acceptance.ts. A NEW forward migration is allowed ONLY where the task says so.
- The customer Final Report PDF and the repair visit PDF must NOT change in this work.
- Inspect the existing implementation first; copy proven patterns rather than inventing.
- Edit only the files the task lists. Smallest change, no unrelated refactor, existing behaviour unchanged
  unless the task says so.
- Offline contract: never disable inputs, local save or camera capture because the network is down.
- Validation fails closed; no silent fallback; do not weaken any existing test. If an existing test asserts
  behaviour the owner asked to change, update only that assertion and list it with the reason.
- Add focused regression tests for what you change.
- Gates: focused tests, relevant regression tests, typecheck, build if web changed, `git diff --check`.
- Final report: files changed (one line each), behaviour changed, tests run (with results), P0/P1/P2 findings,
  limitations, readiness for the next step. Do not claim a phone/offline/browser test you did not perform.
- Update docs/photo-and-remarks/PHOTO_AND_REMARKS_PROGRESS.md (step status + log line) and the "Last updated"
  line in HANDOVER.md.
```

---

## P1 — Camera-first photo controls (web only, Wave 1)

Files you may edit: `apps/web/src/attachments/` (new shared component, `CameraCaptureDialog.tsx`,
`PhotoEvidenceField.tsx`), every `apps/web/src/<system>/*EvidenceField.tsx` (11 files, incl.
`fireAlarm/FireAlarmV6EvidenceField.tsx` and `fm200/Fm200EvidenceField.tsx`),
`apps/web/src/repairVisits/RepairItemCard.tsx`, `apps/web/src/styles/app.css`, tests in `apps/web/tests/` and
unit tests next to the code. Do NOT edit `imageProcessing.ts` (the stamp stays as is), any API file or the Dexie
schema.

```
<paste Standing rules>

TASK P1 — The in-app camera is the only normal way to attach a photo. Gallery is offered only when the
in-app camera fails, and every gallery photo is clearly marked.

Today (progress file section 1): 13 photo controls show "Take Photo" and "Choose Existing Photo" (or
"Choose photo") as equal buttons. captureSource "camera" | "gallery" is already stored per photo and synced.

Owner decisions: P-Q1 = (c), P-Q3 = stamp unchanged, P-Q5 wording, P-Q6 = repair visit included.

1. Create ONE shared component in apps/web/src/attachments/ and use it in all 13 controls (11 evidence field
   files + PhotoEvidenceField + RepairItemCard After photo), replacing the duplicated button markup. Keep each
   control's own save function and its captureSource argument exactly as today.
2. The control shows only "Take Photo" ("Replace with Camera" when a photo exists, keep each control's current
   replace wording otherwise). No gallery button while the camera can be used.
3. CameraCaptureDialog: when the camera cannot start — not a secure context / no getUserMedia, permission
   denied (NotAllowedError), or any other start failure (NotFoundError, NotReadableError, etc.) — show the link
   "Camera not working? Upload from gallery" in the dialog instead of the current "close this view and choose an
   existing photo" text. A failure AFTER the stream started (e.g. "Camera image is not ready yet") does NOT
   unlock gallery; the technician can retry Capture.
4. Tapping the link opens a confirm dialog (role="dialog", aria-modal, focus moved in and returned, Escape and
   Cancel do nothing): "This photo will be marked Uploaded from gallery for KPI." Confirm opens the file picker
   (input type=file accept=image/*) from that tap, and the picked file is saved with captureSource "gallery".
   No reason is asked. The gallery path must work offline.
5. Every attached photo whose captureSource is "gallery" shows the badge "Uploaded from gallery" on the
   technician's form, in draft AND read-only views. Camera photos show no badge. Remove/replace keep working.
6. Do not change processInspectionPhoto or the stamp. Do not change what is stored or sent for a photo.
7. Tests:
   - unit: the shared component (only Take Photo by default; gallery link only after each start-failure kind;
     confirm -> picker; cancel -> nothing; a post-start capture error does not unlock gallery);
   - Playwright at 375 px (fake media stream for success; denied camera permission for failure): no gallery
     control while the camera works; after denial the link + confirm + pick saves a "gallery" photo with the
     badge; a camera photo has no badge; no horizontal scroll; 44 px targets;
   - existing photo / evidence / repair specs pass (update only assertions that clicked the old gallery button,
     and list them).

DoD additions: table of the 13 controls -> uses shared component (file:line); proof that captureSource values
for camera and gallery are unchanged; proof imageProcessing.ts is untouched.
STOP when green. Do NOT commit.
```

---

## R1 — One-remark picker, Automatic Sprinkler (web only, Wave 1)

Files you may edit: `apps/web/src/inspectionControls/RemarksField.tsx`, `remarkFormatting.ts` (+ unit tests),
`apps/web/src/styles/app.css`, `apps/web/tests/common-remarks.spec.ts`, `apps/web/tests/section-remarks-form.spec.ts`,
new tests. Do NOT edit API files, `sectionRemarks.ts`, `commonRemarks.ts`, or any other system's form.

```
<paste Standing rules>

TASK R1 — One remark per row, chosen in one place. Scope: Automatic Sprinkler rows only (rows where
RemarksField receives a section scope: systemKey automatic_sprinkler + customerId + sectionKey). Every other
system and every plain text box must behave exactly as today (R4 rolls the rest out later).

Today (progress file section 2.1): picking a remark appends a line; Others writes live as an extra line; a
separate "Add new remark" button opens a second editor; the row's lines are listed below with Remove.

Owner decisions: R-Q2 (one remark per row; Comments box unchanged), R-Q3, R-Q8, R-Q7.

1. The dropdown SHOWS the row's current remark. Choosing another option REPLACES it. A "No remark" option
   clears it. No list below and no Remove buttons.
2. A remark with a detail list keeps its second dropdown; the stored text stays "<wording> — <detail>" exactly as
   today, and the dropdowns show that choice when the draft is reopened.
3. Last option "Others (type your own)": a text box right under the dropdown; the typed text IS the remark
   (replaces, never appends). Reopening a draft whose remark is not in the list selects Others and shows the text.
4. Remove the separate "Add new remark" button and its editor. Under the Others text box show the button
   "Add to common remarks". In THIS step it reuses the existing section-remark save (addSectionRemark, unchanged)
   so nothing breaks before R2/R3; R3 rewires it to the approval request. Tapping it never changes the row text.
5. The Comments box (sectionKey "comments") stays EXACTLY as today (owner decision): dropdown that appends
   lines, Others, list with Remove, and its "Add new remark" editor. Only checklist and measurement rows change.
   Prove it with a spec that runs today's Comments behaviour unchanged.
6. Old data (R-Q3): a row that already holds 2+ lines is shown read-only exactly as today. In an editable draft
   it shows the existing lines with a note "Pick one remark to replace these" and the dropdown; choosing replaces
   all lines with the one remark. Nothing is changed until the technician picks.
7. Keep: maxLength checks, autosave, offline typing, read-only mode, 44 px targets, 16 px inputs, no horizontal
   scroll at 375 px, accessible labels.
8. Tests: unit tests for the value rules (replace, clear, Others, detail, legacy multi-line); Playwright at
   375 px on the Automatic Sprinkler form, row S.A.J Main Water Supply: choose -> change -> Others -> clear ->
   reload keeps the value; a Hose Reel row still behaves as before (append + list).

STOP when green. Do NOT commit.
```

---

## R2 — Remark requests and approval: API + migration (Wave 1, Level 2)

Files you may edit: `apps/api/` only (new migration, routes, `inspections/remarkSections.ts` only if needed —
then the web copy must change byte-identically in R3, so prefer not to), API tests. Do NOT edit web files.

```
<paste Standing rules>

TASK R2 — Server side of "Add to common remarks -> request -> Admin/Manager approval -> permanent choice for
that service + section at every customer".

Owner decisions: R-Q1 every customer; R-Q4 (pending not offered to anyone; rejected visit keeps its text;
technician is told); R-Q5 approvers = code roles admin + supervisor, may edit wording; R-Q7 the system-wide
list (service_common_remarks) stays as is; R-Q9 keep existing CR-07 rows.

Existing pieces: migration 049 service_section_remarks (per customer, no approval) + routes/sectionRemarks.ts
(client UUID, fingerprint, advisory lock, cap 50, DUPLICATE / DUPLICATE_CATALOG), remarkSections.ts allowlist
(byte-identical web copy + parity test). Approval pattern to copy: site proposals
(customer_site_proposals + append-only customer_site_proposal_decisions, routes/siteProposals.ts,
inspections/siteProposal.ts derived status).

1. ONE new forward migration (next free number; check apps/api/migrations/ at build time). Never edit 049.
   - remark requests: client UUID id, system_key, section_key, wording (normalised as 049), requested_by user,
     customer_id + job_id for audit/context only, create fingerprint, created_at;
   - append-only decision table: approve / reject, reviewer, note, approved wording (may differ = edited);
   - approved section remarks for EVERY customer: system_key, section_key, wording, active, source request,
     unique active (system_key, section_key, lower(wording)).
   - Existing 049 rows are untouched and stay per customer (R-Q9: keep, same customer only).
2. Technician create: POST with client UUID, idempotent (same id + same fingerprint = replay returning the same
   request; same id + different body = 409). Response confirms the exact UUID. Refuse (clear 409 code) wording that
   already exists in service_common_remarks for that system, in the approved section remarks of that section, or
   as a pending request of that section (return the existing one). Allowlisted (system, section) only, and
   the "comments" section is NOT accepted for requests (the Comments box keeps today's CR-07 flow).
   Roles: inspector (and admin/supervisor if they fill forms today; mirror sectionRemarks.ts).
3. Technician reads:
   - approved section remarks for a system (all sections) — every customer;
   - their own requests with status (pending / approved / rejected + note) so the app can tell them.
   Pending requests are never returned as choices.
4. Review (code roles admin + supervisor): list pending (+ filter decided), detail, decide:
   approve / approve with edited wording / reject with note. A second decision on a decided request = 409, never a
   second row. Concurrent approvals of the same wording in the same section end in ONE active approved remark.
   Admin/Manager can deactivate an approved section remark (existing inspection text unchanged).
5. Keep the existing CR-07 endpoints working unchanged (phones may still have queued "sectionRemark" outbox items;
   they must keep syncing). List them for Admin/Manager on a read endpoint so R3 can show/deactivate them.
6. Accepted records and reports are never rewritten by any decision.
7. Tests (disposable Postgres 127.0.0.1:55432 only): migration test; route auth matrix (technician cannot review,
   supervisor and admin can); idempotent replay; 409 on changed body; duplicate rules; concurrency (two
   technicians same wording; two reviewers deciding at once); decision log append-only; legacy CR-07 create still
   works; edited wording is what becomes the choice; deactivate.

DoD additions: Level 2 checklist (idempotency, stale callers, concurrency, rollback, auth, exact UUID
confirmation, server authority) with proof; endpoint list with request/response shapes for R3.
STOP when green. Do NOT commit.
```

---

## P2 — Internal "GALLERY · uploaded <time>" label (Wave 2)

Files you may edit: Admin/Manager accepted-detail views of the 11 V7 systems in `apps/web/src/`,
`apps/web/src/jobs/FinalReportPresentation.tsx` + `finalReportApi.ts`, `apps/web/src/manager/repairVisits/`,
the matching internal API read routes/serialisers in `apps/api/src/` (only to ADD capturedAt/captureSource to
internal JSON responses), tests. Do NOT edit `apps/api/src/reports/finalServiceReport.ts` PDF rendering, the
report template, or the repair visit PDF renderer.

```
<paste Standing rules>

TASK P2 — Show the photo source to Admin/Manager on internal screens only (P-Q2, P-Q3).

1. On every internal screen that shows a photo — Admin/Manager accepted detail of all 11 V7 systems (copy the
   ServerAutomaticSprinklerView pattern but make the label VISIBLE), the Final Report web page, and the repair
   visit review — show for gallery photos a visible label "GALLERY · uploaded <time>" (Malaysia time, the
   photo's capturedAt, same formatter the app already uses). Camera photos: no label. Source NULL (pre-047):
   no label, never "camera".
2. If an internal JSON response lacks captureSource or capturedAt, add it (strict parsers on both sides,
   exact-keys checks updated, fail closed on bad values).
3. The Final Report web page currently prints "Uploaded from Gallery" / "Captured by Camera" /
   "Source unavailable" (FinalReportPresentation.tsx:52). Replace the gallery wording with the new label; keep the
   other two as they are.
4. Customer outputs unchanged: prove the Final Report PDF and the repair visit PDF are byte-for-byte the same
   pipeline (no file in the PDF path edited) and add a PDF text test: a job with one gallery photo -> PDF text has
   no "GALLERY"/"gallery".
5. Tests: web specs for each internal view (one per system is fine, or a table-driven spec); API response tests
   for any field added.

STOP when green. Do NOT commit.
```

---

## R3 — Remark requests page + web wiring (Wave 2)

Needs R1 and R2 reviewed. Files you may edit: `RemarksField.tsx`, `apps/web/src/inspectionControls/` new
module for remark requests (outbox + cache), `apps/web/src/sync/` only to register the new outbox item kind,
new `apps/web/src/manager/ManagerRemarkRequests.tsx` + css, `managerApi.ts`, `roleAccess.ts` (add the route to
supervisorRoutes), `ManagerHome.tsx`, `App.tsx`, the technician notice location (copy the location-proposal
technician read-back), tests. No Dexie schema change (reuse `referenceData` + `syncOutbox`, as sectionRemarks.ts).

```
<paste Standing rules>

TASK R3 — Technician request flow and Admin/Manager review page, Automatic Sprinkler.

0. Checklist and measurement rows only. The Comments box keeps today's behaviour and its CR-07 "Add new remark".
1. Technician: "Add to common remarks" under Others now creates a remark REQUEST for this service + section:
   one Dexie transaction writes the local pending entry + the outbox item (client UUID from crypto.randomUUID());
   works offline; synced only when the server confirms that exact UUID. Message: "Sent for approval. It is used in
   this visit now." The row text is unchanged. The button is disabled for an empty text and shows the server's
   duplicate message when refused.
2. Dropdown choices for a Sprinkler row = system-wide list (unchanged) + approved section remarks for that
   section (every customer) + the existing CR-07 remarks for THIS customer and section only (R-Q9) + Others.
   No pending request is ever offered. Malformed server data fails closed (keep the last good cache only where the
   existing pattern already does so; no silent fallback after a failed authoritative refresh).
3. Technician is told about decisions: copy the location-proposal technician read-back (where the technician
   sees approved / rejected + note). State where you put it.
4. Admin/Manager page "Remark requests" (code roles admin + supervisor; add to supervisorRoutes): pending list
   with service, section label as the technician saw it, wording, technician, customer, visit, date; actions
   Approve, Edit wording and approve, Reject with note; a "Decided" filter; a list of approved section remarks per
   service + section, plus the old per-customer CR-07 ones, each with Deactivate (confirm). Mobile-first, 375 px.
5. Tests: unit tests for the outbox/cache module (offline create, replay, exact UUID, malformed list rejected);
   Playwright: technician offline Others -> Add to common remarks -> reconnect -> request pending; Manager and
   Admin approve with edited wording -> the technician's dropdown at ANOTHER customer offers it in S.A.J Main
   Water Supply only; reject -> technician sees the note, visit text unchanged; technician cannot open the page.

STOP when green. Do NOT commit.
```

---

## P4 — Photo KPI page (Wave 3)

Needs P2 reviewed. Not in parallel with R3 (shared manager routing files).

```
<paste Standing rules>

TASK P4 — New Admin/Manager page "Photo KPI" (P-Q4).

1. API: one read-only endpoint (code roles admin + supervisor; technician 403) returning, for a period, per
   technician: camera count, gallery count, unknown count, gallery % (gallery / (camera + gallery)), and the
   all-technicians total. Sources: staged_inspection_evidence (uploader_user_id, capture_source, status
   accepted), inspection_attachments (uploaded_by_user_id, capture_source, accepted only), repair visit photos
   (uploader_user_id, capture_source; state which statuses count and why). Period = a calendar month in Malaysia
   time (YYYY-MM, strictly validated) or "all". Include hidden/archived technicians only if they have photos in the
   period. NULL source counts as unknown, never camera.
2. Web page (one page, mobile-first):
   - period control: month picker defaulting to this month + "All time";
   - All technicians: total camera / gallery / gallery %, and a chart (bar per technician, camera vs gallery,
     sorted by gallery %) — build with inline SVG like StatusDonut.tsx / InspectionTrend.tsx, no new package;
   - one technician: search/select from the list -> their camera / gallery / gallery % with a donut and their
     month-by-month trend (last 6 months);
   - accessible: charts have text equivalents (table or aria labels), colours not the only signal.
   Add the page to ManagerHome, App routes and supervisorRoutes.
3. Tests: API counting (each source, NULL, period edges at Malaysia midnight, auth); web spec at 375 px and
   desktop (select a technician, switch month, All time).

STOP when green. Do NOT commit.
```

---

## R4 — Roll out to Hose Reel, Hydrant, Fire Alarm, FM200, CO2 (Wave 3)

Needs: R1-R3 phone-tested on Automatic Sprinkler.

```
<paste Standing rules>

TASK R4 — Same one-remark picker and request flow on Hose Reel, Hydrant, Fire Alarm, FM200 and CO2 (R-Q6).
Wet Chemical, Dry/Wet Riser, Smoke Ventilation, Fire Intercom and Roller Shutter stay plain text.

1. Define section keys for these systems in BOTH copies of remarkSections.ts (parity test must pass; repeated
   rows share one key per template slot, as for Sprinkler) and pass customerId / sectionKey / sectionLabel / jobId
   to their RemarksField uses. Their Comments boxes keep today's behaviour (no request flow).
2. Their current "Add to common remarks" (technician adds to the system-wide list instantly) becomes the request
   flow from R3. Make POST /service-common-remarks admin/supervisor-only so a technician can no longer add to the
   system-wide list directly; the Admin "Service common remarks" page keeps working. Remarks technicians already
   added that way stay.
3. Tests: one spec per system (choose / replace / Others / request) and the API role test.

STOP when green. Do NOT commit.
```

---

## Review prompt (separate session, read-only, after each step)

```
Review the uncommitted working tree for step <ID> in docs/photo-and-remarks/PHOTO_AND_REMARKS_PROMPTS.md
against the owner decisions in PHOTO_AND_REMARKS_PROGRESS.md section 4. Modify no file. Read AGENTS.md and the
skills the step lists.
- Confirm every item of the step with file:line; for anything not done, give a concrete failing scenario.
- Check for new defects: offline (typing, local save, camera never blocked; gallery fallback works offline),
  exact UUID confirmation, idempotent replays of items queued before the change, auth on every new route
  (UI Admin = supervisor, UI Manager = admin), fail-closed parsing, migration new and forward-only, Dexie schema
  untouched, historical templates and V6 files untouched, customer PDF and repair PDF unchanged, 375 px layout,
  files edited outside the step's list.
- Re-run the step's tests and the gates verbatim; a command that does not work is a finding.
- Deliver: P0 count, P1 count, P2 list, NEW DEFECTS Y/N, SAFE TO COMMIT Y/N.
```
