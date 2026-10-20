# Photo source (KPI) and Remark picker: findings, plan and progress

Opened: 2026-10-20 · Branch: `phase-8e-client-demo-polish` (clean at `4285448`) · Prompts: [PHOTO_AND_REMARKS_PROMPTS.md](PHOTO_AND_REMARKS_PROMPTS.md)

Status: **P1, R1 and R2 implemented and automated gates green (2026-10-20); ready for focused review. Other tracks retain their individual statuses below.**

Role names (CR-11): the UI's **Manager** = code role `admin`; the UI's **Admin** = code role `supervisor`.
"Admin/Manager" below therefore means code roles `admin` + `supervisor`.

| Step | What | Status |
|---|---|---|
| 0 | Investigation + findings (this file) | Done 2026-10-20 |
| 0 | Owner decisions P-Q1..P-Q7, R-Q1..R-Q9 | **Answered 2026-10-20** (all confirmed) |
| P1 | Camera-first photo controls; gallery only after the camera fails; "Uploaded from gallery" badge (web only) | **Done 2026-10-20; automated gates pass; focused review / physical-phone acceptance next** |
| P2 | Gallery label on Admin/Manager internal screens (NOT the customer PDF) | After P1 |
| P3 | Gallery reason stored on the server | **Dropped** (P-Q1 = c, no reason) |
| P4 | New KPI page: camera / gallery / gallery % per technician + all technicians, charts | After P2 |
| R1 | One remark per row: picker redesign (web only) | **Review P2 fixed 2026-10-20; 41 unit + 14 browser checks pass; focused re-review / physical-phone acceptance next** |
| R2 | "Add to common remarks" becomes a request + approval: API + migration (Level 2) | **Done 2026-10-20; Level 2 gates pass; ready for focused review, then R3** |
| R3 | Admin/Manager "Remark requests" review page | After R2 |
| R4 | Roll out to Hose Reel, Hydrant, Fire Alarm, FM200, CO2 | After R1-R3 + Sprinkler phone test |
| T | Phone test (camera, camera failure -> gallery, offline, approval) | After each track |

---

## 1. Feature 1: Take photo vs upload from gallery

### 1.1 How it works today

Every photo control offers **two equal buttons side by side**:

| Control | File | Buttons shown |
|---|---|---|
| V7 evidence photo (Not Good photo + optional Good/N.A. photo), all 11 V7 systems | `apps/web/src/<system>/*V7EvidenceField.tsx` (e.g. `automaticSprinkler/AutomaticSprinklerV7EvidenceField.tsx:11`) | **Take Photo** and **Choose Existing Photo** (after a photo: "Replace with Camera" / "Replace from Gallery") |
| Legacy Sprinkler PSI photo | `apps/web/src/attachments/PhotoEvidenceField.tsx:126-131` | Take Photo and "Camera unavailable? Choose Existing Photo" |
| Repair visit After photo | `apps/web/src/repairVisits/RepairItemCard.tsx:187-191` | Take photo and Choose photo |

- **Take Photo** opens the in-app camera (`CameraCaptureDialog.tsx`, live rear camera via `getUserMedia`). Saved as `captureSource = "camera"`.
- **Choose Existing Photo** opens the phone's file picker (`<input type="file" accept="image/*">`). Saved as `captureSource = "gallery"`.

### 1.2 What is already recorded

The source **is already stored**, on the phone and on the server:

| Where | Column / field | Values |
|---|---|---|
| Phone (IndexedDB) attachment record | `captureSource` | camera / gallery / unknown |
| Server, legacy attachments | `inspection_attachments.capture_source` (migration 007, NOT NULL) | camera / gallery / unknown |
| Server, V7 evidence | `staged_inspection_evidence.capture_source` (migration 047) | camera / gallery / unknown; **NULL for photos uploaded before 047** |
| Server, repair visit photos | repair photo table `capture_source` (migration 054, NOT NULL) | camera / gallery / unknown |

The server validates the value strictly (`v7StagedEvidence.ts:76`, `repairVisitWriteContract.ts:62`, `inspectionAttachments.ts:358`).

### 1.3 Where the source is shown, and where it is not

| Screen | Shows gallery? |
|---|---|
| Technician form, V7 photo fields (all 11 systems) | **No.** It says only "Photo attached on this device". |
| Technician form, legacy PSI photo | Yes, a "Gallery attachment" badge |
| Repair visit After photo (technician) | **No.** It says "Taken <time>" even for a gallery photo. |
| Admin: Final Report web page | Yes: "Captured by Camera" / "Uploaded from Gallery" / "Source unavailable" (`jobs/FinalReportPresentation.tsx:52`) |
| Admin: Automatic Sprinkler accepted detail | Only in the image alt text ("Gallery inspection evidence"), not visible |
| Admin: accepted detail of the other 10 systems | **No** |
| Admin: Repair visit review | **No** |
| **Final Report PDF** (what the customer gets) | **No.** `FinalReportEvidence` (`api/src/reports/finalServiceReport.ts:42`) has no source field. |
| Repair visit PDF | **No** |
| Any KPI / per-technician count | **No.** Nothing counts gallery photos. |

### 1.4 Problems found

