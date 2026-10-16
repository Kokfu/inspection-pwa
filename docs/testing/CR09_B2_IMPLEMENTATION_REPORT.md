# CR-09 B2 implementation report

Date: 2026-10-12 (Asia/Kuala_Lumpur).

Status: Sol's B2 P1/P2 findings are remediated; full cold gates and final cold focused verification pass with zero skips. **SAFE FOR B2 RE-REVIEW: Y.** Independent B2 re-review remains pending. Phase B is not complete: B3 remains.

The original implementation narrative below is retained as checkpoint history. See the final **Sol B2 review remediation** section for the current fixes, verification and verdict.

## B1 prerequisite and authorized scope

Before editing, the completed **Review B1 implementation** chat was read: chat `01a12ef9-0dfd-7962-bcde-5195d5444184`, completed re-review turn `01a12f0d-c6b7-7922-8433-77326d32de36`. Its final verdict is **READY FOR B2: Y**, **SAFE FOR B1 REVIEW ACCEPTANCE: Y**, **P0: 0 / P1: 0 / P2: 0**, **NEW DEFECTS: N**. It closed the frozen legacy Fire Alarm V7 compatibility P1 and reran every cold gate with zero skips. The B1 report's older pending-review wording is historical; this report and the checkpoint plan record the completed re-review.

Read AGENTS.md, task-brief, v7-evidence-acceptance, backend-api-security, sync-engine, indexeddb-data-model, offline-first-pwa and pwa-release-testing, plus the complete repair plan/prompts and B1 implementation report. D1–D11 remain confirmed. B2 uses B1 migration 051 unchanged and the same accepted finding, repair assignment and eligibility authority. No additional schema requirement or migration was needed. The owner-approved `10f3bbb` V6 fix and production-build/precache follow-up remain intact.

## Behavior and API contract

All routes require the existing authenticated role/session middleware, use private/no-store responses, preserve B1's expected-user header check, and verify the actor's active role in PostgreSQL. Technician writes require an active matching repair work order and its expected revision. They never borrow inspection ownership or require an open source visit. Manager/Admin review authority does not grant technician submission.

| Route | Contract |
|---|---|
| POST `/repairs/evidence/stage` | Technician; multipart exactly `metadata` JSON + one `file` JPEG. Bounded preflight; existing normalization, checksums and durable move helpers. Exact photo/repair UUID + canonical fingerprint receipt. |
| POST `/repairs/submissions` | Technician; `{jobId,systemKey,parts}`; 1–100 parts, one service, no duplicate finding/record IDs. Strict envelope validation before writes; independent atomic part results. |
| POST `/repairs/records/:clientUuid/decisions` | Admin/Manager; strict request UUID, expected decision sequence and current source revision; approved/rejected/withdrawn append-only events. |
| GET `/repairs/records/:clientUuid` | Current repair-service authority; immutable submission, manifest, evidence receipt, decisions and distinct review state. No internal paths. |
| GET `/repairs/records/:clientUuid/after/content` | Current repair-service authority; only bound accepted After evidence, verified JPEG bytes/size/hash/dimensions/path. Never unbound staged photos. |

Shared stage/part identity is `{findingId,workOrderId,jobId,systemKey,expectedWorkOrderRevision,expectedSourceRevision,sourceFingerprint}`. Obtain the server fingerprint from the additive `sourceFingerprint` property on finding/service detail. Clients cannot reconstruct it from public Before metadata, which intentionally omits internal storage paths. The fingerprint covers the exact original form/client/template/configuration/contract/row/path/Before identity and historical absence label. Staging persists the server-derived field/template/contract and absence metadata alongside the strict client capture metadata.

Photo metadata additionally requires `{photoUuid,repairUuid,captureSource,capturedAt,sourceSha256,sizeBytes,width,height}`. Times are exact valid millisecond UTC strings; numbers are safe positive integers; JPEG input is at most 2 MiB / 1600 pixels per edge. Source bytes must agree with claimed checksum/size/dimensions. Normalized stored bytes are immutable and separately hashed. No photo may equal its finding's available original Before source or normalized hash.

A submitted part additionally requires `{clientUuid,cycleSequence,predecessorUuid,remark,performedAt,manifest}`. `manifest` has exactly one `{photoUuid,fieldPath,sourceSha256}` entry for that own original finding; remark is nonblank and at most 4000 characters. The next cycle must name the immediately preceding repair and the next sequence; that predecessor must already have a decision. New/rejected/repeated repairs use new UUIDs and photos. Old records/events/photos are retained.

