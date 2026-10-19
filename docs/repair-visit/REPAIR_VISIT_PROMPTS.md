# Repair Visit + Offline Visit Creation — ready-to-paste prompts

Plan: [REPAIR_VISIT_PLAN.md](REPAIR_VISIT_PLAN.md). Paste one prompt per new chat.
Run the prompts of one wave at the same time; start the next wave only after the reviews pass and
you have committed.

| Wave | Run together | Then review with |
|---|---|---|
| 1 | 1A, 1B | R for 1A (1B: you approve the mock-up yourself) |
| 2 | 2A, 2B, 2C | R for 2A, 2B, 2C |
| 3 | 3A, 3B | R for 3A, 3B |
| 4 | 4A, 4B | R for 4A, 4B |
| 5 | 5A | R for 5A |
| 6 | 6A | — (then your phone test) |

Every prompt below already contains the shared rules; paste it as is.

---

## Shared rules (already included in every prompt by reference)

```
SHARED RULES FOR THIS FEATURE
- Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules, standard gates,
  DoD table). Baseline = the current HEAD when you start; DO-NOT-MODIFY list as in that skill.
- Read docs/repair-visit/REPAIR_VISIT_PLAN.md first. Sections 2.1 and 2.2 are settled decisions;
  do not re-ask them. If something is truly undecided, stop and ask.
- Other chats are working in this folder at the same time. Edit ONLY the files listed under
  "YOU OWN". If a gate fails in a file you do not own, wait a few minutes and re-run; never edit
  it; report it in the DoD table.
- Do not edit package.json, package-lock.json, docker-compose.yml, Caddy, .env, runtime folders,
  V1-V6 templates, migrations 001-052. Run tests by file path, not by adding npm scripts.
- Offline contract: never disable typing, photo capture, draft save or local Submit for lack of
  internet. Client UUIDs from crypto.randomUUID(). Mark Synced only when the server confirms
  that exact UUID. HTTP 200 alone is not success.
- Integration tests only on the disposable Postgres at 127.0.0.1:55432 (cold start as in the
  skill). Never the runtime database.
- No git mutations. Stop before staging. Finish with the DoD table, files changed (one line each),
  P0/P1/P2 counts, cold reproducible test commands, and the verdict line asked for.
```

---

## 1A — Foundation: schema and shared contracts (Wave 1)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: v7-evidence-acceptance, indexeddb-data-model, sync-engine, backend-api-security.

TASK — foundation only, no feature logic
1. Inspect apps/api/src/jobs/serviceVisits.ts (createServiceVisit), apps/web/src/jobs/NewServiceVisit.tsx,
   apps/web/src/referenceData/referenceDataCache.ts, apps/web/src/db/localDatabase.ts (version 10),
   apps/api/migrations/031 (report_number_year_counters) and the old repair code under
   apps/api/src/repairs/ and apps/web/src/repairs/ (patterns to reuse).
2. Decide whether offline service-visit creation (plan Part A) needs a database column. If yes,
   create apps/api/migrations/053_offline_service_visits.sql (additive only). If no, skip 053 and
   write the reason in the report; the repair migration then takes 053.
3. Create the repair visit migration (054, or 053 if step 2 skipped) exactly as plan section 5:
   repair_visits, repair_visit_items, repair_visit_photos, repair_visit_events, RV number sequence,
   MFE/RR year counter. Strict CHECK constraints for status/outcome enums, unique client UUIDs,
   unique photo per item, restrictive deletes. Register it in apps/api/src/db/migrations.ts.
4. Dexie version 11 (additive): the offline-created service visit store, rvVisits, rvItems, rvPhotos,
   rvPreviousVisits, rvBeforePhotos, and the new outbox entityType values. Keep every v10 store,
   index and Blob. Do not remove old repair stores (that is step 5A).
