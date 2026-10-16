# CR-09 B1 implementation and verification

Date: 2026-10-12 (Asia/Kuala_Lumpur).

B1 API implementation and the frozen Fire Alarm V7 compatibility remediation are present, uncommitted. Its focused and standing checks have passing results. The follow-up fixed the web verification environment and split React dependencies into a separate precached chunk. The owner explicitly approved preserving committed fix `10f3bbb` as an exception to the `e30c649` protected-file baseline. B2/B3 remain unbuilt; Phase B is not complete.

**SAFE FOR B1 REVIEW: Y.**
**READY FOR NEXT CHECKPOINT: N — the compatibility remediation awaits B1 read-only re-review.** This report does not authorize B2.

## Result and scope

- Migration 051 was available and adds only the six authorized repair tables, their indexes, FKs and guards. Registration follows the existing forward replay marker. No applied migration, published template, existing inspection schema, Dexie, package lock, Compose, Caddy, environment file or runtime data was changed.
- Original accepted field identity is form-instance ID + canonical field path. Response paths are explicitly mapped; repeated rows use UUIDs, never indexes. Metadata freezes source client UUID, original visit/system/template/configuration, labels, unit/row identity, original result/remark and Before evidence/hash or legitimate historical absence. Extraction never promotes Good/N.A./Complete Repair to repair candidates.
- All 11 V7 systems reuse their frozen accepted validators and evidence adapters. CO2/Wet Chemical/FM200's historical accepted storage shape has no snapshot manifest: their accepted bound rows must satisfy the response's exact required/optional evidence scope. Manifest-bearing systems match their own snapshot manifest. Before bytes are checked for path containment, size, SHA-256, JPEG decoding and dimensions. Required V7/V6 evidence never receives the historical absence exception.
- Historical Poor readers cover CO2 V1, Wet Chemical V4 lineage, Hose Reel V1, Automatic Sprinkler, Dry/Wet Riser V2, Hydrant, and Fire Alarm V3–V6 formats. V3–V5 absence is permitted; V6's required manifest/photo contract remains enforced. Quantity-only Portable Fire Extinguisher produces no repair findings.
- The explicit materializer scans at most 100 submitted, non-sample forms per batch, advances a form UUID cursor even when there are no findings, verifies frozen sources, and inserts only new findings. Identical replay preserves IDs/bytes. A changed source conflicts; a corrupt source rolls back the batch. It is not called by startup or any GET route.
- Manager assignment/reassignment/revocation and original-owner self-start are strict, transactional, idempotent and audited. Active technician/actor roles are checked in the database. Any prior service work-order history prevents creation of a new self-start order; active explicit orders allow multiple technicians. Revoked/reassigned actors cannot recover authority with another UUID or an old self-start replay. Work-order identity and earlier mutation receipts are immutable.
- Repair authorization is separate from the existing inspection ownership predicate. Assigned technicians can read only their repair service and its original Before bytes. Existing inspection routes remain unchanged. Closed original visits are allowed without reopening or creating another visit.
- Source-eligibility decisions are append-only, with reviewer role, reason, UUID/fingerprint, review sequence and an exact correction-revision hash. Reads derive `needs_review` whenever that revision is stale. Original Before is never corrected. Review writes and coherent detail reads take the existing `inspection_corrections:<formInstanceId>` lock; work-order changes and service reads use a separate service lock. Future B2 writes must use the same order: service, sorted source-correction locks, finding/record locks.
- Repair records support immutable repeated cycles, exact predecessor linkage and unique sequence. A database trigger locks the finding and derives awaiting-decision occupancy from append-only decisions. It permits another cycle after a decision without a permanent unique finding constraint or mutable active-status projection. Evidence bindings reference the same repair/finding/work order/job/system; accepted source/stored hash indexes are scoped to original job + system, separately from inspection evidence.

B1 routes:

