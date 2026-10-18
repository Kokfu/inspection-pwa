# Repair Visit + Offline Visit Creation — step-by-step plan

Date: 2026-10-19 (Asia/Kuala_Lumpur). Branch: `phase-8e-client-demo-polish`.
Ready-to-paste prompts for every step: [REPAIR_VISIT_PROMPTS.md](REPAIR_VISIT_PROMPTS.md).
Governing rules: `AGENTS.md`, `.agents/skills/codex-task-brief/SKILL.md`.

This plan **replaces** the CR-09/CR-10 Repair List (`docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md`).
That document stays as history only. Nothing in this plan has been built yet.

---

## 1. What we are building (in one page)

### Part A — Offline visit creation (for service visits and repair visits)

Today **Create Service Visit** only works with internet: the server creates the visit, its ID, its
`SV-…` number and its date. After this work:

1. With internet: works exactly as today (server date and time).
2. Without internet: the phone creates the visit itself, using the customers, sites and service
   formats it downloaded earlier. The visit date and arrival time come from the phone clock.
   The card shows **"SV number given when synced"**. The technician can fill every form, take
   photos and Submit straight away.
3. When the signal comes back, the visit is sent **first**, then its forms and photos. The server
   confirms that exact visit (same UUID) and gives it its `SV-…` number.
4. If the customer's setup changed in the meantime (site removed, service format changed), the
   visit is marked **Needs attention**. Nothing on the phone is deleted. The technician sees a
   clear message and Admin can help.
5. Still online-only: **+ Add New Customer**, and typing a brand-new site (CR-02). Offline, the
   technician can only pick customers/sites already downloaded on the phone.

### Part B — Repair Visit (replaces the current Repair List)

1. **Repair List** in the menu opens a page with **+ New Repair Visit** and two tabs:
   **In Progress | Completed**.
2. **New Repair Visit** looks like New Service Visit:
   - Customer (existing customers only, no "Add New Customer") → Site → Service Call No.
   - Arrival time from the phone clock, as on service visits.
   - **Previous visit** (optional): one visit, same customer and same site, **approved**,
     created by this technician. It can be a service visit **or** a repair visit.
   - **Fields to repair** (at least one, any number, any systems), picked as
     **System → Unit / Location → Section → Field**.
     Example: Automatic Sprinkler → Pump Room → Water Tank → S.A.J Main Water Supply.
   - Only Good / Not Good / N.A. fields can be picked. Readings and quantities cannot.
   - With a previous **service** visit: all its fields are listed, **Not Good first and marked**.
   - With a previous **repair** visit: only the fields that repair visit covered, **Not Done first
     and marked**.
   - With no previous visit: the list comes from the customer's current service setup for that site.
3. **Repair form**: one card per picked field.
   - **Before** (read only): previous result, previous remark and previous photo. If there is no
     photo: "No photo recorded at previous visit". With no previous visit: "No previous visit".
   - **After**: **Done Repair / Not Done** (required), repair remark (required), one photo (required,
     same camera and date/time stamp as service forms). For Not Done the remark is the reason.
4. **Submit** (works offline) → syncs → **Awaiting Approval**.
5. **Admin / Manager** open it under the customer (labelled **Repair**) and either:
   - **Approve** → report number `MFE/RR/YYYY/NNNN` is given and the PDF becomes final, or
   - **Return to technician** with a reason → the technician edits the same visit directly
     (nothing is re-entered from the start) and submits again.
6. After approval the repair visit is locked. No corrections in this first version.
7. The previous visit and its PDF are **never changed** by a repair visit.
8. A repair visit with **Not Done** fields can later be picked as the previous visit of a new repair
   visit; its After photo then becomes the new Before.

### Part C — Remove the old Repair List

All current repair data is test data and may be removed. The old screens, API, local stores and
database tables (migrations 051/052) are removed at the end, once the new Repair Visit works.
Cleaning the other test data on the client PC (test customers, test service visits) is **not** part
of this plan; it is a separate go-live step.

