# Client change requests — October 2026

> **Living document.** Recorded 2026-10-10 from the client's list. Fix **one item at a time**, referring to the ID
> (`CR-nn`). Tick the box and fill in the *Result* line when an item is done. **Section 0 is the current status.**
>
> "Today" notes below come from a read-only look at the code on 2026-10-10 (branch `phase-8e-client-demo-polish`).
> Treat them as pointers, not a finished design — re-inspect before changing code (see `AGENTS.md` workflow).

## 0. STATUS BOARD (updated 2026-10-10 evening) — read this first

**Branch** `phase-8e-client-demo-polish`. Commits so far (newest first): `d0c371a` CR-09 Phase A · `194550b` + `11570ea` CR-06 ·
`ce5a5db` CR-08 · `101aa51` CR-03/04 · `d422ab4` CR-11 · `2874caa` CR-05.

| ID | Request | Status | Commit(s) | Phone test | What is next |
|---|---|---|---|---|---|
| CR-11 | Supervisor → Admin | **Done, committed** | `d422ab4` | not yet | Owner decision on the 5 screens where both review roles read "Admin" (later) |
| CR-05 | Remaining Inspections compact | **Done, committed** | `2874caa` | not yet | — |
| CR-03/04 | Remove Departure; Arrival automatic | **Done, committed** | `101aa51` | not yet | Report-cover label / PDF check → see [FINAL_CHECKS](CLIENT_CHANGE_REQUESTS_FINAL_CHECKS.md) §A |
| CR-06 | Form jumps to top | **Done, committed** (scroll restored after a network hand-over) | `11570ea`, `194550b` | **verified on phone** | Optional "option B" (keep the form mounted while re-verifying, Level 2) — **not needed now**; only if the client still complains about the keyboard closing |
| CR-08 | Photo date/time stamp | **Done, committed** | `ce5a5db` | not yet | Phone retest steps in `docs/testing/CR08_PHOTO_WATERMARK.md` |
| CR-09 | Remove Repair + Repair List | **Phase A done, committed** (Complete Repair hidden, recoverable). Phases B/C/D **planned, not built** | `d0c371a` (A) | — | Needs plan answers (§0.2) then 3 build phases. Migration **051** |
| CR-07 | Per-section free-text remarks | **Planned, not built** — plan approved | — | — | **NEXT TO BUILD**: Phase 1 (Automatic Sprinkler pilot). Migration **049** |
| CR-02 | Manual site + Admin approval | **Planned, not built** — defaults D1–D7 accepted | — | — | After CR-07. Migration **050**. Commit the I-47 batch first (same file) |
| CR-01 | Optional photo on Good | **Planned, not built** — plan approved | — | — | After CR-02. No migration. Server contract first |
| CR-10 | Repair-only PDF | **Not planned yet** | — | — | After CR-09 Phase C. Plan-only prompt ready |

### 0.1 Order from here
1. **CR-07 Phase 1** (migration 049) → 2. **CR-02** (050) → 3. **CR-01** (server contract, then pilot CO2/Wet Chemical, then the rest) →
4. **CR-09 B → C** (051) → 5. **CR-10** → 6. second-pass checks ([FINAL_CHECKS](CLIENT_CHANGE_REQUESTS_FINAL_CHECKS.md)).
**Migration numbers must be exactly 049 / 050 / 051 in that order** (three plans each proposed "049"; latest existing is 048).

### 0.2 Decisions taken (defaults accepted unless you change them)
- **CR-07:** one remark list per slot (drum/detector/device rows share it); the technician's global "Add to common remarks" is replaced by the
  section version; confirm before saving; Comments box counts as a section; the 6 systems without a picker are NOT in scope unless the client asks.
- **CR-02:** D1–D7 as in the plan (Admin + supervisor can approve; same pending name attaches; rejection note shown to the technician;
  report approval not blocked in v1; no name edit on approve; own pending sites not listed; "Add New Customer" unchanged).
- **CR-01:** Good only gets the optional photo; a Poor→Good photo is kept with a Remove button; optional photos appear in the client PDF; accept the
  rollback caveat (deploy server first); Portable Fire Extinguisher out; raise the 250 manifest cap; fix the Dry/Wet Riser final-report bug (P0-FR1) first if still open.