| # | Severity for the KPI goal | Finding |
|---|---|---|
| F-P1 | High | Gallery is as easy as the camera: same size button, right next to Take Photo, on every control. Nothing pushes the technician to use the camera. |
| F-P2 | High | **A gallery photo gets today's date stamp.** CR-08 decided "stamp camera and gallery" (Q7). The burned-in watermark and `capturedAt` both use the *time it was picked*, not the time the photo was taken (`imageProcessing.ts:105`, `automaticSprinklerV7Evidence.ts` `capturedAt ?? timestamp`). An old photo from the gallery looks exactly like a fresh on-site photo, in the app and in the PDF. |
| F-P3 | High | The PDF and most Admin screens do not say "from gallery" (table 1.3). |
| F-P4 | Medium | No reason is asked for when gallery is used. |
| F-P5 | Medium | No KPI view. The data exists (1.2), but nobody can see "technician X used gallery 7 times this month". |
| F-P6 | Info | On Android, the file picker also lets the user open the phone's own Camera app. A photo taken that way is recorded as **gallery** (the app cannot tell). So "gallery" really means "not taken with the in-app camera". |
| F-P7 | Info | The source is declared by the app on the phone; the server cannot prove it. Fine for KPI with our own app; not tamper-proof. |
| F-P8 | Info | V7 photos uploaded before migration 047 have no source (NULL), shown as "Source unavailable". |

Offline rule to respect (AGENTS.md): we must never block data entry. If the in-app camera fails (permission denied, old phone, camera busy) the technician still needs a way to attach a photo, so gallery must stay **possible** but **discouraged and flagged**.

### 1.5 Agreed fix (decisions in section 4)

- **P1 (web only, no migration):** one shared photo-actions component for all 13 controls (11 evidence field files
  incl. Fire Alarm V6 + legacy PSI + repair visit After photo):
  - "Take Photo" is the only button. There is **no gallery option while the in-app camera works**.
  - Only when the in-app camera **fails to start, is not supported, or permission is denied**, the camera view shows
    the link **"Camera not working? Upload from gallery"**.
  - Tapping it opens a confirm box: the photo will be marked **Uploaded from gallery** for KPI. No reason is asked.
  - Every attached gallery photo shows the badge **"Uploaded from gallery"** on the technician's form.
  - The stamp burned into the photo stays exactly as today (date + time, for gallery = upload time). "GALLERY" is
    **never** drawn into the image, because the customer PDF uses the same image.
- **P2:** internal screens only (Admin/Manager accepted detail of all 11 systems, Final Report web page, repair visit
  review) show a visible label **"GALLERY · uploaded <time>"** on/under the photo. The **customer PDF and repair
  visit PDF show nothing new**.
  - Note: the Final Report web page already prints "Uploaded from Gallery". It is an internal screen, so it stays.
- **P3: dropped** (no reason is collected; migration approval kept on file for later).
- **P4:** new Admin/Manager page "Photo KPI": camera count, gallery count, gallery % per technician (pick/search a
  technician) and for all technicians, with charts, on one page. Period: month picker (default this month) +
  All time. Counts every photo: service visit evidence + repair visit After photos. Photos with no recorded source
  (before migration 047) count as "Unknown", never as camera.

---

## 2. Feature 2: Remark logic on the service visit form

### 2.1 How it works today (Automatic Sprinkler, your screenshot)

One row (e.g. Water Tank → S.A.J Main Water Supply) has **one text field** for remarks. The picker writes into that field, **one line per remark**, so a row can hold several remarks.

What each part of the screen does (`apps/web/src/inspectionControls/RemarksField.tsx`):

| Part on screen | What it does |
|---|---|
| **Remark** dropdown | Lists (a) the **global** remark list for the whole Sprinkler system, (b) under "Added for this customer", remarks technicians added for *this row at this customer*, (c) **Others**. Picking (a) or (b) **adds a new line** to the row's remarks and resets the dropdown to "Choose a remark". |
| **Others** → "Type a new remark" | As you type, the text is written **live** into the row's remarks as an extra line (`appendOtherRemark`). It is used **only in this visit**. Nothing is saved for reuse. |
| **Add new remark** button | A **second, separate** free-text path (CR-07 Phase 1). It opens another box "New remark for S.A.J Main Water Supply" with "Save & use". Saving it (1) adds the line to the row and (2) **saves the remark permanently, immediately, with no approval**, for *this customer + Sprinkler + this row*. Other technicians see it for this customer after sync. Max 50 per row. Add-only (nobody can delete it in the app). |
| **List at the bottom with Remove** | The remarks **currently saved in the row**, one line each. Remove deletes that line from the row. It is the only place that shows what the row actually contains, because the dropdown always resets. |

So in your screenshot: you chose Others and typed "12"; the "12" in the bottom list is the same text, already written into the row. "Add new remark" is not related to what you typed; it opens a different editor.

### 2.2 Other systems

| Systems | Remark control |
|---|---|
| Hose Reel, Hydrant, Fire Alarm, FM200, CO2 | Same dropdown + Others + bottom list, multi-line. **No** "Add new remark". Instead, under Others there is **"Add to common remarks"**: a technician can push the typed text into the **global list for that system, for all customers, instantly, with no approval** (`routes/serviceCommonRemarks.ts:38` allows the technician role). |
| Wet Chemical, Dry/Wet Riser, Smoke Ventilation, Fire Intercom, Roller Shutter | Plain text box, no dropdown. |
| Admin "Service common remarks" page (`manager/ManagerCommonRemarks.tsx`) | Admin can add / edit / remove **global** remarks per system. It cannot see or manage the per-customer section remarks. There is **no approval queue** anywhere for remarks. |

### 2.3 Problems found

| # | Finding |
|---|---|
| F-R1 | A row can have many remarks; you want **one**. |
| F-R2 | The chosen remark is not shown in the dropdown (it resets), only in a separate list below. Confusing. |
| F-R3 | Two different free-text paths (Others, Add new remark) on the same row. |
| F-R4 | A new remark becomes permanent **without approval** (Sprinkler: per customer; other 5 systems: global via "Add to common remarks"). |
| F-R5 | Sprinkler section remarks are kept **per customer**, not per service + section for everyone. |
| F-R6 | The global list is per **system**, not per **section**: e.g. "Battery spoilt" is offered under Water Tank → S.A.J Main Water Supply. |
| F-R7 | Admin has no screen to see/approve/remove the technician-added section remarks. |