---

## 2. Decisions

### 2.1 Confirmed by you (2026-10-18 / 19)

| # | Decision |
|---|---|
| 1 | Replace the current Repair List; reuse its logic where useful; its data is test data and may be removed. |
| 2 | Repair visits need Admin approval before the PDF is final. |
| 3 | Existing customers only. |
| 4 | Offline creation (option 2) for both service and repair visits, built for service visits first. Phone date/time is acceptable for offline-created visits. |
| 5 | Previous visit: same customer + site, approved only, own visits only (cross-technician later, if wanted), one only, may be a repair visit. |
| 6 | Field list: all fields, Not Good (or Not Done) marked and first. No previous visit → customer's current setup. Unit level is chosen. Only Good / Not Good / N.A. fields. Several systems allowed. |
| 7 | Result is Done Repair / Not Done; photo and remark required for both; one photo per field; Not Done can be submitted. |
| 8 | "No photo recorded at previous visit" label. Only the latest form version (V7) is used. Removing V1–V6 code is a separate task later. |
| 9 | Repair is a separate record with its own PDF. Repair List has In Progress / Completed tabs. Manager/Admin see repairs under each customer labelled "Repair". Separate report-number series. |
| 10 | PDF outline accepted (section 4). |
| 11 | Returned visit: the technician edits it directly and resubmits. |
| 12 | Unstarted repair visits can be deleted, like service visits. |
| 13 | No section remarks (CR-07) in repair visits. No corrections after approval. |
| 14 | Test customers/visits cleanup on the client PC = separate go-live step. |

### 2.2 Proposed defaults — confirmed by the owner 2026-10-19 (all of A1–A12)

| # | Assumption | Why |
|---|---|---|
| A1 | **Service visits stay as they are.** They have no "Return to technician" today (Admin can only Approve or Withdraw). Only repair visits get Return to technician. It can be added to service visits later. | You said "same as service visit", but that step does not exist for service visits yet. |
| A2 | A repair visit has its own visit number `RV-YYYYMMDD-NN` (like `SV-…`), given when synced. | Lets technicians and Admin refer to it before approval. |
| A3 | The report number `MFE/RR/YYYY/NNNN` is given when Admin **approves** (not at Submit). A returned-and-resubmitted visit keeps the same number once approved. | No numbers are wasted on visits that are never approved. |
| A4 | No "Withdraw approval" for repair visits in v1. | Matches "no corrections after approval". |
| A5 | When returned, the technician may change result, remark and photo, and may also add or remove fields. | "Edit directly" is simplest when nothing is locked. |
| A6 | Both Admin and Manager can approve or return, as with service visits. | Same roles as today. |
| A7 | Online-created visits keep the server's date/time; offline-created visits use the phone clock. | Keeps today's behaviour when there is signal. |
| A8 | The phone stores the field lists of the technician's own approved visits (small) automatically. Before **photos** are downloaded when a previous visit is picked online, or with a "Download for offline" button per customer. A missing Before photo on the phone never blocks the repair: the server always uses its own copy in the PDF. | Keeps phone storage small; offline never blocks work. |
| A9 | The server never trusts the phone's copy of the Before data. It reads the previous result/remark/photo from its own records at Submit and freezes it into the repair visit. | Server authority rule in AGENTS.md. |
| A10 | Several repair visits may point at the same previous visit. | No locking needed. |
| A11 | Repair Submit is the "complete" step. There is no separate "Complete Service" button for repair visits. | One form per repair visit. |
| A12 | A field removed from the customer's setup after the previous visit can still be repaired when it comes from that previous visit. | The previous visit is the source of the list. |

---

## 3. Screens

### Technician