The parent transaction verifies frozen source integrity, current source eligibility, assignment/actor, exact staged manifest, capture authority and bound file integrity, then inserts the immutable record, binds the photo and audits success atomically. Source/stored image uniqueness is scoped to original job + system using B1's separate repair indexes. Conflicts roll back the parent and leave evidence staged. Different jobs may reuse identical bytes. Per-part receipts contain exact client UUID, fingerprint and source/service/cycle authority; a generic HTTP 200 is not a confirmation for failed parts.

All B2 mutations lock service, then the source correction advisory lock, then finding/record/evidence authority. Competing work orders use B1's same service lock; correction writers use the same existing correction lock. Source review remains explicit: a changed correction revision blocks new submission/approval until a current eligible decision. Rejection and withdrawal require a reason and the current source revision; approval additionally requires eligible source state. Awaiting records can be approved/rejected/withdrawn; an approved record can later be withdrawn. Rejected/withdrawn records are terminal. Expected decision sequence and immutable request fingerprints serialize reviewer races.

Current actor/assignment/original integrity are checked before replay. Authorized exact committed submission/evidence retries return their original receipt before changed source/review lifecycle checks. Revoked, reassigned or inactive actors cannot replay themselves back into authority. Decision replay returns the same event UUID/sequence. Current approval source revision is retained in the transaction's audit event alongside the decision/request UUIDs and fingerprint.

Reads/approval reconstruct the submitted fingerprint from the immutable record and photo input, verify the exact accepted binding/manifest and file bytes, and fail closed on corruption. They never quietly substitute cached, current-template or corrected Before data. Repair history does not rewrite original accepted inspection/results/ordinary reports or reopen closed jobs.

Reconciliation includes both staged/accepted `staged_repair_evidence` rows and the `uploads/repairs` tree. Existing inspection-table reconciliation and durability work are preserved. It classifies missing/size/hash/orphan conditions without deleting repair files. A durable move followed by DB failure may leave an orphan for diagnostics; replay can safely restage that same slot. Temporary source/normalization files are cleaned on success, malformed uploads and failed staging.

## Original implementation Definition of Done and actual results

Full cold standing run: **exit 0 / ALL GATES PASS / zero skips**, recorded in `logs/cr09-b2-gates.log`. After final timestamp-precision hardening, the cold focused runner also completed **exit 0 / ALL GATES PASS / zero skips**, recorded in `logs/cr09-b2-focused.log`: API typecheck/build, B1 readers 22/22, B1 integration 10/10, B2 integration 16/16, storage reconciliation 1/1 and whitespace. **B2 integration: 16/16** (parent plus 15 focused subtests). The final fixtures use nonzero `.123Z` milliseconds across replay, reads and decisions; PostgreSQL Date values retain those milliseconds when reconstructing fingerprints. Both runs include committed-response-loss and accepted-metadata-integrity proofs. Development failures were corrected: test type annotations, Busboy's exact-parts limit, and a Before-photo test that mistakenly expected identical normalized bytes to change authority. Final inspection also corrected Date-to-string precision loss before review handoff, with all final focused cases using nonzero milliseconds. No validator was weakened.

