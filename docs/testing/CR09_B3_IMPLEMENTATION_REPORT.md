# CR-09 B3 — local persistence, cache and evidence-first sync

Date: 2026-10-13 (Asia/Kuala_Lumpur).
Scope: section 8 B3 and its implementation prompt only. D1–D11 remain confirmed.
Status: independent B3 re-review PASSED in **Review B3 repair implementation**, chat `01a13119-c9f6-77d3-ba75-47a8675eac6a`, completed turn `01a1312c-a80e-7c71-a0c6-1e9b7fbe9d24`. Explicit verdict: **P0: 0 / P1: 0 / P2: 0; NEW DEFECTS: N; SAFE FOR B3 REVIEW ACCEPTANCE: Y; PHASE B DATA+SYNC REVIEW ACCEPTED: Y; READY FOR C1: Y.** All three earlier findings are closed; full cold gates passed with zero skips (10 B3 + 3 inspection browser tests). The earlier implementation/remediation narrative and pending-review verdicts below are historical. C1 independently confirmed this completed review before editing; implementation tests were not used as a substitute for review acceptance.

## Prerequisite and preservation

Before editing, read the completed **Review CR09 B2 repair** chat `01a12f37-2e3f-7ac1-a26d-d88b1a306dc7`, completed re-review turn `01a13096-4da7-7061-a465-fc4cef7f9396`. Its final verdict explicitly says **READY FOR B3: Y**, **SAFE FOR B2 REVIEW ACCEPTANCE: Y**, **P0: 0 / P1: 0 / P2: 0**, **NEW DEFECTS: N**. Both previous findings are closed; its full/focused cold gates passed with zero skips. The older pending-review wording in B2's report is historical. No new review acceptance is inferred from implementation tests.

Initial working tree already contained B1/B2 API changes, migration 051, attachment reconciliation, App.tsx, Vite/precache follow-up, client trackers, reports, phone mode and other testing scripts. Those changes were inspected and retained. B3 edits only the files listed below. There are **no B3 API edits or demonstrated API contract gaps**: B1/B2 already supply the required service/order/finding DTOs, original-photo content route, evidence stage and submission receipts.