5. Shared contracts with strict validators (no `any`, unknown keys rejected):
   apps/api/src/repairVisits/repairVisitContract.ts and apps/web/src/repairVisits/repairVisitTypes.ts
   (visit, item, field identity = systemKey + unit identity (rowUuid / locationId / zoneId) +
   sectionKey + fieldKey, Before snapshot, outcome done_repair|not_done, statuses, events),
   plus the offline service-visit create request/response contract (client job UUID, configuration
   revision used, device date/time) in apps/api/src/jobs/offlineServiceVisitContract.ts and
   apps/web/src/jobs/offlineServiceVisitTypes.ts. Also the PDF view-model type the renderer (2C)
   will consume: apps/api/src/repairVisits/report/repairVisitReportModel.ts (types only).
6. Create empty registered routers apps/api/src/routes/repairVisitReads.ts and
   apps/api/src/routes/repairVisitWrites.ts (return 404 for now) and register both in
   apps/api/src/server.ts, so later steps never touch server.ts.
7. Update plan section 5 with the final migration numbers.

YOU OWN: the files named above, apps/api/src/db/migrations.ts, apps/api/src/server.ts,
apps/web/src/db/localDatabase.ts, docs/repair-visit/REPAIR_VISIT_PLAN.md (section 5 only),
new test files for this step.

DoD ADDITIONS
- Migration(s) apply cleanly on a cold disposable DB after 001-052; re-run is a no-op.
- Dexie upgrade test: a v10 database with pending inspection, photo and old repair data opens as
  v11 with every record and Blob intact.
- Contract unit tests: valid sample accepted; unknown key, bad enum, bad UUID, bad timestamp rejected.
- Old repair tests still pass (old feature untouched).
Verdict line: READY FOR WAVE 2: Y/N
```

---

## 1B — Repair Visit PDF mock-up (Wave 1, docs only)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.

TASK — a mock-up for the owner to approve; no app code
1. Read docs/report-template/mfe-service-report-template.html, apps/api/src/reports/template/
   (report.css, cover.html, renderReportHtml.ts) and plan section 4.
2. Create docs/repair-visit/repair-visit-report-mockup.html: same letterhead, fonts, colours, A4
   landscape, header/footer and page numbering as the service report. Use invented sample data
   (customer "Sample Customer Sdn Bhd", RV-20261019-3, previous SV-20261011-94) and grey
   placeholder boxes for photos. Pages: cover, Summary of Repair, one Automatic Sprinkler page
   (2 fields: one DONE REPAIR, one with "No photo recorded at previous visit"), one Fire Alarm page
   (one NOT DONE field whose previous visit was a repair visit), and one field with no previous
   visit (After photo alone, full width).
3. Render it to docs/repair-visit/repair-visit-report-mockup.pdf with the existing headless
   Chromium approach (as in docs/report-template/), and check every page visually.

YOU OWN: docs/repair-visit/repair-visit-report-mockup.html, .pdf, and any helper script you put in
your scratch folder (not in the repo).

DoD ADDITIONS
- PDF opens; every page inspected; no text overflow; photo pairs side by side.
- List any place where you had to choose something the plan does not say.
Verdict line: MOCK-UP READY FOR OWNER REVIEW: Y/N
```

---

## 2A — Offline visit creation: server (Wave 2)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: backend-api-security, sync-engine, offline-first-pwa.

TASK
1. Extend service-visit creation (apps/api/src/jobs/serviceVisits.ts and its route) so the phone may
   send a client-generated job UUID, the configuration revision it used, and its device date/time,
   using the 1A contract. Existing online requests keep working byte-for-byte as today (A7).
2. Idempotent on (creator, client job UUID): an exact retry returns the same job; the same UUID with
   different content is a conflict. Reuse the creation_request_id pattern.
3. Server still gives the SV-YYYYMMDD-NN number (using the visit date) and builds the snapshot itself.
   If the configuration revision, site or systems no longer match what the phone used, refuse with
   an explicit machine-readable code (e.g. CONFIGURATION_CHANGED, SITE_INACTIVE) — never silently
   adapt. Reject device dates more than 1 day in the future or older than 30 days with a clear code.