| Screen | Content |
|---|---|
| **Repair List** | `+ New Repair Visit` button. Tabs **In Progress** (Draft, Pending Sync, Awaiting Approval, Returned, Needs attention) and **Completed** (Approved, with PDF). Card: customer, site, RV number (or "RV number given when synced"), date, status text, number of fields. |
| **New Repair Visit** | Customer → Site → Previous visit (default "None") → Service Call No → field picker (grouped System → Unit → Section; checkbox per field; "Not Good" / "Not Done" badge; those first; "Select at least one field") → **Create Repair Visit**. Works offline. |
| **Repair form** | One card per field: Before panel (read only) + After panel (Done Repair / Not Done, remark, photo). Auto-save like service forms. **Submit** enabled when every card is complete. Returned visits show Admin's reason at the top. Delete button while unstarted. |

Mobile first: 360 px stacked Before above After; 768 px+ side by side. 44 px targets, 16 px inputs,
no horizontal scroll (`.agents/skills/mobile-first-ui/SKILL.md`).

### Admin / Manager

| Screen | Content |
|---|---|
| **Services Done → customer** | Repair visits listed with the service visits, labelled **Repair**, with status. |
| **Awaiting approval list** (wherever service visits awaiting approval are shown today) | Repair visits appear there too, labelled **Repair**. |
| **Repair visit review** | Header (customer, site, RV no., technician, date, previous visit). Each field: Before / After. **Approve** or **Return to technician** (reason required). Preview PDF (marked "PREVIEW — NOT APPROVED") before approval; final PDF after. |

The old "Repair Review" menu entry is replaced.

---

## 4. Repair Visit PDF (outline — a full mock-up is step 1B)

Same engine, letterhead, fonts, colours, A4 landscape, header and footer as the approved service report
(`docs/report-template/mfe-service-report-template.html`).

**Page 1 — Cover.** Title **FIRE SYSTEM REPAIR REPORT**. Report No. `MFE/RR/2026/0001`. Client, site,
site address, contact, telephone, contract no. Repair visit `RV-20261019-3`, date, arrival time,
service call no., technician. **Previous visit:** `SV-20261011-94, 11 Oct 2026` (or "None").
Approved by and date. Same acknowledgement/signature block as the service report.

**Page 2 — Summary of Repair.**

| No | System | Location / Unit | Item | Previous Result | After Repair | Page |
|---|---|---|---|---|---|---|
| 1 | Automatic Sprinkler | Pump Room | S.A.J Main Water Supply | NOT GOOD | DONE REPAIR | 3 |
| 2 | Fire Alarm | Zone 3, Level 2 | Smoke Detector | NOT GOOD | NOT DONE | 4 |

**Page 3+ — One page per system** (same title bar as the service report: number, system name, location).

| No | Section / Item | Previous Result | After Repair | Repair Remark |
|---|---|---|---|---|
| 1 | Water Tank / S.A.J Main Water Supply | NOT GOOD | DONE REPAIR | Replaced the leaking gate valve. |

Then **Photo Evidence — Before / After Repair**, one pair per field, side by side:

```
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ BEFORE                       │ │ AFTER REPAIR                 │
│ SV-20261011-94 · 11 Oct 2026 │ │ RV-20261019-3 · 19 Oct 2026  │
│ Result: NOT GOOD             │ │ Result: DONE REPAIR          │
│ [photo]                      │ │ [photo]                      │
│ Remark: Valve leaking.       │ │ Remark: Replaced gate valve. │
└──────────────────────────────┘ └──────────────────────────────┘
  1. Water Tank / S.A.J Main Water Supply
```

- No photo at the previous visit: the Before box says **"No photo recorded at previous visit"**.
- Previous visit was a repair visit: Before shows `RV-…`, result NOT DONE or DONE REPAIR, and that
  visit's After photo.
- No previous visit: Previous Result shows "—" and the After photo is shown alone, full width.

Footer on every page: report number, page X of Y, as in the service report.

---

## 5. Data (protected scope — authorised only in the prompts that name it)

### PostgreSQL (new forward migrations; never edit 001–052)