| Method | Route | Authority |
|---|---|---|
| GET | `/repairs/services` | Source owner before assignment, assigned active technician, Admin/Manager |
| GET | `/repairs/services/:jobId/:systemKey` | Same; validated frozen findings, source review state, work orders, cycle history |
| GET | `/repairs/findings/:findingId` | Same, scoped to that finding's service |
| GET | `/repairs/findings/:findingId/before/content` | Same; validated accepted original JPEG only |
| POST | `/repairs/work-orders` | Manager (`admin`); explicit work-order/request UUID, expected revision, technician, active/revoked status |
| POST | `/repairs/work-orders/self-start` | Original technician (`inspector`), subject to current service authority |
| POST | `/repairs/findings/:findingId/source-review` | Admin/Manager (`supervisor`/`admin`); exact source revision and review sequence |

No upload, repair submission, workmanship approval, PDF or placeholder write endpoint is exposed. B2 evidence/approval tables are intentionally inactive until B2 builds atomic validation and writes. Existing attachment reconciliation work was preserved; B1 produces no repair files.

## Definition of Done

PASS rows are actual checks, not skipped tests. The latest full cold standing run in `logs/cr09-b1-gates.log` completed with exit 0 / ALL GATES PASS after the compatibility remediation. It includes 21 reader tests and 10 B1 integration tests, with zero skips. The final exclusion/current-V7 strictness test was added after that runner loaded its reader suite; the final direct reader recheck passed 22/22 and final API typecheck passed. The original focused log/output below predates this remediation. The production web build uses NODE_ENV=production and all three precache-contract tests pass.

| Item | Result | Actual proof |
|---|---|---|
| Additive migration registration and cold replay | PASS | Fresh disposable schema; two full migration replays preserve existing finding counts |
| All 11 V7 systems and recognized older Fire Alarm V7 variant | PASS | Current matrix plus scalar-state/legacy-Poor readers and bound-photo materialization/replay/read integrity integration |
| Historical Poor readers; permitted absence vs required corruption | PASS | Seven historical reader cases, V6 required-manifest case, historical integration fixtures and V6 bound-photo fixture |
| Stable finding/row identities and explicit response mapping | PASS | Canonical-to-response assertions; UUID-based rows; repeated materialization inserts zero and retains IDs |
| Good/N.A./Complete Repair excluded; Draft/unknown/foreign/duplicate paths rejected | PASS | Reader matrix; malformed timestamps/detector states; foreign row UUIDs/duplicate rows; foreign accepted evidence path refused |
| Unauthenticated, owner, assigned other and unassigned boundaries | PASS | HTTP 401/200/404 tests, Before content checks, reviewer role gates, original CO2 route still denies assigned other technician |
| Assignment revocation, stale callers and self-start bypass | PASS | Reassign/revoke/replay tests; another UUID denied; actor header mismatch; inactive/wrong-role assignee rejected |
| Strict work-order/source-review parsing | PASS | Unknown keys and array-valued enums return 400; wrong role returns 403 |
| Idempotent work-order/review mutations and audit | PASS | Exact UUID/fingerprint receipts; changed request content conflicts; audit count; simultaneous identical review replay |
| Reviewed source revision and races | PASS | Correction lock blocks review; changed revision returns conflict; competing reviewers/assigners have one winner; original Before unchanged |
| Repeat-cycle and history constraints | PASS | First awaiting blocks next; approved first allows new UUID/sequence; foreign predecessor refused; competing next cycles have one winner; update/delete guards; accepted evidence requires a binding and rejects scoped source/stored hash reuse |
| Safe batched materialization, rollback and replay | PASS | Strict batch limit/cursor; corrupt required bytes refused; a corrupt second source rolls back first-source findings |
| Closed source visit compatibility | PASS | Fully closed disposable fixture remains readable/assignable; no reopen or new visit |
| Chromium availability | PASS | Existing Playwright Chromium path verified before PDF gates |
| API typecheck | PASS | Final cold focused run |
| API build | PASS | Final cold focused run |
| Historical matrix | PASS | 20/20 |
| V6 evidence/storage/compatibility | PASS | 11/11 |
| Wet Chemical definition | PASS | 2/2 |
| V7 contracts and config | PASS | 38/38 |
| B1 readers | PASS | Final 22/22, zero skips; full cold runner loaded the earlier 21-test suite |
| B1 integration | PASS | Cold 10/10 (parent + nine focused subtests), zero skips |
| V6 integration | PASS | 1/1 |
| CO2 V7 integration | PASS | 4/4 |
| Wet Chemical V7 integration | PASS | 2/2 |
| Fire Alarm V7 integration | PASS | 4/4 |
| V7 evidence races | PASS | 1/1 |
| Optional Good/N.A. photo regression | PASS | 14/14, including ordinary Final Report/PDF embedded bytes |
| Web typecheck | PASS | Standing run |
| Web production build | PASS | Explicit `NODE_ENV=production`; application 1,144.41 kB and React 222.53 kB; service worker generated with 10 precache entries |
| PWA build contract | PASS | 3/3; every emitted JavaScript chunk fits the unchanged 2 MiB limit and appears in the precache manifest; update/reload policy unchanged |
| Web stale evidence | PASS | 1/1; frozen pending authority and current optional-photo behavior unchanged |
| Historical templates/contracts unchanged by B1 | PASS | V1–V7 templates, migration 017/018, V6 acceptance/report test paths have no B1 working-tree changes; template V1–V6 comparison to `e30c649` is clean |
| Protected baseline with owner-approved exception | PASS | Owner approved retaining `10f3bbb`'s BIGINT uploader-ID fix in `fireAlarmV6Evidence.ts`; other historical baseline files are unchanged. No edit/reversion to the protected file |
| `git diff --check` | PASS | No whitespace errors; only existing CRLF warnings |
| Documentation/report; unrelated changes preserved; stop before staging | PASS | This report, plan status and additive HANDOVER note; no Git mutation/deployment/B2 |