### 2.4 Agreed fix (decisions in section 4)

**Target behaviour per row (dropdown services; the Comments box stays exactly as today):**

1. One dropdown. It **shows the chosen remark** (no list below, no Remove button). Choosing another remark
   **replaces** it. A "No remark" option empties it. Remarks with a detail (e.g. "Battery spoilt" → battery size)
   keep their second dropdown.
2. Last option: **"Others (type your own)"** → a text box right under the dropdown. The typed text is the row's
   remark, used in this visit's report straight away (works offline).
3. By default a typed remark is **this visit only**. Under the text box there is an **"Add to common remarks"**
   button. Only when the technician taps it does the text become a **remark request**. The separate
   "Add new remark" button (Sprinkler) is removed; "Add to common remarks" is the one path on every service.
4. Admin/Manager see a **Remark requests** page: Approve, Approve with edited wording, or Reject.
5. Approved → a permanent choice in the dropdown of **that same service + section, at every customer**
   (e.g. Automatic Sprinkler → Water Tank → S.A.J Main Water Supply).
6. Rejected → not added. The visit keeps its text. The technician is told it was rejected.
7. The existing system-wide list stays one list per system, shown in every section, managed on the existing
   Admin "Service common remarks" page.
8. Old visits whose row holds 2+ lines: shown as they are (read-only); if such a draft is edited, the technician
   picks one.
9. CR-07 remarks already added by technicians: kept, for their own customer only.

**Build steps:**

- **R1 (web only):** new single-choice picker in `RemarksField.tsx` (Automatic Sprinkler first).
- **R2 (API + migration, Level 2):** "Add to common remarks" creates a pending request (offline outbox, idempotent);
  approval/decision log; approved remarks listed per service + section for every customer.
- **R3 (web):** Admin/Manager "Remark requests" page (copy the site/location proposal pattern) + rejected notice
  for the technician.
- **R4:** after the Sprinkler phone test, the same on Hose Reel, Hydrant, Fire Alarm, FM200, CO2. Their current
  instant "Add to common remarks" (goes live for everyone, no approval) becomes the request flow. The 5 plain-text
  services stay plain text.

---

## 3. Protected scope this work touches

| Item | Step | Why |
|---|---|---|
| New Postgres migration (next free number, 057 at time of writing; check at build time) | R2 | remark request status, decision log, every-customer scope. Applied migrations (incl. 049) are never edited. Owner approved a migration (P-Q7 / R2). |
| Dexie schema | none | records gain plain fields only; no new index, no version bump. If an agent thinks an index is needed it must stop and ask. |
| Customer PDF | none | P-Q2: the customer PDF must NOT change. P2 must prove the PDF output is unchanged. |
| Image stamp (`imageProcessing.ts`) | none | P-Q3: the burned-in stamp stays exactly as today. |
| API role on `POST /service-common-remarks` | R4 | the technician's instant global add is replaced by the request flow. |

---

## 4. Owner decisions (answered 2026-10-20)

### Photos

| ID | Question | Answer |
|---|---|---|
| P-Q1 | Gallery use | **(c)** Gallery is offered **only after the in-app camera fails** (cannot start, not supported, or permission denied). No reason asked. |
| P-Q2 | Where "gallery" shows | **Internal screens only** (Admin/Manager). **Not** in the customer PDF. |
| P-Q3 | Stamp | **Same stamp as today burned into every photo** (gallery = upload time). Internal screens show a separate label **"GALLERY · uploaded <time>"** that is not part of the image, so the customer PDF never shows it. |
| P-Q4 | KPI | New Admin/Manager page. Camera count, gallery count, gallery %. Search/select a technician + an all-technicians total, **both on the same page**, visualised (charts). Period: **month picker (default this month) + All time**. Counts every photo (service visits + repair visits). |
| P-Q5 | Wording | Approved: link "Camera not working? Upload from gallery", badge "Uploaded from gallery". |
| P-Q6 | Repair visit After photo | **Yes**, same rule and marking. |
| P-Q7 | Migration for the reason | Approved in principle, but **not used now** (P-Q1 is not (b)). P3 dropped. |

### Remarks

| ID | Question | Answer |
|---|---|---|
| R-Q1 | Scope of an approved remark | **Every customer.** |
| R-Q2 | One remark per row | **Yes, strictly one** per row. The **Comments** box stays **exactly as today** (dropdown that adds lines, Others, list with Remove, its "Add new remark"); it is not part of this change. |
| R-Q3 | Old multi-line rows | **Yes**: shown as they are read-only; an edited draft must pick one. |
| R-Q4 | While pending / rejected | **Yes**: used in this visit's report immediately; others do not see it until approved; if rejected the visit keeps the text and the technician is told. |
| R-Q5 | Who approves | **Admin + Manager** (code roles `supervisor` + `admin`). The approver **can edit the wording**. |
| R-Q6 | Services | **Automatic Sprinkler first**, then Hose Reel, Hydrant, Fire Alarm, FM200, CO2. The 5 plain-text services (Wet Chemical, Dry/Wet Riser, Smoke Ventilation, Fire Intercom, Roller Shutter) **stay plain text**. |
| R-Q7 | Lists and the button | The system-wide list stays **one list per system**. **"Add to common remarks" stays**: a typed remark is this-visit-only unless the technician taps it; tapping creates a request; once approved it appears in **that section only, at every customer**. |
| R-Q8 | Detail dropdown | **Keep.** |
| R-Q9 | Existing CR-07 remarks | **Keep them, same customer only**: offered in their section for the customer where they were added; listed on the Admin/Manager page where they can be deactivated. (Confirmed.) |

---

## 5. Log

- 2026-10-20 R1 review remediation: fixed reopened Others losing its textarea/focus after clearing or matching a catalog choice. Both new offline regressions reproduced the failure before the fix; 41 unit/regression and 14 browser checks, web typecheck/build and diff whitespace pass. Ready for focused re-review; physical acceptance pending.