| DoD item | Result | Proof |
|---|---|---|
| B1 green gate before implementation | PASS | Completed review quoted above, no relevant open P0/P1 |
| Strict identity/manifest/enums/UTC/remark/batch scope | PASS | Focused integration cases |
| Evidence-first, missing/extra/foreign evidence and immutable photo conflicts | PASS | Missing parent dependency, forged UUID/hash/path and extra photo slot |
| Before source/stored equality, historical absence vs corrupt required Before | PASS | Independent source/hash assertions and corrupted accepted Before |
| Source/stored hash scope and cross-job independence | PASS | Identical source and different source/same normalization, separate job accepts |
| Exact receipts, identical/concurrent replay and response loss | PASS | HTTP abort after commit; one row/binding on retry; nonzero milliseconds preserved |
| Partial batches and atomic rollback | PASS | One failed part only; injected audit failure rolls back record/binding |
| Competing same-finding submissions | PASS | Different staged UUIDs, one awaiting winner; concurrent identical parent retries |
| Per-part approval/rejection, reasons and reviewer races | PASS | One service with independently approved/rejected parts; concurrent identical and competing decisions |
| Repeat approved/rejected cycles, lineage and withdrawal | PASS | New UUID/sequence, foreign predecessor rejected, prior records retained |
| Stale actor/assignment/source and correction races | PASS | Inactive/reassigned/revoked actors denied; correction lock blocks submit/approval then conflicts |
| Storage reconciliation and accepted-metadata integrity | PASS | Staged/accepted files retained; missing/size/hash/orphans diagnosed; corrupt manifest metadata blocks read/approve |
| Auth/read security and closed original visit compatibility | PASS | HTTP role/foreign/expected-user tests, staged content refused, bound bytes verified |
| Chromium | PASS | Standing cold script |
| API typecheck/build | PASS | Full standing and final cold focused runners, both exit 0 |
| Historical matrix | PASS | 20/20 |
| V6 evidence/storage/compatibility | PASS | 11/11 |
| Wet Chemical definition | PASS | 2/2 |
| V7 contracts/config | PASS | 38/38 |
| B1 readers/integration | PASS | 22/22 readers, 10/10 integration |
| B2 integration | PASS | 16/16, zero skips |
| Existing storage reconciliation integration | PASS | Unchanged pre-existing test: 1/1 |
| V6/CO2/Wet Chemical/Fire Alarm V7 integration | PASS | 1/1, 4/4, 2/2, 4/4; separate processes |
| V7 races and optional-photo/ordinary-PDF regression | PASS | 1/1 races, 14/14 optional-photo/report/PDF |
| Web typecheck/production build/precache/stale evidence | PASS | Typecheck/build exit 0; precache contract 3/3; stale evidence 1/1; NODE_ENV=production |
| Protected files, 051, unrelated changes and baseline exception | PASS | Hash preservation and protected-file read-only Git checks |
| HANDOVER, checkpoint report, diff whitespace and scope stop | PASS | Final document/whitespace check |

Final actual gate output:

```text
PASS: Chromium available
PASS: API typecheck
PASS: API build
PASS: historical matrix
PASS: V6 evidence
PASS: Wet Chemical definition
PASS: V7 contracts and config
PASS: B1 readers
PASS: B1 integration
PASS: B2 integration
PASS: storage reconciliation
PASS: V6 integration
PASS: co2V7
PASS: wetChemicalV7
PASS: fireAlarmV7
PASS: v7EvidenceRace
PASS: optionalGoodPhoto
PASS: web typecheck
PASS: web build
PASS: PWA build contract
PASS: web stale evidence
PASS: diff whitespace
ALL GATES PASS
```

Production web output remains `index-BgHgxrOq.js` 1,144.41 kB and `react-BhVsojQm.js` 222.53 kB; generated service worker has 10 precache entries (1410.15 KiB). Update/reload behavior and the default 2 MiB limit are unchanged.

Protected-file `git status --short` returns no entries. Comparison with `e30c649` returns only the approved `fireAlarmV6Evidence.ts` exception; comparison of that file with `10f3bbb` returns no diff. SHA-256 remains `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B`. Migration 051 SHA-256 remains `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. Initial tracked/untracked hash comparison found **zero unexpected changes** across 1,185 files outside the five intentionally edited existing paths. B1 readers/fixtures/report, 051, all web/precache follow-up files and unrelated storage tests/trackers are unchanged. Whitespace gate passes with existing CRLF warnings only.

## Files changed by B2

| File | Reason |
|---|---|
| `apps/api/src/repairs/repairSubmission.ts` | Strict repair identity, staged photo authority, atomic part/batch submission, decisions, authorized accepted reads and integrity |
| `apps/api/src/repairs/repairMultipart.ts` | Repair-specific bounded multipart validation; no open-job/inspection ownership coupling |
| `apps/api/src/repairs/repairSubmission.integration.test.ts` | Disposable B2 Level 2 regression matrix and committed-response-loss proof |
| `apps/api/src/repairs/repairFoundation.ts` | Export existing lock/transaction helpers and expose the required immutable source fingerprint in finding DTOs; preserve B1 authority |
| `apps/api/src/routes/repairs.ts` | Register B2 role-gated endpoints and audited write failures while preserving B1 routes |
| `apps/api/src/attachments/attachmentStorage.ts` | Add repair rows/tree to existing reconciliation; preserve pre-existing unrelated inspection/storage work |
| `scripts/testing/verify-cr09-b2.ps1` | Cold B2 + B1 + standing runner, fresh unique disposable Postgres and separate test processes |
| `HANDOVER.md` | Current B2 checkpoint and completed B1 green-review evidence; prior notes retained |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | B1 review acceptance and B2 implementation/review checkpoint status only |
| `docs/testing/CR09_B2_IMPLEMENTATION_REPORT.md` | This report, contract, gates and reproducible commands |

No B1 migration/readers/fixtures/report, historical template, original ownership predicate, inspection acceptance/report/PDF, package lock, web, Dexie, Compose, Caddy or runtime/customer data was edited. Existing App.tsx, Vite/precache follow-up, client trackers, storage reconciliation integration test, phone mode and other initial tracked/untracked files remain preserved.

## Cold reproducible commands

Run verbatim in PowerShell. Each script starts its own fresh unique disposable PostgreSQL on `127.0.0.1:55432`, forces BOTH database URL variables regardless of existing values, verifies the target and Chromium, uses temporary fixture uploads, and removes only its own container. Port 55432 must be free; it fails instead of falling back to runtime. API uses NODE_ENV=test; web build explicitly uses NODE_ENV=production. Previous environment values are restored.

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b2.ps1
```