- **CR-09 B/C/D (to confirm before building B):** After photo required (one); one repair per finding; only the job's technician repairs, Admin read-only;
  Repair List only (normal Final Report unchanged); a repair is independent of any visit. Technicians **cannot record repairs between Phase A and Phase C** —
  hold Phase A out of the client release until Phase C ships.

### 0.3 Not CR work, still uncommitted in the tree (the older phone-fix batch — yours to commit)
I-34/I-37/I-41/I-44/I-47/I-48 etc.: `app.css`, Roller Shutter form/setup prompt, `NewServiceVisit.tsx` (site hint), `referenceDataApi.ts` (incl. the one CR-11 "Tell your Admin" string),
`AppShell.tsx`, `App.tsx`, `attachmentStorage.ts` (+ reconciliation test), `proxy.js` / phone-testing files, `PHONE_TESTING_STATUS.md`, matching specs.

---

## 1. Summary table

| ID | Request (short) | Area | Size | Protected scope? | Blocked by a question? |
|---|---|---|---|---|---|
| CR-01 | Optional photo when result is Good | All inspection forms + evidence contract | L | **Likely** (evidence contract / possibly template version) | Q1 |
| CR-02 | Manual-typed site → saved after first visit → Admin approval | New Service Visit | M–L | Possible (approval state) | Q2 |
| CR-03 | Remove Departure | New Service Visit + report | S–M | Possible (stored field) | Q3 |
| CR-04 | Remove manual Arrival (auto-capture instead) | New Service Visit + report | S–M | Possible | Q3 |
| CR-05 | Shrink / remove the "Remaining Inspections" block | Technician job screen | S | No | Q4 |
| CR-06 | Choosing a form option (e.g. Not Good) jumps the page to top | Inspection forms | M (needs repro) | No | Q5 |
| CR-07 | Technician adds a free-text remark **per section** | Inspection forms | M–L | Likely (new stored data) | Q6 |
| CR-08 | Date + time watermark on photos | Photo capture | M | No (but changes photo bytes/hash) | Q7 |
| CR-09 | Remove Repair; new **Repair List** form in nav; before/after | New feature | XL | **Yes** (Dexie + Postgres) | Q8 |
| CR-10 | Repair-only PDF section | Reports | L | Depends on CR-09 | — |
| CR-11 | "Supervisor" → "Admin" (name only) | UI labels | S–M | No (labels only) | No (Q9 closed) |

Size: S = small, M = medium, L = large, XL = a project of its own.

---

## 2. Suggested order