## Findings and limitations

**P0 remaining: 0 (B1 scope).**
**P1 remaining: 0 (B1 and this follow-up).**
**P2 remaining: 0 (B1 and this follow-up).** These counts do not assess unrelated existing roadmap/security findings.

- **Previous web-build finding corrected.** The B1 verification script carried API fixtures' `NODE_ENV=test` into Vite, inflating React's output. The earlier description of this as a pre-existing production-web defect was incorrect. The follow-up sets `NODE_ENV=production` for web gates, splits React/React DOM/client into a named chunk, and verifies every JavaScript chunk is precached. The default 2 MiB Workbox limit remains unchanged. Production build now passes.
- **Baseline exception explicitly approved by the owner.** Read-only `git diff e30c649 -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts` still shows the earlier BIGINT uploader comparison fix (`number` to `string`, comparison to `String(actorUserId)`). The owner answered **“Accept the committed fix as a baseline exception”** for commit `10f3bbb`. The file remains unchanged by this work; no Git mutation or protected-file reversion was performed.

The [task-brief skill](../../.agents/skills/codex-task-brief/SKILL.md) requires passing standard gates and the protected baseline. The web gate is now passing, and the owner's explicit exception supersedes the old byte-exact requirement for that one committed fix. No B2 readiness before B1 review is claimed.

The independent read-only Sol review found one P1 frozen Fire Alarm V7 reader defect; the remediation below now awaits re-review. There was no real phone/browser restart, installed-PWA force-close, offline camera/type/save test, Level 3 acceptance, runtime backfill/migration or deployment. B1 is API-only. Workmanship/evidence writes, storage reconciliation integration, local persistence/sync, UI and repair PDFs belong to later checkpoints.

## Files changed by B1