| Migration | Contents | Step |
|---|---|---|
| **053** | `053_offline_service_visits.sql`: additive nullable `inspection_jobs.created_on_device_at` retains the original phone instant for offline creation/retry comparison. Online visits keep NULL. Existing job UUID and configuration revision columns are reused. | 1A |
| **054** | `054_repair_visits.sql`: `repair_visits` (client UUID, RV number, customer, site, creator, configuration revision, service call no., arrival time, visit date/device instant, previous visit kind + id, status, revision, report number, approval fields and final PDF), `repair_visit_items` (client UUID, visit, system/unit/section/field identity + labels, frozen Before snapshot, outcome, remark), `repair_visit_photos` (staged + accepted After photos, hashes, revision and item binding; one accepted photo per item and one staged candidate per item/revision, replaced photos retained as superseded), `repair_visit_events` (append-only: submitted, returned + reason, resubmitted, approved), `repair_visit_reference_sequence`, `repair_report_number_year_counters` (MFE/RR, same allocation pattern as service reports). Persisted visit statuses: `draft`, `awaiting_approval`, `returned`, `approved`; local Pending/Failed/Conflict sync states are separate. | 1A |
| **055** | Drop the old repair tables: `repair_exports`, `repair_approvals`, `repair_finding_reviews`, `staged_repair_evidence`, `repair_records`, `repair_work_orders`, `repair_findings`; remove their stored files safely. | 5A |

### Phone (Dexie / IndexedDB)

| Version | Contents | Step |
|---|---|---|
| **11** | Additive: offline-created service visits store, `rvVisits`, `rvItems`, `rvPhotos` (After Blobs), `rvPreviousVisits` (cached field lists), `rvBeforePhotos`. New outbox entity types. All version 10 stores and data kept. | 1A |
| **12** | Remove old stores `repairFindings`, `repairWorkOrders`, `repairRecords`, `repairAttachments`, `repairBeforePhotos` and old outbox types. | 5A |

### Unchanged

V1–V6 templates and migrations 017/018 (still byte-identical), service visit Final Report and PDF,
Docker Compose, Caddy, `.env`, package-lock files, runtime data. CR-09 Phase A (Complete Repair hidden)
stays as is.

---

## 6. Build steps, in waves

Each wave starts only after the previous wave's steps are **reviewed and committed by you**.
Steps in the same wave touch **different files**, so they can run at the same time in separate chats
in the same folder (see section 7).

| Wave | Step | What | Area | Needs |
|---|---|---|---|---|
| 1 | **1A** | Foundation: migrations 053/054, Dexie v11, shared contracts (API + web types), empty route files registered | API + web schema | — |
| 1 | **1B** | Repair PDF mock-up (HTML + PDF sample) for **your approval** | docs only | — |
| 2 | **2A** | Offline visit creation — server side | API `jobs/` | 1A |
| 2 | **2B** | Repair field catalog + previous-visit list (read endpoints), all 11 V7 systems | API `repairVisits/` | 1A |
| 2 | **2C** | Repair PDF renderer from the approved mock-up | API `repairVisits/report/` | 1A + your OK on 1B |
| 3 | **3A** | Repair visit write API: create, photos, submit, return, resubmit, approve, PDF | API `repairVisits/`, `routes/repairVisits*` | 2B, 2C |
| 3 | **3B** | Offline visit creation — phone side (New Service Visit, local visit, sync order, Needs attention) | web `jobs/`, `sync/` | 2A |
| 4 | **4A** | Technician Repair List, New Repair Visit, repair form, phone storage + sync | web `repairVisits/`, `App.tsx`, `AppShell.tsx` | 3A, 3B |
| 4 | **4B** | Admin/Manager repair review screens, PDF download, "Repair" label in Services Done (components only, no `App.tsx`) | web `manager/repairVisits/` | 3A |
| 5 | **5A** | Switch-over: wire 4B screens + menu, header sync summary, remove old Repair List (web, API, tests, Dexie v12, migration 055) | many shared files | 4A, 4B |
| 6 | **6A** | Final check: all gates, end-to-end in the browser pane, phone test checklist | read + docs | 5A |
| — | **Owner** | Level 3 phone test (offline create, force-close, sync, approve, PDF) | your phone | 6A |