Focused API/B1/B2/storage recheck (also cold):

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b2.ps1 -FocusedOnly
```

Protected status, approved exception and whitespace:

```powershell
cd C:\PWA_OfflineRecordWebApp
git status --short -- apps/api/src/inspections/templates 'apps/api/migrations/017*' 'apps/api/migrations/018*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff 10f3bbb -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts
git diff --check
```

## Original implementation findings, limitations and verdict

**P0 remaining: 0. P1 remaining: 0. P2 remaining: 0 in B2 scope.** No known open relevant defect from these implementation checks. Independent B2 review remains the next checkpoint. This does not reassess unrelated roadmap/security findings. The unchanged Vite warning about chunks over 500 kB is informational; both emitted JavaScript chunks are precached below the unchanged 2 MiB limit.

No production/runtime migration, backfill or upload; only disposable fixtures were modified. No Git mutation/staging, deployment, manual final acceptance, phone/browser restart, installed-PWA force-close, physical camera, offline typing/local save or Level 3 proof is claimed. The HTTP response-loss case is a controlled loopback server test. B3 owns local persistence/cache/outbox/offline recovery; C owns UI, D owns repair PDF/export. Ordinary report/PDF regression gates verify preservation, not repair PDF implementation. Phase B remains incomplete.

**SAFE FOR B2 REVIEW: Y. READY FOR B3: N pending independent B2 review. Phase B is not complete; B3 remains. Stop before staging.**

## Sol B2 review remediation

Date: 2026-10-12 (Asia/Kuala_Lumpur). The independent read-only review reproduced one P1 and one P2 despite the original green gates. This remediation changes B2 only and does not accept the checkpoint or start B3.

- **P1: incomplete accepted evidence metadata validation.** Corrupting a submitted photo's frozen template, contract hash or historical missing-Before flag still allowed detail/content reads, staging/submission replay and a new approval. The common evidence verifier now compares all of those properties, the canonical field path and source fingerprint with the validated immutable original source, and rejects extra metadata keys. Stage replay, initial submission, accepted reads, submission replay and decisions all use that verifier. Decision replay also verifies accepted evidence before returning its retained receipt. Actor/assignment checks and the service/correction/finding/record lock order remain intact; authorized healthy retries still return their original receipts before changed eligibility/lifecycle checks.
- **P2: malformed repair sizes aborting startup reconciliation.** The repair query no longer casts JSON text to PostgreSQL integer. All three existing evidence sources deliver JSON size values; each value is checked for a numeric, safe positive integer within the existing upload limit. Malformed sizes enter the existing `wrongSizeFiles` diagnostic, retain their referenced files and do not abort other rows' reconciliation. No new schema or diagnostic response shape is introduced.

Two focused integration subtests reproduce the failures and verify the fixes. The metadata case corrupts each frozen property and an extra key, covering staged replay/submission, accepted detail/content, submission/stage replay, a new decision, and committed decision replay. No corrupt case inserts a record or approval. Restoring the original metadata returns the same receipts, one retained decision and the exact `.123Z` performed time. The size case tests staged and accepted rows with nonnumeric/numeric strings, overflow/oversized integers, fractions, zero, negatives, null, objects and missing values. Healthy rows remain correctly classified, referenced files are never orphaned/deleted, and restoration returns the exact original diagnostics and bytes. The pre-existing unrelated storage reconciliation integration test is unchanged.

| Remediation DoD / standing gate | Actual result |
|---|---|
| P1 staged and accepted metadata integrity, including decision replay and healthy recovery | PASS — new focused integration case |
| P2 malformed-size diagnostics, staged/accepted preservation and independent healthy rows | PASS — new focused integration case |
| Existing B2 strict validation, evidence-first and own After/remark | PASS — expanded integration suite |
| Exact UUID/fingerprint, response loss, partial batches and atomic audit/binding rollback | PASS — retained integration cases |
| Nonzero millisecond reads/fingerprint/replay/approval | PASS — retained `.123Z` cases plus restoration assertion |
| Actor/assignment/revocation, current eligibility and correction/decision races | PASS — retained B1/B2 cases |
| Scoped source/stored uniqueness, Before refusal and cross-job independence | PASS — retained cases |
| Repeat cycles/predecessors/history and closed-source compatibility | PASS — retained cases |
| Chromium | PASS |
| API typecheck and build | PASS |
| Historical matrix | PASS — 20/20 |
| V6 evidence/storage/compatibility | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contracts/config | PASS — 38/38 |
| B1 readers/integration | PASS — 22/22 and 10/10 |
| B2 integration | PASS — 18/18, zero skips |
| Pre-existing storage reconciliation integration | PASS — 1/1, unchanged test |
| V6/CO2/Wet Chemical/Fire Alarm V7 integration | PASS — 1/1, 4/4, 2/2, 4/4 |
| V7 evidence races | PASS — 1/1 |
| Optional-photo and ordinary report/PDF regression | PASS — 14/14 |
| Web typecheck/production build/precache/stale evidence | PASS — 10 precache entries; contract 3/3; stale evidence 1/1 |
| Full cold runner | PASS — exit 0, ALL GATES PASS, zero skips |
| Final cold focused runner | PASS — exit 0, ALL GATES PASS; API typecheck/build, readers 22/22, B1 10/10, B2 18/18, storage 1/1; zero skips |
| Migration 051, approved V6 exception, historical/unrelated files | PASS — protected status empty; approved file exact to 10f3bbb; 051 hash unchanged; captured unrelated hashes unchanged |
| Documentation, whitespace and checkpoint scope | PASS — checkpoint documents updated, git diff --check clean; no next checkpoint or Git mutation |

Full cold results are in `logs/cr09-b2-gates.log`; final cold focused results are in `logs/cr09-b2-focused.log`. Both completed with exit 0 / ALL GATES PASS / zero skips. Both scripts start their own fresh disposable PostgreSQL at `127.0.0.1:55432`, override BOTH database URL variables, use `NODE_ENV=test` for API fixtures and remove only their own container. The full runner explicitly uses `NODE_ENV=production` for web. Neither runner uses runtime/customer data. Reproduce:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b2.ps1
& .\scripts\testing\verify-cr09-b2.ps1 -FocusedOnly
```

