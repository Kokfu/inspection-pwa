# CR-09 / CR-10 — Repair List build plan

Date: 2026-10-12 (Asia/Kuala_Lumpur).
Status (2026-10-13): B1/B2/B3/C1/C2 and Phase C acceptance preserved; completed C2 prerequisite remains chat 01a133ed-1726-7e40-8677-edc5b8c8b803, turn 01a13473-551b-7f51-b4a9-430a139d384a. D review accepted after both demonstrated fixture blockers were remediated with concrete regression evidence. Final cold gates exit 0, ALL GATES PASS, zero skips: 68 core + 24 original compatibility + 14 healthy-online browser cases; D integration 11/11. Current four-page PDF and three-width UI inspected. P0/P1/relevant P2 0/0/0. D INDEPENDENT REVIEW ACCEPTED: Y; READY FOR OWNER LEVEL 3 ACCEPTANCE: Y. Level 3 NOT RUN; no deployment/runtime migration/backfill. Other inherited validation debt and production/precache follow-up retain their owners. See [final D acceptance evidence](CR09_D_IMPLEMENTATION_REPORT.md#final-fixture-remediation-and-d-acceptance--2026-10-13).
Start here: [copyable implementation prompts](CR09_CR10_REPAIR_BUILD_PROMPTS.md).
Governing rules: `AGENTS.md` and `.agents/skills/codex-task-brief/SKILL.md`.

This is the implementation specification, not evidence that the feature works.
Build one checkpoint at a time, review it, then proceed. The owner performs all Git operations.

## 1. Owner decisions — confirmed 2026-10-12

These replace the older CR-09 defaults in the October client tracker.

| ID | Confirmed decision |
|---|---|
| D1 | An After photo is required for each repaired part. |
| D2 | A repair remark is required for each repaired part. |
| D3 | One After photo per part. |
| D4 | Technician navigation contains Repair List; Admin/Manager have review access. |
| D5 | A separate repair PDF follows the service-visit PDF's visual format. |
| D6 | The same original finding can be repaired again after an approved repair. |
| D7 | Another technician can perform the repair. |
| D8 | Approval is per part, grouped per service. |
| D9 | Historical Poor findings without an original photo can be repaired; explicitly label the missing Before photo. |
| D10 | An administrative correction requires a reviewer decision about repair eligibility; it does not automatically cancel it. |
| D11 | A PDF may contain an approved subset while other parts await approval. |

### Operational interpretation for implementation

- A service group means one original accepted visit/job + one `systemKey`. Show its customer, site, system, unit, and section labels. Never combine different source jobs/systems in a submission group or PDF.
- A repair part is one failed result field, not a section-wide result. A section can contain several failed parts; each has its own After photo, remark, record, and approval decision.
- A repair is a follow-up to accepted inspection authority. It does not create a new service visit, reopen a closed visit, or constitute a full re-inspection.
- Assignment is a repair-specific server authority. Implementation default: Manager (`admin`) assigns a service repair work order to an active technician; Admin (`supervisor`) and Manager review parts. The original technician can start work for their owned source service without a separate Manager assignment.
- Another technician sees only services assigned through repair work orders and the source detail needed for their repairs. Do not grant access to unrelated inspections/customers or change the existing job ownership predicate.
- Original-technician self-start is allowed only when it does not bypass a live assignment to another technician. Resolve service work orders transactionally; a revoked/reassigned technician cannot regain repair access by opening another self-start order. Manager can explicitly assign additional orders when different technicians handle different parts.
- Assignment/reassignment is online and audited. Reassignment does not change who authored/submitted prior repairs. New writes from a revoked assignment fail safely while local work is preserved.
- Repeat repair uses an explicit **Start Another Repair** action. It produces a new UUID and sequence linked to the same original finding and, where applicable, the preceding repair. It never overwrites an earlier approved repair.
- Multiple technicians may repair different parts of a service. One finding may have at most one submitted repair awaiting decision at a time; earlier approved history does not permanently block another cycle.
- Before always means the ORIGINAL accepted finding/photo/remark. Show previous repair history separately; never silently substitute a preceding After photo as the original Before.
- PDF export is scoped to one service and an explicit selected set of approved repair records. Older cycles remain exportable as history; duplicate cycles for one finding require explicit selection and clear sequence labels.

These are implementation choices where the owner did not prescribe the mechanism. They do not replace D1-D11.

## 2. Existing implementation inspected

The 2026-10-12 source inspection found `complete_repair` in 52 web source files and 12 API files excluding tests. Phase A's earlier audit recorded 50 web files.

- V7 values: `good`, `not_good`, `complete_repair`, `na`. Historical forms retain their frozen legacy values (`good`, `poor`, `not_relevant` where permitted).
- V7 `not_good` and `complete_repair` both require the field's own remark + photo. Good/N.A. may carry one optional photo under CR-01.
- There is no independent repair record or repair approval workflow today. Complete Repair is an inspection result.
- Correction events are append-only overlays. They never rewrite the original accepted payload.
- Final Report displays Complete Repair and preserves its evidence. Not Good/Poor gives FAILED; otherwise Complete Repair gives REFER DETAIL PAGE.
- The current Dexie version is 9, with per-user business databases and an existing sync outbox.
- Migration 050 is the latest inspected migration. The client roadmap reserves 051 for CR-09; recheck before creating it.
- Stored roles: `inspector` = Technician, `supervisor` = displayed Admin, `admin` = Manager. Do not rename enum values or change unrelated permissions.

Reference files:

| Area | Existing reference |
|---|---|
| Phase A entry switch | `apps/web/src/inspectionControls/resultEntryPolicy.ts` |
| Phase A audit/tests | `docs/testing/CR09_REPAIR_DISABLED.md`, `CR09_REPAIR_DISABLED_HITS.md`, `apps/web/tests/repair-disabled.spec.ts` |
| Frozen V7 values | `apps/api/src/inspections/templates/masterServiceReportV7.ts` |
| Field evidence adapters | `apps/api/src/inspections/evidence/v7EvidenceContracts.ts` |
| Evidence staging | `apps/api/src/inspections/evidence/v7StagedEvidence.ts` |
| Atomic parent acceptance | `apps/api/src/sync/co2FormInstanceSync.ts` (shared CO2/Wet Chemical path), `fireAlarmV7Acceptance.ts` |
| Accepted authority | `apps/api/src/inspections/acceptedMasterSystemDetail.ts`, `fireAlarmAccepted.ts` |
| Corrections and locking | `apps/api/src/corrections/inspectionCorrections.ts`, `apps/api/src/routes/managerCorrections.ts` |
| Existing job ownership | `apps/api/src/jobs/technicianOwnership.ts` |
| Approval pattern | `apps/api/src/reports/reportApproval.ts`, `apps/api/src/routes/reportApprovals.ts`, migration 045 |
| Local persistence/sync | `apps/web/src/db/localDatabase.ts`, `apps/web/src/sync/syncEngine.ts` |
| Navigation | `apps/web/src/App.tsx`, `apps/web/src/layout/AppShell.tsx`, Manager navigation and `manager/roleAccess.ts` |
| Report/PDF appearance | `apps/api/src/reports/reportViewModel.ts`, `template/`, `pdf/htmlToPdf.ts`, `docs/report-template/` |

Some older skill passages describe an earlier result/evidence policy. Preserve the actual frozen four-state V7 contract and current CR-01 optional-photo behavior; do not regress them to an older three-state interpretation or drop optional photos.

## 3. Authority, eligibility, and lifecycle

### Original finding

Eligibility is derived server-side from a validated accepted field with `not_good` or legacy `poor`. Use the record's exact frozen template/configuration and version-specific reader.

Stable identity: accepted form-instance ID + canonical field path. Preserve source client UUID, job, system, location/unit identity, row UUID, original result/remark, Before photo reference/hash, template tuple, and contract fingerprint.

For repeatable rows, use `rowUuid`, never array index or visible row number. Map canonical evidence paths and response paths explicitly through a system/version adapter; they are not always the same string. Do not infer repair candidates from labels, generic recursive string searches, or the report's three-state system summary.

Cover all 11 V7 result-bearing systems and supported historical Poor formats. Portable Fire Extinguisher's quantity-only controls are not repair findings. Do not make Draft/Pending data, Good/N.A. optional photos, or historical Complete Repair values automatic repair candidates.

Missing historical Before evidence is allowed only when the historical contract permits absence. A required V7 photo that is missing/corrupt is an integrity failure, not a legacy exception. Record historical absence explicitly and freeze that fact at submission.

Finding backfill is explicit, idempotent, batched, and non-destructive. Execute it only on disposable fixtures during implementation; delivery must not run a backfill or migration on runtime/customer data.

### Repair lifecycle

Local sync state: Draft / Pending / Syncing / Synced / Failed / Conflict.
Server review state: awaiting_approval / approved / rejected / withdrawn.
Source eligibility state: eligible / needs_review / not_required (server-derived from reviewed source revision).

1. Open findings appear in the service Repair List. Approved repairs appear in history.
2. Technician selects failed parts; each part's draft can be saved offline independently.
3. Submit freezes each part and its one-photo manifest; an explicit batch can contain several parts of the same service.
4. Evidence stages before parent repair submission. Server submission receipt is not approval.
5. Reviewer approves/rejects individual parts. Rejection requires a reason.
6. A rejected record remains immutable. Correction/resubmission creates a new repair UUID linked to the rejected record; use the existing persisted photo workflow safely and do not mutate frozen bytes.
7. Another cycle can start after a prior cycle is approved/rejected/withdrawn. Previous decisions, photos, and documents remain available.
8. Approving a part does not change the original inspection result, summary, or ordinary service PDF.

A correction never automatically cancels a finding or rewrites Before. Compare the current source correction revision with the revision last reviewed for repair eligibility. If changed, show needs_review and require an explicit continue-repair/not-required decision with a reason. Keep drafts editable and retained; block new submission/approval/export until the source eligibility review is current. Previously issued documents and past repair decisions remain historical facts.

Use the existing `inspection_corrections:<formInstanceId>` advisory lock when comparing/recording source revisions, with a consistent lock order before repair finding/record locks. Do not change correction validators or result enums. Cover correction-versus-submit/approve races. Export reads one consistent authority snapshot; never assemble parts and decisions from different revisions.

## 4. Protected schema scope

### PostgreSQL — proposed migration 051

| New table | Why it is necessary |
|---|---|
| `repair_findings` | Stable original-field references and server-created Before metadata. Unique source form-instance ID + canonical path. Frozen identity/result/remark/evidence; mutable lifecycle caches, if any, are projections only. |
| `repair_work_orders` | Repair-specific service grouping and assigned technician, enabling D7 without widening original job ownership. Keep immutable source service identity; audit assignments/reassignments using existing audit events. |
| `repair_records` | One immutable submitted part per UUID, work order, finding, cycle sequence, predecessor reference, remark, performed time, actor, source revision, manifest, and fingerprint. Multiple historical records per finding allowed. |
| `staged_repair_evidence` | After-photo session ownership, bytes/hashes/metadata, staged state, and binding to a repair record. One photo per repair part. |
| `repair_approvals` | Append-only per-record decisions with request UUID/fingerprint, sequence, actor, role, server time, and reason. |
| `repair_finding_reviews` | Append-only continue/not-required eligibility decisions bound to the exact original source correction revision. Separate from approval of repair workmanship. |

Use existing customers/jobs/users/accepted-instance tables as references; no data rewrite. Use restrictive deletion behavior for authority/history. Parameterized SQL and strict request validation throughout.

Database guards: globally unique client/photo UUIDs, scoped mutation identities, unique finding identity, unique finding cycle sequence, unique staged photo slot per repair UUID, and at most one awaiting-approval record per finding. Any mutable active-state projection used for a partial unique index must update atomically with append-only decisions. Approved historical rows must not prevent future cycles. Translate concurrency/unique violations into safe conflict responses.

Accepted After-photo source/stored hashes cannot satisfy different repair records within the original job + system. Keep this repair scope separate from inspection-evidence indexes; check a new After photo is not the same bytes as that finding's available Before photo. Different jobs may use identical image bytes. Test identical source and normalized hashes, not just UUIDs. Do not weaken existing inspection uniqueness or add global hash uniqueness.

### Dexie — next version (10 if version 9 is still current)

| New store/change | Purpose |
|---|---|
| `repairFindings` | Authorized offline finding cache including source revision, original metadata, missing-photo flag, version, and fetch time. |
| `repairWorkOrders` | Downloaded assignment authority and service grouping for original/other technicians. |
| `repairRecords` | Local per-part drafts/frozen submissions, UUID, work-order/finding references, actor, predecessor, sync/review states, timestamps, and receipts. |
| `repairAttachments` | After-photo Blobs and immutable upload metadata keyed by photo UUID + repair UUID. |
| `repairBeforePhotos` | Downloaded authorized accepted Before-photo Blobs and integrity metadata. |
| Existing `syncOutbox` | Add repair evidence and parent operation types; reuse its retry and active-operation pattern. |

Preserve all version 9 stores, indexes, Blobs, pending/failed operations, and per-user isolation. The upgrade is additive; no reset/wipe. Cache metadata expiry is not authority to delete unsynced work or disable entry.

### Phase D PostgreSQL

Add `repair_report_exports` in the next free forward migration (provisionally 052). It freezes report UUID/number, source service identity, selected approved repair UUIDs and approval sequences, source eligibility revision, company/header presentation data, and issued time. Use a persisted export request UUID/fingerprint so retries return the same export identity; reject changed content under the same request UUID.

Reuse the existing report number convention without sharing its job-only report identity. Enforce authorization over every selected record and bind foreign references or strictly validate the immutable selected manifest. Later withdrawals do not rewrite an issued report; mark its current approval validity explicitly and forbid silently reissuing it as current.

Do not edit applied migrations, V1-V7 templates, migration 017/018, Compose, Caddy, `.env`, package locks, runtime directories, or production data. Numbers and exact DDL must be rechecked at the start of B1/D.

## 5. Evidence and sync contract

Reuse V7's proven capture/normalization, frozen-manifest, retry, and transaction patterns, not its inspection-specific parent bindings. Existing V7 tables require a form-instance binding and staging assumes an open job. Repair staging needs its own tables/routes and accepted-source authority so closed source visits are allowed.

1. Generate `clientUuid`, `photoUuid`, and operation IDs with `crypto.randomUUID()`. Retain them across retries.
2. Capture through existing camera/gallery watermark/compression helpers. Store JPEG Blob and metadata in IndexedDB before any API call. Before photos are downloaded unchanged; never re-watermark them.
3. Local Submit transaction writes frozen repair content, exactly one manifest photo, and evidence/parent outbox operations. No manifest built from all stored Blobs.
4. Sync stages each repair's After photo first. Immutable identity includes repair/work-order/finding IDs, original job/system/field identity, contract version, actor, capture metadata, and hashes.
5. Same photo UUID + same fingerprint returns its exact receipt. Different bytes/identity under the same UUID conflicts. No inspection/repair entity-type mixing.
6. Parent transaction verifies original accepted authority, current assignment, reviewed source revision, evidence identity/integrity, exact manifest, and active-record uniqueness. Insert repair + bind photo + claim awaiting approval atomically; failure rolls all back.
7. Check current authorization and actor before replay. For authorized exact retries, return the same submitted authority before considering changed lifecycle state; closed source visits are legitimate. After revoked assignments, never delete local work or falsely confirm it.
8. Confirm only exact repair/photo/operation UUIDs and expected fingerprints. Generic HTTP 200 is insufficient. Partial batches confirm only their successful parts.
9. Controlled batches and one sync coordinator; retry on launch, manual Sync, network recovery, and safe retry intervals. Recover interrupted Syncing/Uploading states without discarding frozen data.
10. Approval is online and append-only. Use request UUID/fingerprint + expected review/source revision, locking, per-part events, and audit logging. Do not use existing whole-visit report approval as repair approval.

Use persistent upload storage outside container lifecycle. Staged/accepted repair files must participate in safe storage reconciliation: do not let existing orphan-file cleanup delete repair files it cannot yet classify. Re-inspect current attachment reconciliation work and add only the repair-specific integration required; do not refactor unrelated storage.

## 6. UI and offline behavior

- Technician sidebar/mobile menu: Repair List beside New Service Visit. `AppShell.tsx` supplies rendering/icons; `App.tsx` supplies links, routes, hashes, and page selection.
- List: customer -> original visit -> service -> unit/section -> failed part. Show Open, Draft, Pending Sync, Awaiting Approval, Needs Review, Rejected, and Repaired history with text, not color alone.
- Another technician downloads their assigned service's work order, findings, and Before photos. Display offline-ready preparation and cached authority dates.
- Section selection displays only its failed parts. Each has an immutable Before panel and editable After panel with one photo + required remark. Previous cycles are a separate history disclosure.
- At 360px stack Before/After; at 768px+ use two columns. Existing design tokens, 44px targets, 16px inputs, visible focus, safe-area-aware bottom actions, and no horizontal page scrolling.
- Offline never disables photo capture, selection, typing, Draft save, or local Submit. Persist missing-download state clearly. Historical no-photo and an existing photo not yet downloaded are different states.
- Offline drafts may continue against cached authority. Later assignment/source changes can block server confirmation; preserve them with a visible error/review path.
- Admin/Manager review is online: service-group list, per-part comparison/actions, source-eligibility review, rejection reason, and assignment controls for Manager. No whole-service approval side effect.
- PDF selection allows an approved subset; pending/rejected/withdrawn parts are clearly excluded. Select cycles explicitly and display what will be exported before creating the issued document.
- Failed authoritative refresh must show failure, never masquerade as a fresh successful review/PDF authority. Cached data is informational only for reviewers.

## 7. Historical/server compatibility

Phase A stays UI-only: the server continues accepting `complete_repair` wherever the frozen contract permits it, including old drafts/clients and valid corrections. Existing evidence/auth/job-state validation stays intact.

No server-wide ban, result rename, template mutation, automatic draft upgrade, or accepted record rewrite is part of B/C/D. Accepted detail and ordinary service PDF continue rendering old Complete Repair. Normal/Test/Isolation remains unchanged.

Repair approval never changes original inspection results, completion, configuration, ordinary report condition, or ordinary report approval. Repair PDF authority is original accepted/frozen source + submitted immutable repair + bound accepted After evidence + current eligible-source review + selected per-part approvals + frozen export manifest. No Draft/Pending or staged-but-unbound bytes enter an issued PDF.

## 8. Ordered build checkpoints

| Step | Scope | Completion proof | Status |
|---|---|---|---|
| A | Recoverable Complete Repair entry disable | Existing audit/commit and compatibility tests | DONE (`d0c371a`) |
| B1 | API data foundation, finding readers/backfill, work orders/assignment, source eligibility reviews | Migration on disposable DB; strict authorized reads, repeat-cycle identities, cross-technician boundaries, correction races | IMPLEMENTED — 22 reader + 10 integration tests pass; web production build and 3 PWA contract tests pass; owner approved baseline exception `10f3bbb`; frozen legacy Fire Alarm V7 P1 repaired; B1 re-review passed in chat `01a12ef9-0dfd-7962-bcde-5195d5444184`, READY FOR B2: Y, P0/P1/P2 = 0 ([report](CR09_B1_IMPLEMENTATION_REPORT.md)) |
| B2 | API staged After evidence, atomic per-part submission, per-part approval/rejection/withdrawal | Required evidence, exact idempotency, transaction/race proofs, repeat approved cycle | INDEPENDENT RE-REVIEW PASSED — completed chat `01a12f37-2e3f-7ac1-a26d-d88b1a306dc7`; SAFE FOR B2 REVIEW ACCEPTANCE: Y; READY FOR B3: Y; P0/P1/P2 = 0. B3 reran B2 18/18 and standing gates ([report](CR09_B2_IMPLEMENTATION_REPORT.md)) |
| B3 | Dexie repositories, offline cache, repair outbox and sync | Upgrade preservation, evidence-first receipts, stale callers, interrupted/partial recovery | INDEPENDENT RE-REVIEW PASSED — completed chat `01a13119-c9f6-77d3-ba75-47a8675eac6a`, turn `01a1312c-a80e-7c71-a0c6-1e9b7fbe9d24`; all prior findings closed; P0/P1/P2 = 0; Phase B accepted; READY FOR C1: Y ([report](CR09_B3_IMPLEMENTATION_REPORT.md)) |
| C1 | Technician navigation + selected-part Before/After form | Mobile/offline browser flows for original and assigned technician, repeat repair action | INDEPENDENT RE-REVIEW PASSED — completed chat 01a13315-ff13-7ce3-b93e-af5065f3ef93, turn 01a133ad-d29d-76b1-aee5-9c9c57248b59; P0/P1/P2 0/0/0; READY FOR C2: Y. Earlier report pending-review wording is historical ([C1 report](CR09_C1_IMPLEMENTATION_REPORT.md), completed review evidence in [C2 report](CR09_C2_IMPLEMENTATION_REPORT.md)) |
| C2 | Admin/Manager review + assignment UI + repaired history | Per-part decisions within service groups; correction eligibility; no unrelated access widening | INDEPENDENT REVIEW ACCEPTED — completed chat 01a133ed-1726-7e40-8677-edc5b8c8b803, turn 01a13473-551b-7f51-b4a9-430a139d384a; all three C2/Phase C/READY FOR D flags Y; P0/P1 0/0, inherited Phase A P2 retained. Earlier implementation-report pending-review wording is historical |
| D | CR-10 approved-subset repair PDF + export UI/history | Embedded Before/After bytes, approval authority, layout, export replay, normal PDF regression | REVIEW ACCEPTED — fixture blockers remediated and regression-proven; final full cold gates PASS, exit 0, zero skips; 68 core + 24 compatibility + 14 healthy-online cases; 11 D integration checks and standing gates PASS. D INDEPENDENT REVIEW ACCEPTED: Y; READY FOR OWNER LEVEL 3 ACCEPTANCE: Y; Level 3 NOT RUN ([report](CR09_D_IMPLEMENTATION_REPORT.md#final-fixture-remediation-and-d-acceptance--2026-10-13)) |
| Acceptance | Explicit later Level 3 phone/deployment checkpoint | Actual offline force-close, reconnect, Docker persistence, HTTPS, real phone PDF proof | NOT RUN |

B1-B3 together are Phase B; C1-C2 together are Phase C. Each checkpoint gets its own implementation report and read-only review before the next starts. Do not rerun A as an implementation task.

### B1 — build first

Create/register the additive 051 migration and immutable identities. Implement strict version-specific finding extraction, scoped GET/detail, Manager work-order assignment, source eligibility reviews, and a safe idempotent finding materializer/backfill callable in tests. No upload, repair submission, or repair approval route until B2 can enforce evidence atomically. No web/Dexie/UI/PDF changes.

### B2

Use B1 tables and authorization; build staged repair evidence + submission + per-part decisions. Include repair-specific file reconciliation classification before producing persistent repair files. No fake form-instance rows and no inspection validator relaxation. No web/Dexie/UI/PDF changes.

### B3

Upgrade the per-user local DB, add repositories and reference download/cache, and extend sync. Deliver harness tests before UI. Wire actor/workspace guards, outbox dispatch/recovery, and authenticated repair-specific receipts; keep new operation types out of the generic inspection batch. No navigation/screens/PDF changes.

### C1 / C2

Build technician UI first, then review/assignment UI. Follow mobile-first skill and applicable UI/React companion guidance. API changes limited to demonstrated missing DTO/contract pieces needed for this specification; document them and their tests. Do not invent a second repair record or attachment pipeline.

### D

Separate repair report model/template and issued-export history. Reuse existing service-report branding/header/footer/fonts/styles/PDF engine; body shows only selected approved repairs, original remarks/photos, After remarks/photos, source identities, cycle numbers, technician/date, and reviewer/date. Existing service report output must not change.

## 9. Verification and Definition of Done

For B1-D: Level 2 task-specific checks plus `.agents/skills/codex-task-brief/SKILL.md` standard gates. Each report must identify tests actually run and missing proof, not treat SKIP as PASS. Gates do not authorize production migration/backfill or deployment.

API integration runs only on a freshly started disposable Postgres at `127.0.0.1:55432`. Reproducible commands must override BOTH `DATABASE_URL` and `SEED_INTEGRATION_DATABASE_URL`, set test environment, establish PDF Chromium when relevant, and run suites in separate processes where pools close. Verify the disposable target before writes. Never runtime Postgres, `down -v`, volume deletion, or system prune.

| Area | Required proof |
|---|---|
| Findings | All 11 V7 systems; historical adapters; distinct parts/row UUIDs; no Good/N.A./Complete Repair candidates; missing historical photo vs corrupt required photo. |
| Authorization | Unauthenticated/foreign/unknown denied; source owner and assigned other technician succeed; unassigned users cannot view Before bytes or submit; assignment revoke + replay rules; reviewers cannot submit disguised technician work. |
| Repeat cycles | Approved first cycle then new UUID/sequence; unchanged prior evidence/approval/PDF; predecessor validated; concurrent new cycles cannot both await approval for the same finding. |
| Source corrections | Original Before preserved; explicit eligibility decision; stale revision rejected; correction/submit/approve races serialize; old decisions remain history. |
| Evidence | One required own photo + nonblank remark; missing/extra/mismatched/foreign data rejected; same UUID changed bytes conflicts; scoped source/stored hash uniqueness; cross-job independence; cleanup preserves staged/accepted repair files. |
| Submission | Frozen payload/manifest; evidence-first; exact UUID/fingerprint receipts; identical replay; duplicate races; parent+photo bind rollback; closed source visit accepted; timeout retry; partial batches. |
| Review | Independent approved/rejected parts in one service; expected revision; repeat request; different request content conflicts; rejection reason; no original-service report/completion changes. |
| Local data | Offline capture/type/save/Submit; version upgrade with preexisting pending/failed inspection/photo data; offline reload; interrupted sync; per-user workspace changes; unsynced Blobs retained. |
| UI | 360x800 / 768x1024 / 1280x800; no page overflow; accessible labels/focus/errors; required per-part evidence; repeat action; historical missing-photo label; cached vs authoritative states. |
| Repair PDF | Approved subset; rejected/pending/withdrawn excluded; exact source/repair/approval linkage; both images embedded; legitimate historical missing-photo label; integrity failure closed; safe escaped remarks; pagination; no mixed-service payload. |
| PDF history | Export request replay returns same number/selection; concurrent withdraw/export and source-correction/export; issued history stable; later withdrawal validity explicit; ordinary report PDF unchanged. |
| Regression | Historical V1-V5, Fire Alarm V6, CO2 V1, Wet Chemical V4; Phase A old saved Complete Repair; current optional-photo V7 behavior; normal inspection sync/report/approval paths. |

Finish each checkpoint with the standing DoD table, files changed/reasons, P0/P1/P2 findings, cold reproducible test commands, historical-file status, `git diff --check`, and explicit next-checkpoint readiness. Do not stage or do any Git mutation. A checkpoint is not complete with a relevant open P0/P1.

Documentation-only preparation on 2026-10-12 did not run implementation gates or phone tests. Historical files were not modified by that preparation; byte-exact baseline certification belongs to the implementation/review gates.

## 10. Rollback and release

- A: restore the retained UI switch/marked code if the owner wants it; keep frozen contracts.
- B: disable new repair writes while preserving tables/files/cache/outbox. Maintain a compatible retry/recovery route for already queued data. Never undo migration by deleting customer data.
- C: hide new entry while preserving existing repair access and synchronization. Do not deploy an old Dexie build that cannot open the upgraded local DB; use a compatible forward build with entry disabled.
- D: disable new exports while keeping approved records and issued document history.
- Deploy compatible API/storage support before web entry. Existing roadmap notes the A-to-C repair entry gap; Phase C closes that client workflow gap.
- Only at explicit Level 3 acceptance: production PWA build, Docker/start/health/persistence, actual offline typing/camera/Submit, phone force-close/reopen, reconnect idempotency, alternate technician assignment, per-part approval, approved-subset PDF, and HTTPS checks. Do not claim these from harness tests.

## 11. Starting checkpoint

Start **B1 only**, using the B1 prompt in the companion file. Owner decisions D1-D11 are settled; do not ask them again. Stop after B1's report and review. This plan authorizes no implementation during the documentation-preparation task.