After every implementation step (except 1B and 6A) run the **review prompt** (R) in a fresh chat
before committing.

---

## 7. How many chats at the same time

| Wave | Chats at the same time | Prompts |
|---|---|---|
| 1 | **2** | 1A, 1B |
| 2 | **3** | 2A, 2B, 2C (2C only after you approve the 1B mock-up) |
| 3 | **2** | 3A, 3B |
| 4 | **2** | 4A, 4B |
| 5 | **1** | 5A |
| 6 | **1** | 6A |

- **Total: 11 implementation prompts + 9 reviews = 20 chats. Maximum at the same time: 3** (wave 2).
- Reviews of the same wave can also run at the same time (they only read).
- Same folder is fine because each prompt owns a fixed list of files. The rule in every prompt:
  *if a typecheck/build/test fails in a file you do not own, wait and re-run; do not edit it; report it.*
- No prompt edits `package.json`, `package-lock.json` or shared npm scripts; tests are run by path.
- Shared hub files have one owner each: `apps/api/src/db/migrations.ts` and `apps/api/src/server.ts` → 1A only;
  `apps/web/src/db/localDatabase.ts` → 1A (v11) and 5A (v12); `App.tsx` / `AppShell.tsx` → 4A, then 5A;
  `syncEngine.ts` → 3B, then 4A, then 5A; `ManagerHome.tsx` → 5A.
- Commit between waves so each wave starts from a clean, reviewed baseline.

---

## 8. Main risks and how each step handles them

| Risk | Handled in |
|---|---|
| Offline visit and its forms reach the server in the wrong order | 3B: visit operation first; forms/photos wait until the visit is confirmed by UUID |
| Phone's cached customer setup is out of date | 2A: server compares the configuration revision the phone used; mismatch → explicit "Needs attention" code, never silent |
| Two phones / retries create the visit twice | 2A: idempotent on the client UUID (existing `creation_request_id` pattern) |
| SV numbers given by the phone could clash | Server gives SV/RV numbers at sync; phone shows a placeholder |
| Phone clock wrong | 2A: reject dates far in the future / too old with a clear message (limit set in 2A); arrival stays phone clock as today |
| Before data tampered on the phone | 3A: server reads Before from its own records and freezes it at Submit |
| Field identity across repeated units | 2B: unit identity by row UUID / location ID, never by list position |
| Photo upload ordering | 3A/4A: After photos staged before the visit Submit, as in the V7 pattern |
| Returned visit edits racing with approval | 3A: revision number on every submit/approve/return; stale revision is refused |
| Old repair code removal breaks something | 5A runs last; old tests removed together with the code they cover |
| Large feature, long review | Small waves, a review after every step |

---

## 9. Definition of Done for the whole feature

- Technician can create a service visit **and** a repair visit with no internet, fill it, take photos,
  Submit, force-close the PWA, reopen, reconnect, and see it sync with the exact same UUID.
- Repair visit flow: previous visit optional, field picker correct for all 11 V7 systems, Before/After
  shown, Done Repair / Not Done with required photo + remark.
- Admin/Manager can Return with a reason; the technician edits directly and resubmits; Approve gives
  `MFE/RR/YYYY/NNNN` and the final PDF matching the approved mock-up.
- The previous visit and its PDF are byte-for-byte unchanged.
- Old Repair List fully removed; no old repair tables, stores, routes or tests left.
- All standard gates pass; V1–V6 untouched; `git diff --check` clean; P0 = 0, P1 = 0.
- Level 3 phone test done by you (not claimed by any agent).