| Files changed by this remediation | Reason |
|---|---|
| apps/api/src/repairs/repairSubmission.ts | Validate frozen source metadata on every evidence/replay/read/decision path |
| apps/api/src/attachments/attachmentStorage.ts | Diagnose malformed size metadata per row without a fatal SQL cast |
| apps/api/src/repairs/repairSubmission.integration.test.ts | Focused corruption/replay/recovery and malformed-size preservation proofs |
| docs/testing/CR09_B2_IMPLEMENTATION_REPORT.md | Current remediation evidence; original checkpoint history retained |
| docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md | B2 remediation/re-review status only |
| HANDOVER.md | Current B2 status; earlier notes retained |

Protected-file `git status --short` returns no entries. Comparison with `e30c649` for the protected historical paths returns only the approved `fireAlarmV6Evidence.ts` exception; that file is exact to `10f3bbb`. Its SHA-256 remains `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B`. Migration 051 remains `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. The 1,053 complete hashes retained from the start-of-remediation snapshot differ only for the six listed remediation files; snapshot output truncation prevented a complete all-file hash certification. B1 authority/readers/fixtures/report and the web production-build/precache follow-up were not edited. The unchanged storage integration test passes. Whitespace checks pass with existing CRLF warnings only.

P0 remaining: 0. P1 remaining: 0. P2 remaining: 0 in this remediation scope. NEW DEFECTS: N found in remediation checks. HISTORICAL IMMUTABILITY INTACT: Y with the owner-approved `10f3bbb` exception. **SAFE FOR B2 RE-REVIEW: Y. SAFE FOR B2 REVIEW ACCEPTANCE: N pending independent re-review. READY FOR B3: N.**

No B3, Git mutation/staging, deployment, runtime/customer migration/backfill/upload, or manual final acceptance. No actual phone/offline/PWA-force-close/Level 3 proof is claimed. Phase B remains incomplete.