4. Form-instance and photo sync for a job that does not exist yet must be refused with an explicit
   "visit not yet created" code (not a generic error) so the phone can retry later.
5. Integration tests for all of the above plus: unauthenticated / other technician refused; customer
   inactive; concurrent duplicate creates produce one job.

YOU OWN: apps/api/src/jobs/serviceVisits.ts, its route file, apps/api/src/jobs/offlineServiceVisit*.ts
(new), the sync files that need the "visit not yet created" code (name them in the report), and new
test files.

DoD ADDITIONS
- Old online creation tests unchanged and passing.
- All new codes listed in the report with the exact response shape (3B depends on it).
Verdict line: READY FOR 3B: Y/N
```

---

## 2B — Repair field catalog and previous-visit list (Wave 2)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: v7-evidence-acceptance, repeatable-row-model, backend-api-security.

TASK — read side only
1. Field catalog reader, apps/api/src/repairVisits/fieldCatalog.ts: for one approved V7 service
   visit, list every Good / Not Good / N.A. result field of all 11 V7 systems as
   System -> Unit/Location -> Section -> Field, with result, remark and photo reference. Reuse and
   generalise apps/api/src/repairs/findingReaders.ts (it already reads accepted V7 fields, but only
   Not Good). Unit identity = rowUuid / location / zone, never list position. Exclude readings,
   quantities and Portable Fire Extinguisher quantity controls. Not Good fields first.
2. Same reader for an approved repair visit as the previous visit: only its items, Not Done first,
   Before = that visit's After photo/result/remark.
3. "No previous visit" catalog: fields from the customer's current configuration and saved layouts
   for that site.
4. GET endpoints in apps/api/src/routes/repairVisitReads.ts: previous-visit list (same customer +
   site, approved, created by the caller, service or repair visits, newest first); catalog for a
   chosen previous visit; catalog for no previous visit; authorised Before photo download.
   Technician sees only their own visits; Admin/Manager may read for review.
5. Tests: every one of the 11 systems with repeated units; Not Good ordering; Good with/without
   optional photo; historical/V1-V6 visits not offered; foreign technician refused.

YOU OWN: apps/api/src/repairVisits/fieldCatalog*.ts, apps/api/src/repairVisits/previousVisits*.ts,
apps/api/src/routes/repairVisitReads.ts, new test files. Do not edit apps/api/src/repairs/ (copy
what you need).

DoD ADDITIONS
- Per-system test table in the report (11 rows).
Verdict line: READY FOR 3A: Y/N
```

---

## 2C — Repair Visit PDF renderer (Wave 2, only after the owner approves the 1B mock-up)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: v7-evidence-acceptance (PDF authority section).

TASK
1. apps/api/src/repairVisits/report/renderRepairVisitReport.ts: a pure function from the 1A view
   model (repairVisitReportModel.ts) to HTML matching the APPROVED mock-up
   docs/repair-visit/repair-visit-report-mockup.html. Reuse the service report CSS, company profile,
   logo, fonts and apps/api/src/reports/pdf/htmlToPdf.ts. Do not change any service-report file.
2. Cover all variants: previous service visit, previous repair visit, no previous visit, "No photo
   recorded at previous visit", long remarks over a page break, PREVIEW watermark ("PREVIEW — NOT
   APPROVED") vs final with report number. Escape every dynamic text.
3. Fixture tests that render to PDF with Chromium; inspect the pages and save sample output under
   logs/ (not committed).

YOU OWN: apps/api/src/repairVisits/report/ (except repairVisitReportModel.ts, which you may extend
only by adding fields), new test files.