| File | Reason |
|---|---|
| `apps/api/migrations/051_repair_foundation.sql` | Additive six-table foundation, identity/history/cycle guards and scoped evidence indexes |
| `apps/api/src/db/migrations.ts` | Register only new migration 051 with replay marker |
| `apps/api/src/server.ts` | Register authenticated repair router |
| `apps/api/src/routes/repairs.ts` | B1 scoped reads, Before content, work-order and eligibility mutations |
| `apps/api/src/repairs/findingReaders.ts` | Frozen V7/historical readers and explicit field mapping |
| `apps/api/src/repairs/acceptedSource.ts` | Accepted source load, Before integrity, immutable metadata and correction revision |
| `apps/api/src/repairs/repairFoundation.ts` | Batched materialization, repair access, assignment/self-start and eligibility transactions |
| `apps/api/src/sync/fireAlarmV7Acceptance.ts` | Add a wrapper exporting the existing full response validator for repair reads; acceptance behavior unchanged |
| `apps/api/src/repairs/repairFixtures.ts` | Disposable/unit fixtures for all 11 V7 systems |
| `apps/api/src/repairs/historicalFixtures.ts` | Historical Poor and required V6 fixtures |
| `apps/api/src/repairs/findingReaders.test.ts` | V7 identity/exclusion/path/corruption regression matrix |
| `apps/api/src/repairs/historicalFindingReaders.test.ts` | Historical absence and V6 isolation proofs |
| `apps/api/src/repairs/repairFoundation.integration.test.ts` | Disposable Level 2 authorization, replay, locking, schema, integrity and rollback proofs |
| `scripts/testing/verify-cr09-b1.ps1` | Cold reproducible standing/focused verification and exact disposable-container cleanup |
| `apps/web/vite.config.ts` (follow-up) | Split React dependencies into a separate app-shell chunk without raising the precache limit |
| `apps/web/tests/pwa-build-contract.test.mjs` (follow-up) | Verify every JavaScript chunk is small enough and present in generated precache |
| `HANDOVER.md` | Add current B1 status while retaining existing notes |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | Update B1 status only |
| `docs/testing/CR09_B1_IMPLEMENTATION_REPORT.md` | This checkpoint report |

Preserved pre-existing changes: `apps/api/src/attachments/attachmentStorage.ts` and its untracked reconciliation test; `apps/web/src/App.tsx`; both client-change tracker documents; the previously prepared build-prompt/plan, task-brief and parallel-run documents; `scripts/phone-testing/mode.txt`. HANDOVER's pre-existing contents remain beneath the new B1 note. No cleanup, staging or Git history action was performed.

## Cold reproducible commands

Run in PowerShell from the repository. Both variants start a **fresh**, uniquely named disposable Postgres on `127.0.0.1:55432`, force BOTH database URL variables even if they were already set, verify Chromium, use only temporary test uploads, run integration suites in separate processes and remove only their own test container. They restore prior environment variables. Port 55432 must be free; if it is occupied the script fails, never falls back to runtime Postgres.

Corrected full standing + B1 reproduction (API fixtures use test mode; web gates explicitly use production mode):

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b1.ps1
```

Original focused B1 recheck before compatibility remediation (exit 0 at that checkpoint):

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b1.ps1 -FocusedOnly
```

Original focused output (19/9 counts predate compatibility remediation):

```text
PASS: API typecheck
PASS: API build
B1 readers: tests 19, pass 19, fail 0, skipped 0
B1 integration: tests 9, pass 9, fail 0, skipped 0
PASS: diff whitespace
```

Protected-file checks:

```powershell
cd C:\PWA_OfflineRecordWebApp
git status --short -- apps/api/src/inspections/templates 'apps/api/migrations/017*' 'apps/api/migrations/018*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff --name-only e30c649 -- apps/api/src/inspections/templates/masterServiceReportV1.ts apps/api/src/inspections/templates/masterServiceReportV2.ts apps/api/src/inspections/templates/masterServiceReportV3.ts apps/api/src/inspections/templates/masterServiceReportV4.ts apps/api/src/inspections/templates/masterServiceReportV5.ts apps/api/src/inspections/templates/masterServiceReportV6.ts 'apps/api/migrations/017*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff --check
```

The status command returns no protected-file changes. The baseline command returns only the owner-approved `apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts` exception described above. Full working-tree status is recorded in the gate logs and includes the preserved unrelated changes.