- 2026-10-20: investigation, findings and plan written. Prompts drafted in [PHOTO_AND_REMARKS_PROMPTS.md](PHOTO_AND_REMARKS_PROMPTS.md); every prompt is gated on the decisions above.
- 2026-10-20: owner answered P-Q1..P-Q7 and R-Q1..R-Q9 (P-Q3, P-Q4 period, R-Q6, R-Q7, Comments box, R-Q9 confirmed in follow-ups). P3 dropped. Plan and prompts updated; P1, R1, R2 ready.
- 2026-10-20 R2: added forward migration 057 and separate authenticated request/review/choice/deactivate routes. Existing CR-07 handlers, 049, allowlist copies, accepted records and PDF code untouched. API contract and verification below; R3 owns the browser outbox/cache/review/technician notice work.
- 2026-10-20 R2 verification: cold-start runner PASS; **133 tests passed, 0 failed, 0 skipped**, API typecheck/build PASS, diff whitespace PASS. Level 2 proofs green. Disposable container removed; no runtime DB/deployment/Git mutation. P0/P1/P2 in R2: **0/0/0**. Ready for R2 review; R3 API contract below.

- 2026-10-20: P1 implemented: all 13 photo controls share camera-first actions; gallery follows a camera start failure and confirmation; gallery badges cover Draft/read-only forms. 43 unit/regression + 96 browser checks pass across final suite runs; web typecheck/build and diff whitespace pass. Source values/stamp/PDF paths unchanged. Physical-phone acceptance pending; see P1 verification below.

## 6. R2 API contract for R3

All paths are relative to the existing API base. All new reads use `Cache-Control: private, no-store`.
UI Manager = `admin`; UI Admin = `supervisor`. New create and technician reads allow all three roles;
every manager path allows only `admin` + `supervisor`. Write calls accept the existing
`x-expected-user-id` guard (409 `IDENTITY_MISMATCH` when a stale account sends work).

| Method + path | Request | Success response |
|---|---|---|
| POST `/technician/customers/:customerId/systems/:systemKey/remark-requests` | `{id,sectionKey,wording,jobId?}`; client UUID; jobId must be a UUID if supplied | 201 `{requestedId,duplicate:false,request:Request}`; exact replay 200 `{requestedId,duplicate:true,request:Request}` |
| GET `/systems/:systemKey/approved-section-remarks` | None; no customer argument | `{remarks:ApprovedRemark[]}`; active choices only, all sections for that system, every customer |
| GET `/technician/remark-requests` | None | `{requests:Request[]}`; **only the signed-in user's** requests, newest first, including rejection notes |
| GET `/manager/remark-requests?status=pending` | status = `pending` (default), `approved`, `rejected`, `decided`, or `all` | `{requests:Request[]}`, newest first |
| GET `/manager/remark-requests/:id` | None | `{request:Request}` |
| POST `/manager/remark-requests/:id/decision` | `{decision:"approved",approvedWording?,note?}` or `{decision:"rejected",note}` | 201 `{request:Request}`; approval without approvedWording uses the original wording |
| GET `/manager/section-remarks` | None | `{approvedRemarks:ApprovedRemark[],legacyRemarks:LegacyRemark[]}`; includes inactive rows for management |
| POST `/manager/section-remarks/approved/:id/deactivate` | `{}` (UI must confirm first) | `{remark:{id,active:false}}`; repeat is safe |
| POST `/manager/section-remarks/legacy/:id/deactivate` | `{}` (UI must confirm first) | `{remark:{id,active:false}}`; repeat is safe; customer scope retained |

DTO shapes (nullable fields are explicit nulls):

```ts
type Request = {
  id: string; systemKey: string; sectionKey: string; wording: string;
  customerId: string; customerDisplayName: string;
  jobId: string | null; jobReference: string | null;
  requestedByUserId: number; requestedBy: string; createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decision: null | {
    id: string; decision: 'approved' | 'rejected';
    reviewerUserId: number; reviewer: string; reviewerRole: 'admin' | 'supervisor';
    note: string | null; approvedWording: string | null; createdAt: string;
  };
};
type ApprovedRemark = {
  id: string; systemKey: string; sectionKey: string; wording: string;
  active: boolean; sourceRequestId: string;
};
type LegacyRemark = {
  id: string; customerId: string; customerDisplayName: string;
  systemKey: string; sectionKey: string; wording: string; active: boolean;
};
```

`createdAt` is an ISO UTC timestamp. Fingerprints are internal. The normalized create fingerprint binds
the actor, customer, optional job, system, section, and wording. UUIDs are case-insensitive, while
`requestedId` echoes the exact submitted string. R3 must validate that receipt before completing its outbox item.
An exact replay remains valid after approval/rejection, customer deactivation or removal of the audit-context visit;
it returns the same immutable request content with the current derived decision status. A changed body/account
under that UUID returns 409 `IDEMPOTENCY_CONFLICT`.

Only existing allowlisted Automatic Sprinkler checklist/measurement keys are accepted in R2. `comments` is
rejected; no allowlist or parity change. R4 owns the later system rollout. Section keys identify the existing
template slots; there is no new client-supplied section-label field.

Duplicate refusal is 409 `{error,message,existing:{id,wording}}`:
`DUPLICATE_CATALOG` (active system-wide choice), `DUPLICATE_APPROVED` (active choice in this section), or
`DUPLICATE_PENDING` (request in this section with no decision). The pending duplicate payload exposes no
other technician/customer/visit metadata and is **not** a choices response. Case/normalized whitespace is ignored
for matching. Inactive choices and rejected requests do not block a new request. No cap is added to the new
workflow; the existing CR-07 cap remains unchanged.