DoD ADDITIONS
- Service report snapshot test unchanged (apps/api/src/reports/template/sample.snapshot.html).
- Pages visually checked against the mock-up; differences listed.
Verdict line: READY FOR 3A: Y/N
```

---

## 3A — Repair Visit write API (Wave 3)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: v7-evidence-acceptance, sync-engine, backend-api-security.

TASK — in apps/api/src/repairVisits/ and apps/api/src/routes/repairVisitWrites.ts
1. Create repair visit with a client UUID (works for phones that created it offline, same rules as
   2A: idempotent, explicit refusal codes, device date window). Server gives RV-YYYYMMDD-NN.
   Customer must exist (no new customer / typed site).
2. Validate the previous visit (same customer + site, approved, owned by the caller) and every item
   against the 2B catalog. Read the Before snapshot from server records and freeze it at Submit (A9).
3. After photo staging per item (one photo, required), evidence first, hash checks; reuse the V7
   staging pattern and the old staged_repair_evidence logic as a reference.
4. Submit: atomic (visit + items + bound photos), every item needs outcome + remark + photo,
   at least one item. Exact UUID/fingerprint receipts; identical retry returns the same receipt.
5. Return to technician (Admin/Manager, reason required) -> status returned, editable; technician
   edits (outcome, remark, photo, add/remove items) and resubmits with the next revision. Stale
   revision refused. Append every step to repair_visit_events.
6. Approve (Admin/Manager): allocate MFE/RR/YYYY/NNNN once, lock the visit, render the final PDF via
   2C. Preview PDF before approval. Delete only while unstarted.
7. Repair-photo files must be protected from the existing orphan-file cleanup
   (apps/api/src/attachments/attachmentStorage.ts — add only the classification needed).
8. Integration tests: idempotency, races (double submit, approve vs return, approve vs resubmit),
   rollback when a photo is missing, foreign technician refused, previous visit and its PDF
   unchanged after approval, report number given once.

YOU OWN: apps/api/src/repairVisits/ (except report/ and fieldCatalog*/previousVisits* — call them,
do not edit), apps/api/src/routes/repairVisitWrites.ts, the minimal part of attachmentStorage.ts,
new test files.

DoD ADDITIONS (Level 2): idempotency, stale callers, concurrency, rollback, auth, exact UUID confirmation.
Verdict line: READY FOR 4A/4B: Y/N
```

---

## 3B — Offline visit creation: phone (Wave 3)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: offline-first-pwa, indexeddb-data-model, sync-engine, mobile-first-ui.

TASK
1. apps/web/src/jobs/NewServiceVisit.tsx: when offline (or the server is unreachable), create the
   visit locally from cached customers/sites/configuration (Dexie v11 store from 1A), with a
   crypto.randomUUID() job ID, phone date/time, and the configuration revision used. Online
   behaviour unchanged. Add New Customer and typed new site stay online-only with a clear message.
2. The local visit opens straight away and every form works offline exactly as for a server-created
   visit (build the same local job shape the forms already use).
3. Sync: send the create operation first; form and photo operations of that visit wait until the
   server confirms the same UUID; then replace the placeholder with the real SV number. Survive
   reload, force-close and partial failure.
4. Refusal codes from 2A -> visit card shows "Needs attention" with the reason; all local data kept;
   retry after the cause is fixed.
5. Job card text: "SV number given when synced". Delete an unsynced, unstarted local visit locally.
6. Browser tests (360 / 768 / 1280): offline create -> fill -> submit -> reload -> reconnect -> sync
   with exact UUID; refusal -> Needs attention; online creation unchanged.

YOU OWN: apps/web/src/jobs/ (NewServiceVisit.tsx, ServiceJobCard.tsx, TechnicianHome.tsx, jobApi.ts,
new offline* files), apps/web/src/sync/syncEngine.ts (ordering only), new test files.
Do not edit apps/web/src/db/localDatabase.ts (1A already added the store) or App.tsx.