Migration 051 retains SHA-256 `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. The approved protected-file exception `fireAlarmV6Evidence.ts` retains SHA-256 `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B` and is exact to `10f3bbb`. Protected historical-file working-tree status is empty; the exact protected V1–V6 paths differ from `e30c649` only by that approved exception. No migration, template, original inspection authority, package lock, runtime/customer file, Compose, Caddy or environment file was edited by B3.

## Result

The current version was rechecked at **9**. Additive Dexie **10** declares only five new stores; Dexie carries all ten v9 stores and indexes forward without an upgrade rewrite. `repairFindings`, `repairWorkOrders`, `repairRecords`, `repairAttachments` and `repairBeforePhotos` use the existing per-user workspace factory. The existing outbox gains `repairEvidence` and `repairRecord` entity types and retains its unique active-operation pattern. No reset or wipe.

Authorized service downloads include work orders, original finding metadata, source revision/eligibility and immutable cycle history. Reads use the expected-user header and pin the workspace object/account/auth snapshot across awaits. Strict DTO parsing refuses malformed identities, unknown envelope/receipt fields, enum values, timestamps, history chains and required-photo absence. Older refreshes cannot overwrite newer downloads. Failed refreshes throw and retain explicitly errored informational cache. Reference expiry does not remove local business work. Omitted work orders retain their cached service identity with revoked status; an existing draft can still be locally submitted for an authoritative server result.

Before bytes are downloaded unchanged, never passed through processing/watermarking. Cached metadata includes original photo UUID, source/stored hashes, byte size, dimensions, finding/source fingerprint and fetch time. JPEG decoding, dimensions, byte size and SHA-256 are verified on download and cache read. `historical_absence`, `not_downloaded` and `cached` are distinct; corruption throws. Cache Storage holds only harness/app static assets, never business DTOs or photos.

Draft creation, typing/save and one-photo capture operate locally. Capture uses `processInspectionPhoto` and the existing watermark/compression/persistence helpers. The current unsubmitted photo slot may be deliberately replaced; submitted photos are immutable and retained. New records/photo/operation IDs use `crypto.randomUUID()`.

Submit validates the current draft and Blob, derives exactly one manifest entry from its selected finding/photo, and computes the same canonical actor-bound fingerprints as B2. One transaction freezes part/photo payloads and fingerprints and adds both outbox operations before any API request. Draft/authority changes during the preparation window abort; an outbox failure rolls back the entire freeze. Concurrent Submit cannot create two active pairs. Subsequent save/capture cannot edit a frozen record.

The existing single sync coordinator invokes repair recovery/dispatch and excludes both repair types from generic inspection batches. Each repair parent uses a bounded **one-part service batch**: failures remain independent and only its exact successful receipt is applied. All queued repair evidence is attempted before parents. Parent dispatch requires the exact validated photo receipt and no active dependency. Before requests and receipt commits, dispatch checks the same operation ID/active key, immutable payload, actor/workspace, frozen record/photo fingerprints and Blob integrity. Photo and parent receipts must match their complete B2 identity, UUID, fingerprint and source/cycle authority; HTTP 200 alone never confirms.

Timeouts/response loss preserve UUIDs, payloads, operations and Blobs for exact retry. Interrupted `Syncing`/`Uploading` becomes retryable `Failed`. Stale dispatch and late actor/workspace responses cannot confirm or move records into another user's database. Revoked assignment/source-review errors retain local work and their error codes for recovery. Neither cached eligibility nor cache expiry disables local entry/save/Submit; the server rechecks write authority. A failed frozen operation is not rewritten to a new revision automatically. Authority recovery is refresh/sign-in/authorized reassignment or source review followed by safe exact retry; C1 owns the user-facing recovery actions.

Local sync and server review remain separate. A submission receipt changes sync to `Synced` and review to `awaiting_approval`; it is never workmanship approval. Authoritative history refresh changes only the review projection of already-synced local records. Rejected revision/repeat creation validates ordered history and the terminal predecessor, generates a new UUID/sequence, and preserves preceding frozen records/photos/outbox history. New cycles require no existing unsynced local cycle or awaiting server predecessor. Fresh evidence capture is required for the new cycle.

## Definition of Done and results

Final verification: **exit 0 / ALL GATES PASS / zero skips**, recorded in `logs/cr09-b3-gates.log`. The final cold runner passed all API/standing gates and **9/9 browser tests: 6 B3 scenarios plus 3 inspection regressions**. Production web emitted 10 precache entries with both JavaScript chunks below the unchanged 2 MiB limit.

| DoD / gate | Result and actual proof |
|---|---|
| Completed green B2 prerequisite | PASS — exact completed review quoted above |
| Additive v9 → v10; old stores/indexes/data/Blobs/outbox preserved | PASS — browser seeds every v9 table, checks every primary/index declaration, Failed inspection Blob and Pending operation payload/attempts; version becomes 10 |
| Repair business data survives reopen | PASS — actual offline reload checks the complete frozen repair, both operations and exact After Blob hash |
| Offline cache/capture/type/save/Submit/reload | PASS — Chromium context actually offline; file input uses existing processing helper; textarea typed; local save/Submit and cached harness reload run without network |
| Historical absence vs not downloaded vs corruption | PASS — exact Before byte comparison, missing cache state, historic absence and corrupted JPEG refusal |
| Immutable payload/manifest and atomic local freeze | PASS — editing Pending refused; identical payload/operation IDs across retries; injected outbox failure rolls back; concurrent Submit yields one pair |
| Evidence-first and repair excluded from inspection dispatch | PASS — ordered HTTP calls, staged dependency, generic `/api/sync` trap; existing inspection dispatch regression |
| Exact receipts and nonzero milliseconds | PASS — foreign photo UUID/wrong parent fingerprint refused; independent server fingerprint equals frozen `.123Z` parent |
| Timeout/committed replay and partial parts | PASS — photo and parent committed-response-loss routes retain receipts and retry identities; one part source failure does not confirm/block another |
| Interrupted Syncing/Uploading | PASS — simulated interrupted states recovered; exact frozen payloads/IDs and Blobs retained |
| Stale operation/workspace/actor | PASS — in-flight operation changed, logout and different-user workspace before response; no false confirmation or cross-user record |
| Revocation/cache expiry/changed source eligibility | PASS — expired cached metadata, revoked/omitted order and source error; offline local Submit remains possible; unsynced evidence retained |
| Malformed/stale authoritative refresh | PASS — required V7 Before absence refused; refresh errors visible; older request superseded by newer source revision |
| Rejected revision and approved repeat lineage/history | PASS — new UUIDs/sequences 2/3, exact predecessors, current revisions, prior frozen rows/photos retained; actual server cycle authority rerun in B2 integration |
| No lost unsynced work/Blobs | PASS — reload, rollback, failures, revocation, stale responses and recovery assertions |
| Chromium | PASS — executable checked by cold runner |
| API typecheck/build | PASS — cold runner |
| Historical matrix | PASS — 20/20 |
| V6 evidence/storage/compatibility | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contracts/config | PASS — 38/38 |
| B1 readers/integration | PASS — 22/22 and 10/10 |
| B2 integration/storage reconciliation | PASS — 18/18 and unchanged existing reconciliation 1/1 |
| V6/CO2/Wet Chemical/Fire Alarm V7 integration | PASS — 1/1, 4/4, 2/2, 4/4; separate processes |
| V7 race/optional-photo/ordinary report-PDF | PASS — 1/1 and 14/14 |
| Web typecheck and NODE_ENV=production build | PASS — production chunks below unchanged 2 MiB limit |
| Production precache/stale evidence | PASS — 10 entries; precache contract 3/3; stale evidence 1/1 |
| Existing inspection browser regressions | PASS — Fire Alarm historical/V6 dispatch, CO2 V7 scoped evidence and queued 401/403 refusal |
| Auto-sync/queued-write node regression | PASS — 8/8 and 8/8 |
| Final expanded B3 browser suite | PASS — 6/6 B3 plus 3/3 inspection browser regressions in final cold runner |
| Protected status/whitespace/docs/scope | PASS — protected status empty, exact baseline checks below, documents updated and final git diff --check clean |

The initial sandboxed Vite run hit filesystem `EPERM`; it was stopped and the authorized gate runs were executed outside that sandbox. The first browser run passed 4/5; a test incorrectly compared a deliberately refreshed review timestamp as immutable business content. The expanded direct run passed 5/6; its loss fixture assumed UUID-dependent outbox ordering. Both test assertions were corrected to the intended behavior (preserved record content and an explicitly targeted UUID); no production validator was weakened. Final results below supersede these development failures.

## Files changed by B3

| File | Reason |
|---|---|
| `apps/web/src/db/localDatabase.ts` | Additive v10 stores/types; existing declarations and data unchanged |
| `apps/web/src/repairs/repairTypes.ts` | Local/reference/frozen payload and separate sync/review types |
| `apps/web/src/repairs/repairContract.ts` | Canonical hashes and fail-closed authority/lineage parsing |
| `apps/web/src/repairs/repairRepository.ts` | Account-scoped downloads/cache, unchanged Before bytes, local draft/capture/transactional freeze |
| `apps/web/src/repairs/repairSync.ts` | Evidence-first repair receipts/retries/stale guards/interruption recovery |
| `apps/web/src/sync/syncEngine.ts` | Invoke repair work under existing coordinator and exclude it from generic dispatch |
| `apps/web/tests/repair-b3.html` | Data-layer browser harness using real local controls and existing processing |
| `apps/web/tests/repair-b3-worker.js` | Test-only static shell/module cache for actual offline reload |
| `apps/web/tests/repair-b3.spec.ts` | Upgrade, offline, integrity, immutable/retry/authority/lineage/rollback regressions |
| `scripts/testing/verify-cr09-b3.ps1` | Fresh disposable B1/B2/standing gates plus B3/inspection browser regressions |
| `HANDOVER.md` | Current checkpoint and completed B2 review evidence |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | B2 reviewed/B3 implementation status only |
| `docs/testing/CR09_B3_IMPLEMENTATION_REPORT.md` | This contract, DoD, proof limits and reproducible commands |

## Cold reproducible commands

Run verbatim in PowerShell; Docker and installed Playwright Chromium must be available, and port 55432 free. The script starts a fresh uniquely named disposable PostgreSQL, verifies `127.0.0.1:55432`, overrides **both** database URLs irrespective of prior values, uses temporary fixture uploads, runs API suites in separate processes under `NODE_ENV=test`, explicitly builds web under `NODE_ENV=production`, restores prior environment values, and removes only its own container. It fails on any nonzero gate or nonzero skip count. No runtime/customer data is used.

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b3.ps1
```