**SAFE FOR B1 REVIEW: Y. Stop before staging. B2 not started.**


## Sol P1 remediation — frozen Fire Alarm V7 compatibility

Date: 2026-10-12 (Asia/Kuala_Lumpur). The review reproduced a recognized older Fire Alarm V7 contract passing the accepted reader while B1 threw REPAIR_SOURCE_INVALID. It retains scalar Normal/Test/Isolation and legacy good/poor/not_relevant under the same V7 template identity. The positive regression failed at findingReaders.ts:82 before the fix.

The B1 wrapper now selects the exact registry-recognized frozen definition and validates scalar states through a temporary validation-only copy. Accepted payloads/snapshots remain unchanged. B1 extracts legacy Poor using canonical V7 row paths and strict V7 manifest parsing. Every Poor field needs its own nonblank remark and exact Before photo; Good/Not Relevant have no legacy optional-photo slot. Current V7 acceptance uses its existing validator directly. No templates, applied migrations, schema, upload/submission/approval endpoints changed.

| Remediation DoD | Result | Proof |
|---|---|---|
| Frozen scalar states and exact Poor extraction | PASS | Ten canonical parts with original remarks, results and row UUIDs |
| Strict frozen variant/current V7 isolation | PASS | Unknown contract/state/result and legacy arrays/current scalars rejected |
| Non-findings excluded; exact required manifest | PASS | Good/Not Relevant zero-part cases; missing/foreign/duplicate UUID/hash/extra-key rejection |
| Mixed batch and immutable replay | PASS | Current/legacy two-form batch; same finding IDs/metadata/timestamps on replay |
| Owner/assigned/foreign read boundaries | PASS | Another technician assignment; foreign/old-owner denial; exact Before JPEG bytes/hash |
| Required Before integrity | PASS | Missing/corrupt file and foreign bound path refused; restored original readable |
| Accepted authority unchanged | PASS | Snapshot/response equality and unchanged findings after integrity probes |
| Standing gates and final focused verification | PASS | Full script exit 0; integration 10/10; final readers 22/22 and API typecheck; zero skips |
| Historical/unrelated files preserved | PASS | Protected status clean; approved 10f3bbb hash unchanged; unrelated-file hashes identical |
| Scope/checkpoint stop | PASS | No B2, Git mutation, deployment, runtime/customer writes or manual acceptance |

The full run used fresh disposable PostgreSQL at 127.0.0.1:55432, BOTH URL variables overridden, NODE_ENV=test for API fixtures and NODE_ENV=production for web. Its exact container was removed. Web produced 10 precache entries; both JavaScript chunks meet the unchanged 2 MiB limit.

| Files changed by this remediation | Reason |
|---|---|
| apps/api/src/repairs/findingReaders.ts | Frozen legacy V7 selection, canonical Poor extraction and required evidence scope |
| apps/api/src/sync/fireAlarmV7Acceptance.ts | B1 read wrapper validates recognized scalar states; acceptance unchanged |
| apps/api/src/repairs/historicalFixtures.ts | Independent pre-refinement fixture with Poor/Good/Not Relevant fields |
| apps/api/src/repairs/historicalFindingReaders.test.ts | Reproduction, exclusions, strict contract/state/manifest and immutability tests |
| apps/api/src/repairs/repairFoundation.integration.test.ts | Disposable mixed-batch/replay/access/Before-integrity proof |
| docs/testing/CR09_B1_IMPLEMENTATION_REPORT.md | Actual remediation results and pending re-review |
| docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md | B1 counts and re-review status only |
| HANDOVER.md | Current status; earlier notes preserved |

P0 remaining: 0. P1 remaining: 0. P2 remaining: 0 in remediation scope.
NEW DEFECTS: N found during remediation checks. HISTORICAL IMMUTABILITY INTACT: Y with approved exception 10f3bbb. Protected SHA-256 remains A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B.

SAFE FOR B1 RE-REVIEW: Y. READY FOR B2: N pending re-review. No manual final acceptance. Reproduction:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b1.ps1
```