DoD ADDITIONS (Level 2): stale callers, interrupted sync, exact UUID confirmation, no data loss.
Verdict line: READY FOR 4A: Y/N
```

---

## 4A — Technician Repair List and repair form (Wave 4)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: offline-first-pwa, indexeddb-data-model, sync-engine, mobile-first-ui; and
.claude/skills/web-design-guidelines, .claude/skills/vercel-react-best-practices.

TASK — new code in apps/web/src/repairVisits/
1. Repair List page: + New Repair Visit, tabs In Progress | Completed, cards as plan section 3.
2. New Repair Visit page: Customer -> Site -> Previous visit (default None) -> Service Call No ->
   field picker (System -> Unit -> Section -> Field, Not Good / Not Done badge and first, at least
   one) -> Create. Works offline using the 3B offline-creation pattern and cached field lists.
3. Repair form: Before panel (or "No photo recorded at previous visit" / "No previous visit"),
   After panel (Done Repair / Not Done, required remark, required photo with the CR-08 stamp),
   auto-save, Submit when complete, Returned banner with Admin's reason and direct edit, Delete
   while unstarted.
4. Local repositories + sync for the new outbox types (photos first, then the visit), exact UUID
   receipts, recovery after force-close. Download for offline per customer (field lists + Before
   photos, plan A8).
5. Add a NEW route #/repair-visits in App.tsx and point the Technician "Repair List" menu entry
   (AppShell.tsx) at it. Leave the old #/repair-list routes in place (5A removes them).
6. Browser tests at 360 / 768 / 1280: offline create with previous service visit, with previous
   repair visit, with none; submit offline; reload; reconnect; returned -> edit -> resubmit.

YOU OWN: apps/web/src/repairVisits/ (except repairVisitTypes.ts: add only), App.tsx (new route only),
AppShell.tsx (menu target only), syncEngine.ts (dispatch of the new types only), apps/web/src/styles/
(new repair-visit section only), new test files. Do not edit apps/web/src/manager/.

DoD ADDITIONS (Level 2) + no horizontal scroll, 44 px targets, labelled inputs, focus visible.
Verdict line: READY FOR 5A: Y/N
```

---

## 4B — Admin/Manager repair review (Wave 4)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: backend-api-security, mobile-first-ui; and .claude/skills/web-design-guidelines.

TASK — components only, under apps/web/src/manager/repairVisits/
1. Repair visit review screen: header (customer, site, RV no., technician, date, previous visit),
   per-field Before / After, Approve, Return to technician (reason required), Preview PDF before
   approval, final PDF download after. Online only; a failed refresh shows failure, never stale data
   as current.
2. "Repair" entries for ManagerServicesDone's customer view and for the awaiting-approval list:
   export small components/hooks that 5A will plug in. Do NOT edit ManagerServicesDone.tsx,
   ManagerHome.tsx, App.tsx or AppShell.tsx; instead list in the report the exact lines 5A must add.
3. Browser tests with mocked API at 360 / 768 / 1280: approve; return with reason; reason missing ->
   error; preview vs final PDF; refresh failure shown.

YOU OWN: apps/web/src/manager/repairVisits/ (new, including its own CSS file imported by your
components — do not edit apps/web/src/styles/), apps/web/src/manager/repairVisitsApi.ts (new),
new test files.