Protected checks:

```powershell
cd C:\PWA_OfflineRecordWebApp
git status --short -- apps/api/src/inspections/templates 'apps/api/migrations/017*' 'apps/api/migrations/018*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff e30c649 --name-only -- apps/api/src/inspections/templates/masterServiceReportV1.ts apps/api/src/inspections/templates/masterServiceReportV2.ts apps/api/src/inspections/templates/masterServiceReportV3.ts apps/api/src/inspections/templates/masterServiceReportV4.ts apps/api/src/inspections/templates/masterServiceReportV5.ts apps/api/src/inspections/templates/masterServiceReportV6.ts 'apps/api/migrations/017*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff 10f3bbb -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts
git diff --check
```

## Findings, limits and verdict

P0 remaining: 0 identified in B3 implementation checks. P1 remaining: 0 identified. P2 remaining: 0 identified within this checkpoint. Final verification passed; this is not an independent review finding count.

Browser HTTP authority/failure cases use controlled routes and the actual browser IndexedDB/repository/sync code. The offline reload uses a **test-only static service worker**, not the deployed production service worker. B1/B2 API authorization, normalization, idempotency, transactions/races and PostgreSQL timestamp precision are exercised separately on the fresh disposable database. No claim of a single live browser-to-PostgreSQL repair flow is made. Recovery interrupts local states and loses controlled responses; it does not force-close an installed PWA. No physical camera/phone, installed-PWA force-close, real browser-process restart, deployment, Docker production-persistence test or Level 3 proof was performed. These remain the explicitly later acceptance checkpoint.