1. **Quick wins (no data changes):** CR-11, CR-05, CR-03/CR-04 (UI side only).
2. **Bug:** CR-06 — reproduce on the phone first.
3. **Photo:** CR-08 (self-contained), then CR-01 (touches the evidence contract — plan carefully).
4. **Remarks / site flow:** CR-07, CR-02.
5. **Repair project:** CR-09 → CR-10 last (CR-10 depends on CR-09's data).

---

## 3. Items

### CR-01 — Good → optional photo upload
- [ ] Done — Result: _
- **Client wording:** "Good -> Optional Upload Photo."
- **Tidied requirement:** When a checklist item is set to **Good**, let the technician *optionally* attach a photo.
  A photo stays optional (never blocks Submit). Existing rules for Poor / Not Good (remark + photo) do not change.
- **Today:** Good takes no photo. Photo rules live in the per-system evidence files
  (`apps/web/src/<system>/<system>V7Evidence.ts`, 15+ files) and the server contract
  (`apps/api/src/inspections/evidence/v7EvidenceContracts.ts`). The server validates strictly and rejects unknown keys.
- **Risks / notes:**
  - Server must accept (not reject) a photo on a Good field, for **every** system — otherwise sync fails.
  - Historic templates (V1–V7) must stay immutable; this may need a forward-only template/contract change — check
    `.agents/skills/v7-evidence-acceptance/SKILL.md` before planning.
  - Photo upload ordering (evidence-first sync) and photo retention must still work for the extra photos.
- **Open question → Q1.**

### CR-02 — New Service Visit: manually keyed site, save after first visit, Admin approval
- [ ] Done — Result: _
- **Client wording:** "New Service Visit, Manual Key in Select Site. Need Save after first visit. Supervisor approval."
- **Tidied requirement (my reading — confirm Q2):** On New Service Visit the technician can type a site that is not in the
  list. After the first visit the site is **saved** for that customer so it appears in the Site list next time, but only
  once an **Admin** (currently "Supervisor") has approved it.
- **Today:** Site is a `<select>` of existing sites (`apps/web/src/jobs/NewServiceVisit.tsx`, `service-site`).
  "Add New Customer" creates customer + first site directly (online). Technicians can already *propose a new location*
  that a Supervisor/Admin reviews (`TechnicianLocationProposal.tsx`, `technicianLocationProposalDraft.ts`,
  migration `048_customer_location_proposals.sql`) — a possible pattern to reuse for sites.
- **Risks / notes:** Needs an "unapproved site" state; offline behaviour (visit created offline with a pending site)
  must respect the Offline Contract; approval UI must exist for the Admin.
- **Open question → Q2.**

### CR-03 — Departure (remove)
- [x] Done — Result: commit 101aa51 (with CR-04); report cover label + PDF check tracked in CLIENT_CHANGE_REQUESTS_FINAL_CHECKS.md
- **Client wording:** "Departure (Remove)"
- **Tidied requirement:** Remove the Departure time field from New Service Visit.
- **Today:** `NewServiceVisit.tsx:63,182`. `departureTime` also appears in
  `apps/api/src/jobs/serviceVisits.ts`, `routes/inspectionJobs.ts`, `reports/finalServiceReport.ts`
  (and migration `030_service_visit_cover_fields.sql`).
- **Risks / notes:** Decide whether the report header still shows Departure (blank / hidden). Keep the DB column
  (no migration just to simplify) — stop collecting it instead.
- **Open question → Q3.**

### CR-04 — Arrival (not necessary if there is an automatic one)
- [x] Done — Result: commit 101aa51; arrival = device clock at first Create tap
- **Client wording:** "Arrival (not neccessary, if got auto one)"
- **Tidied requirement:** Remove the manual Arrival field; record arrival time automatically instead.
- **Today:** `NewServiceVisit.tsx:62,181` (manual `type="time"` input). Same API/report files as CR-03.
- **Risks / notes:** "Auto" needs a defined moment (visit creation? first form opened?). Time must be in Malaysia time
  in the report (`formatMalaysiaDateTime` exists). Must work when created offline.
- **Open question → Q3.**

### CR-05 — "Requirement Inspections" (Remaining Inspections block)
- [x] Done — Result: commit 2874caa, 2026-10-10 (collapsed disclosure; phone test pending)
- **Client wording:** "Requirements Inspections"
- **Clarified by owner (2026-10-10):** This is the section on each service visit, above the services forms, that lists
  which services are **not done yet**. It takes too much space. Remove it, or turn it into a dropdown / table / other
  compact form.
- **Today:** "Remaining Inspections" section in `apps/web/src/jobs/TechnicianHome.tsx` (~line 391–405): one card
  per incomplete unit (system name, unit label, reason). Styles `.remaining-inspections`, `.completion-requirement`
  in `apps/web/src/styles/app.css:~1026`.
- **Options:** (a) remove; (b) collapsed `<details>` showing only "N of M complete", expands to the list;
  (c) compact one-line-per-item table. **Recommended: (b)** — keeps the "what's left" information, costs one line.
  Note the server also uses this data to gate **Complete Service**, so only the display changes.
- **Open question → Q4.**

### CR-06 — Form selection (e.g. Not Good) sometimes jumps to the top
- [x] Done — Result: commits `11570ea` + `194550b`, verified on the phone 2026-10-10. Cause = network hand-over re-verifies the session and hides the form by design; form now returns at the same scroll position. See `docs/testing/CR06_FORM_SCROLL_JUMP.md` (incl. owner option B).
- **Client wording:** "Click Form selection (Not Good, sometimes will jump to the top of the )" — sentence cut off in the
  original; read as "…jump to the top of the page/form".
- **Tidied requirement:** Tapping a result option (Good / Not Good / …) must not change the scroll position.
- **Today:** Root cause **unknown**. Forms scroll programmatically only after a failed Submit
  (`scrollIntoView` in `AutomaticSprinklerInspectionForm.tsx:276`, `HoseReelInspectionForm.tsx:242`,
  `Co2InspectionForm.tsx:131`), so the jump is probably something else (a re-render/remount, autosave state change,
  or content above the form changing height).
- **Next step:** Reproduce on the phone, note **which system/form** and what was tapped, then investigate.
- **Open question → Q5.**

### CR-07 — Technician adds a new remark, per section
- [ ] Done — Result: _ (plan approved; build = Phase 1 Automatic Sprinkler pilot, migration 049)
- **Client wording:** "Remark. Add new remark, particully on this side/form."
- **Clarified by owner (2026-10-10):** The technician can add a **free-text remark inside each inspection form,
  tied to the section it was added in**. Example: Automatic Sprinkler System → *S.A.J Main Water Supply*: a new
  remark added there appears **only** in the remark choices of *S.A.J Main Water Supply*, not in other parts of
  that system.
- **Today:** Common remarks come from the client's catalog (`docs/client-format-request/service-remarks-catalog.md`,
  from `REMARK.pdf`) as a picker per system.