DoD ADDITIONS: no access for Technician role; focus moves to errors; no page overflow.
Verdict line: READY FOR 5A: Y/N
```

---

## 5A — Switch-over and removal of the old Repair List (Wave 5)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: indexeddb-data-model, sync-engine, backend-api-security.

TASK
1. Wire 4B: Admin/Manager menu entry (replace "Repair Review" in ManagerHome.tsx), routes in App.tsx,
   Repair rows in ManagerServicesDone and the awaiting-approval list, using the lines 4B listed.
2. Header sync summary: replace useRepairSyncStatuses with the new repair visit statuses.
3. Remove the old Repair List completely: apps/web/src/repairs/, apps/api/src/repairs/,
   apps/api/src/routes/repairs.ts and its server.ts registration, old #/repair-list and
   #/manager-repairs routes, old outbox types, old tests (apps/web/tests/repair-*.spec.ts,
   repair*.test.ts, header-repair-sync-summary.*) and the old repair photo files on disk
   (safely, through the storage reconciliation path).
4. Dexie version 12: delete the old repair stores and drop leftover old repair outbox items.
   Every other store and Blob kept.
5. Next migration (055 or as renumbered in plan section 5): drop the old repair tables listed in plan
   section 5. Migrations 051/052 themselves stay in the folder (never edit applied migrations).
6. Keep CR-09 Phase A (Complete Repair hidden). Mark docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md as
   superseded by docs/repair-visit/REPAIR_VISIT_PLAN.md (one line at the top).
7. grep proves no reference to the old repair modules remains.

YOU OWN: everything named above, including App.tsx, AppShell.tsx, ManagerHome.tsx,
ManagerServicesDone.tsx, server.ts, localDatabase.ts, migrations.ts. Nobody else runs in this wave.

DoD ADDITIONS
- Dexie v11 -> v12 upgrade test: pending service visits, repair visits and photos intact; old
  repair stores gone.
- Migration on a cold disposable DB with old repair test rows present -> tables dropped, nothing else
  touched.
- Full standard gates.
Verdict line: READY FOR 6A: Y/N
```

---

## 6A — Final integration check (Wave 6)

```
Follow the SHARED RULES in docs/repair-visit/REPAIR_VISIT_PROMPTS.md.
Read skills: pwa-release-testing, offline-first-pwa.

TASK — verify; fix nothing larger than a typo without asking
1. Run every standard gate plus all tests added in steps 1A-5A from cold. A SKIP is not a PASS.
2. End-to-end in the browser pane against a local dev stack with disposable data: offline service
   visit create -> fill -> submit -> reconnect -> SV number; offline repair visit with a previous
   service visit -> Done Repair + Not Done -> sync -> Admin returns -> technician edits ->
   resubmits -> Admin approves -> download PDF and compare with the approved mock-up; new repair
   visit using that repair visit as previous (Not Done first, its After photo as Before).
3. Write docs/repair-visit/PHONE_TEST_CHECKLIST.md: the Level 3 steps the owner will do on the phone
   (airplane mode create, force-close, reopen, reconnect, approve, PDF on phone), with expected
   results.
4. Report P0/P1/P2 and anything not proven.

YOU OWN: docs/repair-visit/PHONE_TEST_CHECKLIST.md, a short results section at the end of
REPAIR_VISIT_PLAN.md.

Verdict line: READY FOR OWNER PHONE TEST: Y/N
```

---

## R — Review prompt (one fresh chat per implementation step; fill in the step)

```
Follow the "Sol review brief" in .agents/skills/codex-task-brief/SKILL.md and the SHARED RULES in
docs/repair-visit/REPAIR_VISIT_PROMPTS.md. Modify no file.

Review step <STEP ID, e.g. 2B> of docs/repair-visit/REPAIR_VISIT_PLAN.md in the uncommitted working
tree. Other chats of the same wave may have uncommitted files too: review only the files listed
under "YOU OWN" for <STEP ID> in REPAIR_VISIT_PROMPTS.md, plus anything else that step changed.

Check:
1. Every TASK point and DoD ADDITION of <STEP ID> is really done (file:line evidence).
2. Plan decisions 2.1 and 2.2 are respected (especially offline contract, server authority A9,
   own-visits-only, approved-only previous visits, photo + remark required).
3. New defects: auth, SQL built by string, idempotency, races, stale data shown as current,
   data loss on the phone, files edited outside "YOU OWN".
4. Re-run the step's gates from cold; a command that does not work verbatim is a finding.

Deliver: P0 count, P1 count, NEW DEFECTS: Y/N (list with file:line and a failing scenario),
HISTORICAL IMMUTABILITY INTACT: Y/N, SAFE TO COMMIT: Y/N.
```