No screens, navigation, review UI, repair PDF, C1, production backfill or deployment. UI recovery actions belong to C1/C2; immutable failed submissions are retained rather than silently rewritten. The ordinary Vite >500 kB advisory remains informational; the unchanged precache limit and production-build follow-up are preserved.

**SAFE FOR B3 REVIEW: Y.**
**PHASE B DATA+SYNC READY: Y for implementation review.**
**PHASE B INDEPENDENT REVIEW ACCEPTANCE: N — B3 review required.**
Stop before staging. No Git mutations or manual final acceptance.

## Sol B3 review remediation

Date: 2026-10-13 (Asia/Kuala_Lumpur). The owner authorized fixes after the independent review reported P0: 0 / P1: 1 / P2: 2. This remediation does not accept B3 or start C1.

- **P1 — foreign history changing a local review projection.** A service history UUID could previously mark a different finding/service's Synced record approved. Before any projection update, the repository now matches the service, finding, actor, cycle, predecessor, remark and millisecond timestamp with the local immutable record and frozen payload. It also verifies the frozen actor-bound fingerprint, work-order identity, original source fingerprint and manifest path/photo identity. A mismatch aborts the entire reference/work-order/history transaction with `REPAIR_HISTORY_MISMATCH`; retained cache receives an explicit refresh error. Unsynced records are never confirmed through history. A healthy history refresh changes only the review projection.
- **P2 — permissive authority parsing.** Enum values require strings. PostgreSQL BIGINT actor IDs permit only positive safe integers or canonical positive decimal strings, rejecting booleans, arrays and malformed strings. Original DTO keys, source/form/row/location/zone UUIDs, service linkage, template/configuration identity and required metadata are validated before caching. Duplicate history UUIDs across findings and malformed awaiting predecessors are refused. Opaque version-specific unit/instance content remains retained; templates and original source authority are not rewritten.
- **P2 — corrupt Before cache metadata accepted.** Cache reads compare the complete original photo metadata, exact keys, finding identity and valid fetch timestamp before checking unchanged JPEG bytes against authoritative size/hash/dimensions. Corruption throws `REPAIR_PHOTO_INTEGRITY` and retains the Blob. Missing/stale downloads and legitimate historical absence remain distinct.

All three new regression tests were run before the fixes and failed on the reviewed defects. Post-fix focused tests also exercise healthy restoration and atomic preservation. An additional compatibility test uses the real version-specific finding readers for all 11 V7 systems, seven historical formats, required Fire Alarm V6 evidence and the recognized older Fire Alarm V7 contract (20 source variants). It verifies the public DTO shape without claiming a live HTTP-to-PostgreSQL browser flow. Existing lineage fixtures now report their actual frozen remarks rather than fabricated different history content; validators were not weakened.

Final full cold verification: **exit 0 / ALL GATES PASS / zero skips**, in `logs/cr09-b3-gates.log`. Focused remediation/compatibility tests passed **4/4**; the final runner passed **13/13 browser tests (10 B3 + 3 inspection regressions)**. The intermediate full B3 browser run passed 8/9: the foreign-service test fixture changed the outer job ID without changing its nested source-job ID, so strict DTO parsing correctly refused it earlier than the intended history guard. The fixture now changes both IDs coherently; no validator or expected error was weakened. The final cold run covers that exact valid-shape, foreign-service history mismatch.