Decisions are terminal: any second decision returns 409 `REMARK_REQUEST_ALREADY_DECIDED`, including an
identical retry. After a timeout, R3 should refresh detail to discover the committed outcome. Edited approval
uses the existing 3–300 code-point normalization rules; reject requires a 3–500 character note. Approving
wording already active in the catalog/section returns the corresponding duplicate error and keeps the request
pending for correction/rejection. Concurrent edited approvals of one wording leave one winner and one pending
request. A database uniqueness backstop returns 409 `REMARK_DECISION_CONFLICT` if reached.

Other errors: 400 `INVALID_REMARK_REQUEST`; uniform 404 `REMARK_REQUEST_NOT_FOUND` for unknown request or
out-of-scope customer/visit; 401 `AUTH_REQUIRED`; 403 `FORBIDDEN`. Bodies reject unknown keys.
Deactivation does not change a request's approved status, original text, decision log or existing visit text.
R3 must keep pending and inactive items out of the picker.

Legacy endpoints stay unchanged:
GET `/customers/:customerId/section-remarks` and POST
`/technician/customers/:customerId/systems/:systemKey/section-remarks` still implement CR-07's
customer-only scope, merging/replay receipts and Comments flow for already queued phones.
The system-wide `/service-common-remarks` handlers are unchanged; the later R4 role change is not part of R2.

## 7. R2 verification and boundaries