- **Risks / notes:**
  - Where is a new remark stored — this device only, per customer, or shared with all technicians? (Q6)
  - Needs a stable key per section so remarks attach to the right section; new stored data is likely **protected
    scope** (Dexie and/or Postgres) — confirm before building.
  - Offline: must be creatable offline and survive refresh/restart (Offline Contract).
- **Open question → Q6.**

### CR-08 — Take Photo: watermark with date and time
- [x] Done — Result: commit ce5a5db; phone retest pending
- **Client wording:** "Take Photo (Watermark, Date and Time)"
- **Tidied requirement:** Photos taken in the app carry a visible date and time stamp.
- **Today:** All photos pass through `processInspectionPhoto()` in `apps/web/src/attachments/imageProcessing.ts`
  (canvas → JPEG compress → SHA-256). Camera UI in `CameraCaptureDialog.tsx`. That function is the natural place to
  draw the stamp.
- **Risks / notes:** Burned-in stamp changes the stored bytes/hash (fine for new photos; existing photos unchanged).
  Use Malaysia time. Stamp must stay readable after the 2 MB compression. Gallery-picked photos: stamp with
  *now*, or with the photo's own date? (Q7)
- **Open question → Q7.**

### CR-09 — Remove Repair; add Repair List form (before / after)
- [x] Phase A done — Result: Phase A only: commit d0c371a. Phases B/C/D still to build
- **Client wording:** "Repair feature can remove. Add new form from the navigation bar section. (Repair List, Only repair
  the particular part). Before and After comparison."
- **Tidied requirement:**
  1. Remove the **Complete Repair** result from the inspection forms.
  2. Add a new **Repair List** form reachable from the navigation bar.
  3. The Repair List covers **only the particular failed part(s)** (items that were Not Good / Poor), not a full re-inspection.
  4. Each repaired part shows a **Before vs After** comparison (the original finding/photo vs the repair photo).
- **Owner decision (2026-10-10):** Remove "Complete Repair" from all forms, **but keep the code recoverable** —
  comment it out (searchable marker such as `// REPAIR-DISABLED`) instead of deleting, so it can be restored cheaply.
- **Today:** `complete_repair` appears in ~50 web files and 12 API files (e.g. `v7EvidenceContracts.ts`,
  `masterServiceReportV7.ts`, `*DefinitionControls.ts`, `reports/finalServiceReport.ts`, `inspectionCorrections.ts`).
  Nav is `apps/web/src/layout/AppShell.tsx` (`app-sidebar`).
- **Risks / notes:**
  - **Old accepted records may already contain `complete_repair`.** Read-only/accepted/PDF views must still render
    them; only *new entry* should disappear. Do not break historic template immutability.
  - The server must stop (or keep tolerating) accepting `complete_repair` — decide and test explicitly.
  - Repair List is a new record type: Dexie store + Postgres tables + sync + attachments → **protected scope**,
    needs its own plan/brief (`.agents/skills/codex-task-brief/SKILL.md`). Split into phases:
    (a) disable Complete Repair safely, (b) Repair List data + sync, (c) Repair List UI + before/after, (d) CR-10.