| Remediation DoD / standing gate | Actual result |
|---|---|
| Foreign finding/service/actor/content/cycle history refused; atomic cache/work-order/projection rollback | PASS — focused browser regression; healthy restoration changes only review state |
| Strict enum/actor/UUID/required-key/unknown-key/history validation | PASS — 17 malformed-authority cases; no cache/order replacement |
| Complete Before metadata integrity and exact retained Blob | PASS — 9 corruption cases and healthy restoration |
| Frozen-source reader compatibility | PASS — 20 variants, all with findings |
| Additive v9 upgrade, all prior stores/indexes/drafts/pending/failed rows/Blobs/outbox | PASS — retained browser regression |
| Offline typing/capture/local save/Submit/reload and separate sync/review states | PASS — controlled browser/test-worker proof |
| Immutable manifest, atomic freeze/rollback and concurrent Submit | PASS — retained browser regression |
| Evidence-first, exact receipts, `.123Z` fingerprint, committed-response loss/replay and per-part isolation | PASS — retained browser regression and B2 integration |
| Stale operation/workspace/actor and interrupted recovery | PASS — retained browser regression |
| Revoked/omitted/expired assignment and changed eligibility retain local work | PASS — retained browser regression |
| Rejected revisions/repeat cycles preserve history/photos and validate new lineage | PASS — actual frozen remarks in valid history fixtures; retained B2 integration |
| Chromium | PASS |
| API typecheck/build | PASS |
| Historical matrix | PASS — 20/20 |
| V6 evidence/storage/compatibility | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contracts/config | PASS — 38/38 |
| B1 readers/integration | PASS — 22/22, 10/10 |
| B2 integration/storage reconciliation | PASS — 18/18, unchanged reconciliation 1/1 |
| V6/CO2/Wet Chemical/Fire Alarm V7 integration | PASS — 1/1, 4/4, 2/2, 4/4 |
| V7 race and optional-photo/ordinary report/PDF | PASS — 1/1, 14/14 |
| Web typecheck/NODE_ENV=production build | PASS |
| Production precache/stale evidence | PASS — 3/3, 1/1; 10 entries and unchanged 2 MiB limit |
| Final B3 + existing inspection browser suite | PASS — 13/13, zero skips |
| Auto-sync/queued-write node regressions | PASS — 8/8, 8/8 |
| Protected historical status, migration 051, approved exception and unrelated work | PASS — protected status empty; only the six remediation files differ among 1,204 captured hashes |
| Documentation, whitespace and scope stop | PASS — git diff --check clean; no C1 or Git mutation |

The cold runner starts fresh disposable PostgreSQL at `127.0.0.1:55432`, forces both database URL variables, uses `NODE_ENV=test` for API fixtures and `NODE_ENV=production` for the web build, and removes only its own container. Reproduce:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-b3.ps1
```

Protected `git status --short` returned no entries. Migration 051 remains SHA-256 `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. The approved V6 exception remains SHA-256 `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B`, exact to `10f3bbb`. All other protected paths remain exact to `e30c649`; all API files, B1/B2 reports, local schema and production-build/precache follow-up files are unchanged by remediation.

**P0 remaining: 0. P1 remaining: 0. P2 remaining: 0 in remediation checks. NEW DEFECTS: N found. HISTORICAL IMMUTABILITY INTACT: Y with the approved exception. SAFE FOR B3 RE-REVIEW: Y. SAFE FOR B3 REVIEW ACCEPTANCE: N pending independent re-review. PHASE B DATA+SYNC REVIEW ACCEPTED: N. READY FOR C1: N.** Implementation verification does not constitute independent acceptance.

Files changed by remediation: `apps/web/src/repairs/repairContract.ts` (strict authority parsing), `apps/web/src/repairs/repairRepository.ts` (history matching and Before metadata integrity), `apps/web/tests/repair-b3.spec.ts` (focused regressions and frozen-source compatibility), this report, `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md`, and `HANDOVER.md` (checkpoint status). No API, migration 051, schema/index/version, protected template, package lock, runtime/customer data or deployment file change.

Browser routes and offline reload remain controlled harness/test-worker proof. API/PostgreSQL tests run separately against fresh disposable fixtures. No installed-PWA force-close, real browser-process restart, physical phone/camera, deployment, manual final acceptance or Level 3 proof is claimed. B1/B2 authority, the approved `10f3bbb` exception and production-build/precache follow-up must remain intact. Stop before staging; no Git mutations or next checkpoint.