Cold-start reproducible command (starts its own disposable DB, overrides even a pre-existing DATABASE_URL,
checks every exit code, restores environment, and removes only its own container):

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\apps\api\src\routes\verifyR2RemarkRequests.ps1
```

The runner uses a unique container name, captures its immutable Docker ID, and refuses an occupied port
rather than removing someone else's database. Cleanup removes only that ID, including failed starts. All integration
tests use disposable `127.0.0.1:55432` only, with a hostname/port/config equality guard in the new suite.
No runtime/customer database or deployment is changed. It runs API typecheck/build, focused R2 integration,
existing CR-07 integration + real web-parser contract, site-proposal integration/unit, system-common-remarks and
route-order regressions, historical matrix/V6/definition/contract/config checks, and `git diff --check`.
No existing test assertion is changed.

| Level 2 proof | Coverage |
|---|---|
| Idempotency / exact UUID | Normalization + uppercase receipt, exact replay, same-ID concurrency, changed content/job/section/account conflicts |
| Stale callers | Expected-user guard; same UUID cannot be taken by another account; replay after decision and deleted context visit |
| Concurrency | Two technicians/one wording; same UUID across sections; approve/reject race; two edited approvals/one active wording; unique index backstop |
| Rollback | Injected audit failure leaves neither a request nor an approval/decision behind; successful retry afterward |
| Auth | Every manager route: unauthenticated 401, inspector 403, both approver roles allowed; create ownership/system/sample/demo/inactive scope |
| Server authority | Status from append-only terminal event; edited approved text from server normalization; no pending choices; private own-request read-back |
| Historical isolation | Statement triggers forbid writes to inspection/template/report/catalog authority tables during approve/reject/deactivate; original request + event unchanged by deactivate; protected source paths unchanged |
| Legacy compatibility | Forward migration with populated 049 table + migration rerun preserves exact rows; queued create/replay works; per-customer scope retained |

Final gate results (cold-start script completed successfully):

| Gate | Result |
|---|---|
| API typecheck / build | PASS / PASS |
| R2 focused integration | PASS: 22 tests |
| Existing CR-07 integration + real web-parser contract | PASS: 12 + 1 tests |
| Existing site-proposal integration | PASS: 17 tests |
| Common-remarks, site-proposal unit, route order, V7 contracts, config | PASS: 48 tests |
| Historical compatibility matrix (including existing PDF pipeline regression) | PASS: 20 tests |
| V6 evidence / contract compatibility | PASS: 11 tests |
| Wet Chemical historical definition | PASS: 2 tests |
| Level 2 proofs in the table above | PASS: all eight rows |
| Protected API migrations/templates/V6/PDF/legacy handlers | PASS: no working-tree changes in protected paths; 057 is the only added migration |
| `git diff --check` | PASS; unrelated LF/CRLF notices only |
| R3 API contract / progress log / HANDOVER Last updated | PASS |

**Total: 133 passed, zero failed/skipped. P0 remaining: 0; P1 remaining: 0; P2 remaining in R2: 0.**
Initial harness fixes were confined to new tests/runner: unique customer fixture names, explicit anonymous
test callers, and configuring the installed Playwright Chromium for the historical PDF test. The final full
cold-start run passed. Existing test assertions were not modified. `SAFE FOR R2 REVIEW: Y`.

R2 files (all other working-tree changes belong to other work):

- `apps/api/migrations/057_section_remark_requests.sql` — new request, append-only terminal decision and approved-choice tables.
- `apps/api/src/db/migrations.ts` — run 057 once using the established table marker.
- `apps/api/src/server.ts` — register the separate R2 router.
- `apps/api/src/routes/remarkRequests.ts` — request, own-status, approved-choice, review, legacy-management and deactivate endpoints.
- `apps/api/src/routes/remarkRequests.integration.test.ts` — focused disposable-Postgres Level 2 regression proofs.
- `apps/api/src/routes/verifyR2RemarkRequests.ps1` — reproducible cold-start verification and cleanup.
- `docs/photo-and-remarks/PHOTO_AND_REMARKS_PROGRESS.md` — R2 step/log, R3 contract, proof and limitations.
- `HANDOVER.md` — R2 Last updated/checkpoint link.

Limitations: API-only checkpoint. R3 must wire IndexedDB/outbox, notices, picker cache and review UI; R4 must
roll out other services. No physical-phone, browser/offline/PWA force-close, release or deployment test is
claimed here. Customer Final Report and repair PDF source pipelines are untouched; no PDF byte comparison
is claimed. Existing unrelated working-tree changes are preserved and are outside the R2 verdict.

- 2026-10-20: R1 implemented for scoped Automatic Sprinkler checklist/measurement rows only. Selection replaces/clears the field; persisted wording restores choice/detail; Others types directly into the row. Its Add to common remarks uses unchanged addSectionRemark and never rewrites the row. Legacy multi-line text is preserved until selection; read-only, Comments, unscoped controls and other systems keep the existing path. 41 focused unit/regression tests + 12 Playwright checks passed, no skips; web typecheck/build and diff whitespace passed. Physical phone, installed-PWA force-close and production offline bootstrap not performed. No Git mutations. Existing test assertions changed only for R1: scoped row Add new remark/Save & use/list expectations became Others/Add to common remarks/current-value expectations, the 24 editor count became one Comments editor, and mobile editor checks became picker checks. Existing Comments duplicate/merge tests and the unscoped append spec remain intact.

### R1 verification (2026-10-20)

| Gate | Result |
|---|---|
| Replace / clear / Others / exact detail / legacy value rules | PASS (unit) |
| Real Sprinkler form at 375 px: choose/change/detail reload/ offline Others/autosave callback/save/reload/clear/reload | PASS |
| Comments append/detail/Others/list/Remove/Add new remark + Save & use | PASS |
| Real Hose Reel checklist append/Others/list/Remove | PASS |
| Legacy multi-line editable and read-only preservation; explicit pick replaces all | PASS |
| Existing section cache/sync/idempotency/exact UUID and autosave regressions | PASS |
| 44 px targets, 16 px entry, no 375 px horizontal overflow; 360/768/1280 layouts | PASS |
| Web typecheck / production build / git diff --check | PASS (existing bundle-size warning) |
| Protected files / customer and repair PDF paths | No R1 edits; concurrent work belongs to other tracks |

R1 P0/P1/P2 findings: **0/0/0**. Existing build-size warning retained. Review-ready; R3 wiring and R4 rollout are separate steps. Browser tests use mocked API responses and real IndexedDB; the existing Sprinkler harness captures autosave callbacks, so the reload test explicitly persists that captured response through the real repository. This is not deployed app or physical-phone acceptance.

Files changed by R1 (other working-tree changes are concurrent work):

- `apps/web/src/inspectionControls/RemarksField.tsx`: scoped single-row picker; unchanged legacy path for Comments and other callers.
- `apps/web/src/inspectionControls/remarkFormatting.ts`: bounded replacement and persisted-choice derivation.
- `apps/web/tests/commonRemarkFormatting.test.ts`: replacement/detail/clear/Others/legacy rules; existing append tests retained.
- `apps/web/tests/section-remarks-form.spec.ts`: scoped behavior, Comments preservation, legacy/reload/offline and responsive proof; adapted CR-07 assertions to owner-approved behavior.
- `apps/web/tests/remarks-r1.spec.ts`: real Hose Reel form append regression.
- `apps/web/tests/remarks-r1.config.ts`: isolated Vite port 4186 and artifact directory for concurrent checks.
- `docs/photo-and-remarks/PHOTO_AND_REMARKS_PROGRESS.md`: status, log, gate results and reproducible commands.
- `HANDOVER.md`: latest R1 checkpoint pointer.

Reproduce from PowerShell (dependencies and Playwright Chromium already installed; localhost socket access required):

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/commonRemarkFormatting.test.ts tests/sectionRemarks.test.ts tests/remarkSectionsParity.test.ts tests/sectionRemarkTextParity.test.ts tests/draftAutosave.test.ts tests/draftAutosaveWiring.test.ts tests/autosaveStatus.test.ts
npx playwright test --config tests/remarks-r1.config.ts --workers=1
npm run typecheck
npm run build
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

### R1 review remediation (2026-10-20)

- Fixed the review P2: editing a reopened Others remark now keeps Others active when the text is
  cleared or temporarily matches a catalog choice. The textarea and focus remain available for offline
  replacement typing; an explicit dropdown selection still switches to a catalog/detail choice or clears it.
- Added two 375px regressions in `section-remarks-form.spec.ts`. Both failed against the reviewed code
  because the textarea disappeared, then passed after the fix. They cover offline continued typing,
  focus, autosave callbacks, and explicit switching back to a detail choice and No remark.
- Final browser run: **14 passed, zero failed/skipped**. Focused unit/regression run: **41 passed,
  zero failed/skipped**. Existing Comments, Hose Reel, legacy, section-store and responsive checks pass;
  360px and 1280px screenshots visually inspected. Web typecheck, production build/service-worker
  generation and `git diff --check` passed (existing bundle-size warning retained).
- The existing R1 port 4186 was occupied. Verification used the same suite/browser settings on port
  4188 with a generated config under ignored `test-results/`; no checked-in test config was changed.
- Remediation files: `RemarksField.tsx` (keep the active editor), `section-remarks-form.spec.ts`
  (two regressions), this progress file and `HANDOVER.md` (checkpoint record). Concurrent photo/API,
  schema, PDF, historical-template and other workspace changes were preserved. No Git mutations.
- Physical-phone, installed-PWA force-close and production offline-bootstrap acceptance remain pending.
- P0/P1/P2 remaining in this remediation: **0/0/0**. Ready for focused re-review; whole-tree commit
  readiness still depends on the independent concurrent tracks. Stopped before staging.

## P1 verification (2026-10-20)

**P1 automated checkpoint: PASS; ready for focused review, then track T physical-phone acceptance.**
P0 remaining: **0**. P1 remaining: **0**. P2 findings introduced in P1: **0**.

The sole normal action is Take Photo / Replace with Camera. Camera startup failures (insecure context,
missing getUserMedia, permission denial, missing/busy camera and other rejected starts) reveal
"Camera not working? Upload from gallery". Confirmation opens the image picker synchronously from
Confirm; Cancel/Escape dismiss without opening a picker or saving. The native modal moves/traps focus
and returns it. A frame error after startup keeps Capture enabled and the stream live; it never unlocks gallery.
Gallery photos display "Uploaded from gallery" in technician Draft/read-only controls, including repair After.
No reason, model, schema, API, sync, stamp or PDF changes were made by P1.

### All 13 controls -> shared component (files changed, one row each)

| Control file:line | P1 change |
|---|---|
| `apps/web/src/attachments/PhotoEvidenceField.tsx:124` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/automaticSprinkler/AutomaticSprinklerV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/co2/V7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/dryWetRiser/DryWetRiserV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/fireAlarm/FireAlarmV6EvidenceField.tsx:13` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/fireAlarm/FireAlarmV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/fireIntercom/FireIntercomV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/fireRatedRollerShutter/FireRatedRollerShutterV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/fm200/Fm200EvidenceField.tsx:16` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/hoseReel/HoseReelV7EvidenceField.tsx:8` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/hydrant/HydrantV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/smokeVentilation/SmokeVentilationV7EvidenceField.tsx:11` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |
| `apps/web/src/repairVisits/RepairItemCard.tsx:186` | Uses `PhotoCaptureActions`; gallery badge outside editable-only actions. |

CO2's evidence field is also reused by Wet Chemical. Fire Alarm V6 is intentionally included in the
11 evidence field files; its protected API evidence/acceptance files and historical templates remain unchanged.
Each system retains its own save function. `PhotoEvidenceField` retains local Remove/full-view behavior;
optional-photo wrappers retain Remove Photo; repair retains replacement and Remove this field.

### Other files changed by P1

| File | Reason |
|---|---|
| `apps/web/src/attachments/PhotoCaptureActions.tsx` | One shared action/picker/camera host; callers retain persistence. |
| `apps/web/src/attachments/CameraCaptureDialog.tsx` | Separate startup failure from capture errors; gated fallback confirmation with focus/keyboard handling. |
| `apps/web/tests/photoCaptureActions.test.ts` | 13 rendering units: default camera-only actions, all 11 evidence badges and repair Draft/read-only badges. |
| `apps/web/tests/photo-capture-actions.html` | Isolated real-component fixture and legacy PSI badge fixture. |
| `apps/web/tests/photo-capture-actions.spec.ts` | 13 browser checks: startup failure matrix, confirm/picker/cancel/focus, capture retry, real getUserMedia denial, actual IndexedDB source values offline, legacy badges and responsive layout. |
| `apps/web/tests/optional-good-photo-pilot.spec.ts` | Only removes the obsolete Replace from Gallery touch-target assertion (CO2 + Wet Chemical); remaining actions retain 44px checks. |
| `apps/web/tests/repair-visit-app.spec.ts` | Only changes the obsolete Replace photo gallery-button assertion to Replace with Camera in the shared helper. Other concurrent OA-14 edits are preserved. |
| `docs/photo-and-remarks/PHOTO_AND_REMARKS_PROGRESS.md` | P1 status, log, control map, proofs and verification record. |
| `HANDOVER.md` | Last updated line includes this P1 checkpoint. |

### Capture source / untouched-file proofs

- All 11 evidence callers still call their own `save(blob, "camera", at)` or `save(file, "gallery")`.
- Legacy PSI still calls `store(blob, "camera", capturedAt)` or `store(file, "gallery")`.
- Repair still calls `storePhoto(blob, "camera")` or `storePhoto(file, "gallery")`.
- All 13 original persistence function bodies were compared with HEAD and were unchanged by P1.
  Concurrent OA-14 work subsequently split repair photo status from remark status; P1 preserves that work.
  Its `captureItemPhoto(uuid, blob, source)` call and source arguments are unchanged.
- The 375px camera-success and Chromium permission-denial tests read actual IndexedDB attachment records:
  exactly `["camera"]` and `["gallery"]`, respectively; the gallery test picks through the actual file chooser
  while the browser context is offline. Badges survive remount from IndexedDB; camera photos have no badge.
- `git rev-parse HEAD:apps/web/src/attachments/imageProcessing.ts` and
  `git hash-object apps/web/src/attachments/imageProcessing.ts` both return
  `a24376ea2789b9e0b9914d523c039a32e05d5d9a`. `processInspectionPhoto` and its stamp are untouched.
- `git status --short` / `git diff --name-only` for historical templates, protected Fire Alarm V6 API files,
  `apps/api/src/reports`, Dexie definition and image processing return no paths. Customer Final Report PDF
  and repair visit PDF implementation/output paths were not changed. No new PDF pixel comparison is claimed.
- Existing unrelated/concurrent workspace changes (including R1/R2) were preserved; P1 performed no Git mutations.

### Gates and results

| Gate | Result |
|---|---|
| New rendering units + selected existing photo/evidence/repair units | **PASS: 43**, zero failed/skipped |
| New component/browser acceptance | **PASS: 13** |
| Existing optional photo + watermark/lifecycle specs | **PASS: 14** |
| Existing repair app | **PASS: 15** (including concurrently added OA-14 acknowledgement regression) |
| Existing repair sync + v12 upgrade | **PASS: 2** |
| Existing repair C1 inspection regressions | **PASS: 24** |
| Existing repair review + CO2 cross-instance + V6 reload + Fire Intercom/Smoke offline harnesses | **PASS: 28** |
| Total selected browser checks across final suite runs | **PASS: 96**, zero remaining failures/skips |
| Web typecheck | **PASS** |
| Web production build / service-worker generation | **PASS** (existing large-chunk warning remains) |
| 375px no-scroll / 44px checks; 360/768/1280 layout + screenshots | **PASS**; phone/desktop screenshots visually inspected |
| `git diff --check` | **PASS** (line-ending warnings only) |
| 13-control shared-component map / unchanged source values / unchanged image processing | **PASS**, proofs above |

Initial repair failures were exclusively the obsolete gallery replacement assertion listed above; after its
owner-required update, all 15 repair app tests passed. Initial component focus/retry fixture issues were fixed;
the final 13 checks passed. This Chromium needs `--use-fake-ui-for-media-stream` with its fake camera;
`--use-fake-ui-for-media-stream=deny` returns a real browser `NotAllowedError` for the denial scenario.

Limitations: automated Chromium, local fixtures/IndexedDB and mocked API regression harnesses only. No physical
phone, installed-PWA force-close, real OS/browser restart or live deployment acceptance was performed by P1.
Track T owns those checks. Remote Admin/Manager gallery labels remain P2; KPI remains P4. P1 adds no new
source fields to remote records. STOPPED before staging; no commit.

Reproduce the selected Level 1 gates (no production DB required):

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
..\api\node_modules\.bin\tsx.cmd --test tests/photoCaptureActions.test.ts tests/repairVisits.test.ts tests/optionalGoodPhoto.test.ts tests/co2V7CrossInstanceEvidence.test.ts tests/v7EvidenceStaleManifest.test.ts
npx playwright test tests/photo-capture-actions.spec.ts tests/photo-watermark.spec.ts tests/optional-good-photo-pilot.spec.ts tests/repair-visit-app.spec.ts tests/repair-visit-sync.spec.ts tests/repair-visit-v12-upgrade.spec.ts tests/repair-c1-inspection-regressions.spec.ts tests/repair-visit-review.spec.ts tests/co2-v7-cross-instance.spec.ts tests/fire-alarm-v6-draft-reload.spec.ts tests/smoke-ventilation-v7-offline.spec.ts tests/fire-intercom-v7-offline.spec.ts --workers=1
npm run typecheck
npm run build
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

## R2 review remediation — verification ownership (2026-10-20)

The review's P2 was a verification collision, not an R2 API defect. The standard gate block previously
removed the shared `phase8f-v7-verify` container before starting and again during cleanup. Overlapping
runs could terminate another run's integration database.

Both the task-brief standard gate block and `verifyR2RemarkRequests.ps1` now create a unique container,
retain its Docker ID, start/check only that ID, and remove only that ID in `finally`. There is no
pre-start deletion. PostgreSQL remains restricted to disposable `127.0.0.1:55432`. An occupied port is
refused without stopping its owner; a failed start still cleans up the newly created container. Explicit
cleanup owns removal, avoiding a race with Docker's automatic removal after a failed start.

| Remediation gate | Final result |
|---|---|
| Mocked runner safety regressions: both runners, success/create failure/occupied port/not ready/suite failure | PASS: 10 cases |
| Real occupied-port checks for both final runner versions | PASS: existing owner remains running; failed-start containers removed |
| Final R2 runner, from cold | PASS: 133 tests; zero failed/skipped; API typecheck/build |
| Corrected task-brief standard block, verbatim, from cold | PASS: entire block completes |
| Standard historical matrix / V6 evidence / Wet Chemical definition / V7 contracts + config | PASS: 20 / 11 / 2 / 38 tests |
| Standard V6 / CO2 V7 / Wet Chemical V7 / Fire Alarm V7 / evidence race integration | PASS: 1 / 4 / 2 / 4 / 1 tests; zero skipped |
| Standard web typecheck / build / stale-evidence test | PASS / PASS / PASS (1 test); existing large-chunk warning |
| Protected templates, API V6 files, PDF pipelines, existing migrations and Dexie | No remediation edits; working-tree status clean for protected paths |
| git diff --check | PASS; line-ending notices only |

An initial negative-port fixture overlapped a full verification attempt; the corrected runner safely refused
that occupied port. The final negative checks and database suites were then run sequentially and passed.
The prior review's interrupted Wet Chemical tests now pass. No application validator or existing test
assertion was weakened. No production container, database, deployment or customer data was changed.

Files changed for remediation only:

- `.agents/skills/codex-task-brief/SKILL.md`: correct the unsafe standard gate container ownership.
- `apps/api/src/routes/verifyR2RemarkRequests.ps1`: apply unique names and ID-based lifecycle/cleanup.
- `apps/api/src/routes/verifyR2RemarkRequests.test.ps1`: executable regression checks for both runners with mocked external commands.
- `docs/photo-and-remarks/PHOTO_AND_REMARKS_PROGRESS.md`: this remediation proof and reproduction commands.
- `HANDOVER.md`: latest R2 checkpoint status.

Reproduce sequentially in PowerShell (Docker access, installed dependencies and Playwright Chromium required;
port 55432 must be available, otherwise the runners safely refuse it):

```powershell
cd C:\PWA_OfflineRecordWebApp
powershell -NoProfile -File apps/api/src/routes/verifyR2RemarkRequests.test.ps1
& ./apps/api/src/routes/verifyR2RemarkRequests.ps1
$brief = Get-Content .agents/skills/codex-task-brief/SKILL.md -Raw
$gates = [regex]::Match($brief, '(?s)## Standard gates.*?```\r?\n(.*?)```').Groups[1].Value
if (!$gates) { throw 'Standard gates block not found' }
Invoke-Expression $gates
```

P0 remaining: **0**. P1 remaining: **0**. P2 remaining in this remediation: **0**.
`SAFE FOR R2 RE-REVIEW: Y`. `SAFE TO COMMIT (R2 and verification remediation scope): Y`.
The working tree also contains unrelated/concurrent changes; this is not approval for those changes.
No new phone/offline/PWA force-close or deployment acceptance is claimed by this script-only remediation.
Git remains the owner's responsibility; nothing was staged or committed.