- **Open question → Q8.**

### CR-10 — Repair form PDF (repair section only)
- [ ] Done — Result: _
- **Client wording:** "Repair Form (PDF Section, only put the repair section)"
- **Tidied requirement:** A PDF that contains **only** the repair section (the Repair List with before/after), not the
  whole service report.
- **Today:** Report PDF generated from `apps/api/src/reports/` using the approved HTML template
  (`docs/report-template/`). Depends on CR-09 data existing.
- **Risks / notes:** Is it a separate PDF, or a section of the normal report that can be exported on its own? (Q8)

### CR-11 — Supervisor → Admin (name only)
- [x] Done — Result: commit d422ab4, 2026-10-10 (wording only; one string in referenceDataApi.ts left for the I-44 batch)
- **Client wording:** "Supervisor change to Admin (Just the name)"
- **Tidied requirement:** Everywhere the user sees the word **Supervisor**, show **Admin**. Name only — no behaviour,
  permission, or database change.
- **Today:** ~117 occurrences in ~47 files. User-visible ones include the role card in
  `manager/RoleSelection.tsx`, login heading in `auth/LoginForm.tsx`, `App.tsx` role messages,
  "Reviewed by Supervisor" / "Supervisor approval is pending" in `corrections/AcceptedCorrectionsPanel.tsx` and
  `jobs/FinalReportPresentation.tsx`, manager screens (`ManagerTechnicians.tsx`, `ManagerHome.tsx`, …), PDF/report text,
  and many Playwright specs that look for the text.
- **Owner decision (2026-10-10):** wording change only. The existing **`admin`** role keeps signing in through the
  **Manager** card; the review-only **`supervisor`** role is simply shown as "Admin". Where this makes two roles look
  alike on one screen, list the places and decide later (Q9 closed).
- **Risks / notes:** Change labels only; keep internal role values (`supervisor`, `admin`) and the DB untouched.
  Update the tests that assert the old text. Also relevant to CR-02 ("Supervisor approval" → "Admin approval").
- **Open question → Q9.**

---

## 4. Questions to settle before building

| # | For | Question | My suggested default |
|---|---|---|---|
| Q1 | CR-01 | Optional photo on Good: one photo per item or several? Same limits as Poor photos? Applies to **all** systems? | One photo per item, all systems, same limits |
| Q2 | CR-02 | Does "manual key in site" mean a free-text site for an existing customer? Can the visit proceed before approval? Who approves — Admin only? | Visit can proceed; site is pending until Admin approves |
| Q3 | CR-03/04 | Should Arrival/Departure disappear from the **report/PDF header** too? "Auto" arrival = when the visit is created, or when the technician opens the first form? | Remove both from the form; auto-arrival = visit creation time; hide Departure in report |
| Q4 | CR-05 | Remove completely, or collapse (recommended)? | Collapsible "N of M complete" |
| Q5 | CR-06 | Which system(s)/form(s), which phone/browser, and does it happen after tapping Not Good specifically (remark/photo box appears)? | Reproduce with the technician on the phone first |
| Q6 | CR-07 | Is a new remark private to that technician/device, shared per customer, or shared for everyone? Can it be edited/deleted later? | Shared per customer + section, add-only for now |
| Q7 | CR-08 | Watermark text format (e.g. `10 Oct 2026 14:32`)? Add site/technician name? Stamp gallery photos too? | Date + time only, Malaysia time, camera **and** gallery |
| Q8 | CR-09/10 | Repair List opened from where (new nav item for technician only?). Is the repair photo "after" required? Repair PDF: separate file or exportable section? | Technician nav item; "after" photo required; separate PDF |
| Q9 | CR-11 | ~~Existing Admin (Manager card) vs Supervisor~~ **Closed 2026-10-10:** label-only rename; Admin still signs in via the Manager card. | — |

---

## 5. Process for each fix

Follow `AGENTS.md` / `.agents/skills/codex-task-brief/SKILL.md`: inspect → read applicable skills → smallest change →
focused regression test → typecheck/tests → `git diff --check` → report → **stop before staging** (the owner does Git).
Log phone-test findings in `docs/testing/PHONE_TESTING_STATUS.md` as before.
