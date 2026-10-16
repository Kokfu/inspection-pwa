# CR-09 C2 — Admin/Manager repair review and assignment

Date: 2026-10-13 (Asia/Kuala_Lumpur).
Scope: section 8 **C2 only** and its implementation prompt. D1–D11 remain confirmed.
Status: **implemented; final cold runner exit 0, ALL GATES PASS, zero skips**. Independent C2 review has not occurred.

## Prerequisite and preservation

Before editing, read the **completed independent C1 re-review**, chat `01a13315-ff13-7ce3-b93e-af5065f3ef93`, turn `01a133ad-d29d-76b1-aee5-9c9c57248b59`. Its final answer explicitly says **READY FOR C2: Y; C1 INDEPENDENT REVIEW ACCEPTED: Y; SAFE FOR C1 REVIEW ACCEPTANCE: Y; P0/P1/P2 remaining: 0/0/0; NEW DEFECTS: N**. The review records 34 core, 24 default-mode, 24 hash-exact pre-C1 compatibility and 14 healthy-online cases passing, plus three independent recovery probes and standing gates. The older pending-review wording in C1 documentation is historical. Implementation tests were not substituted for this prerequisite.

The initial working tree already contained B1/B2/B3/C1 implementation, migration 051, Dexie v10, attachment reconciliation, client trackers, production/precache follow-up, phone mode and testing scripts. Those changes remain. C2 does not edit API source, applied migrations, database schemas/versions/indexes, B3 repositories/outbox/sync, C1 components, inspection forms, ordinary reports/PDF, package locks, Compose, Caddy, environment configuration or runtime/customer data. **No API contract gap or API edit was necessary.**

Migration 051 retains SHA-256 `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. The approved `10f3bbb` V6 uploader exception retains SHA-256 `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B` and is exact to that commit. Protected historical working-tree status is empty. The only protected difference from `e30c649` is this previously approved exception; all other protected historical paths remain exact.

## Behavior and authority

- Admin (`supervisor`) and Manager (`admin`) receive Repair Review in the existing Home/sidebar/mobile navigation. Service and individual-part deep links use `#/manager-repairs/<jobId>/<systemKey>/<findingId?>`; Technician (`inspector`) retains C1 Repair List and receives no review UI. Review routes are added to the existing Admin allow-list; assignment permission is still Manager-only.
- Lists identify customer, original visit reference/title, site and service. Detail identifies unit/section/failed field. ORIGINAL Before is read-only and always comes from the original accepted finding. Every submitted cycle shows its immutable remark, After photo, technician/performed/submitted timestamps and append-only decision history, including reasons, reviewer role/ID, time, sequence and request UUID. Earlier cycles are never overwritten with newer Before/After evidence.
- Each awaiting submitted part has its own Approve/Reject controls. Reject requires 3–500 characters and focuses its associated error field. There is no whole-visit report approval call or original inspection/completion mutation. Independent parts can receive different decisions in one service.
- A changed source revision shows Needs Review and blocks approval. Continue Repair / Not Required require a reason and use the current source revision and review sequence. The existing original-inspection/correction screen is linked for inspection before deciding. Not Required requires explicit confirmation; it changes repair eligibility only. Prior repairs/decisions and the original accepted inspection remain historical facts.
- Manager can create additional service work orders, assign/reassign existing orders and revoke active assignments with confirmation. The existing technician endpoint supplies only active `inspector` options after strict validation. Admin has no assignment controls, cannot call the adapter's assignment write, and cannot replay an old assignment request retained after a role downgrade. Review roles cannot use the inspector repository or submission pipeline.
- `reviewContext` requires a live App verified-authority grant plus the matching current workspace and device identity. It pins the database object, actor, role and complete auth snapshot, checking them before requests and after awaits/transactions. Cached identity alone is insufficient. Expected-user headers, same-origin credentials, `no-store`, bounded timeouts, route-instance refresh generations and component lifetime guards prevent stale callers/late responses from installing authority or confirming a request in another workspace.
- Reviewer authority and downloaded photos are held only in the current online screen. Refresh clears the prior snapshot immediately; unavailable/malformed refreshes do not restore it as current. Offline clears it. Per-part evidence failures distinguish download unavailable from integrity failure and legitimate historical absence; affected part decisions are blocked. Authentication failures invalidate the existing Manager experience. No failure deletes technician drafts, frozen records, queued operations or Blobs.
- Before bytes are checked against original hash/size/dimensions. Submitted detail binds service/finding/cycle/predecessor/actor/remark/time, manifest/photo identity, hashes and ordered decision events before displaying decoded JPEG bytes. A service/history race fails closed for that part until refreshed. Source-review projection and receipt schemas are also validated strictly.
- Each new decision, eligibility or assignment request gets a client UUID and immutable content persisted in the existing per-user `referenceData` store **before** fetch. Assignment also persists its new work-order UUID. Revision slots retain exact bodies/fingerprints; a changed-content caller cannot replace an unknown-outcome request. Exact retries read the stored request, validate UUID/fingerprint and complete receipt identity/expected sequence/revision, and require a previously confirmed receipt to remain identical. HTTP 200 alone cannot confirm. A historical replay is followed by a new authoritative read, never projected as the current service state.
- Saved request history is explicit and has Replay Exact Request. An unconfirmed new assignment blocks another new-order attempt until exact replay is resolved. No new Dexie store or repair/evidence/sync pipeline is introduced. The existing managed-reference cleanup does not own the `repair-review:request:` prefix.
- Review code is lazy-loaded from App and precached under the unchanged Workbox 2 MiB limit. Independent evidence reads use bounded groups of four. CSS additions are scoped to `repair-review-page` and existing tokens; C1 layout rules remain unchanged.

## Definition of Done

The final expanded cold runner completed with **exit 0 / ALL GATES PASS / zero skips**: **59/59 core browser cases** (17 C2 + 21 C1 + 10 B3 + 3 inspection + 8 Manager regressions), **24/24 original default-mode compatibility** and **14/14 separate healthy-online cases**, plus every standing gate below. The first cold run passed its 50/50 core and 14/14 healthy-online cases, but exited **1** because the extra Phase A default-mode suite was **23/24**, with the inherited Hose Reel readiness failure described below. That failed trial is retained, not reclassified as PASS or SKIP. The final passing run does not close the inherited intermittency.

| DoD / gate | Actual result / proof |
|---|---|
| Completed independent C1 prerequisite, explicitly READY FOR C2 | PASS — completed turn quoted above |
| Admin/Manager navigation, role boundaries and service/part deep links | PASS — real App/AppShell browser tests; Admin allow-list and inspector exclusion |
| Customer / original visit / service / unit / section / failed part | PASS — service list and comparison assertions |
| ORIGINAL Before / immutable submitted After and remark | PASS — verified JPEGs and cycle metadata; earlier original/approved cycle unchanged |
| Historical Before absence / unavailable downloads / corruption / stale authority distinct | PASS — separate UI assertions; photo hash mismatch and HTTP 503; malformed refresh clears snapshot |
| Independent approve and reject for two parts in one service | PASS — different terminal states and independent request/decision identities |
| Rejection reason required, accessible error and focus | PASS — blank rejection refuses write and focuses labeled textarea |
| Source review reason required; Continue Repair / Not Required | PASS — current revision/sequence, required reason, explicit confirmation and history |
| Correction eligibility and correction-versus-decision races | PASS — C2 stale correction browser proof; B1/B2 actual advisory-lock races on disposable PostgreSQL |
| Decision / eligibility / assignment UUIDs durable before writes | PASS — every controlled POST asserts the exact request was already saved in IndexedDB |
| Exact decision / source / assignment response-loss replay | PASS — same UUID and entire body after reload; no duplicate event/order |
| Changed-content conflict under an existing mutation identity | PASS — browser caller conflict and retained request; B1/B2 server idempotency conflicts |
| Mismatched HTTP 200 receipt fails closed | PASS — wrong request identity never receives a local confirmation |
| Persistence failure blocks API write | PASS — injected IndexedDB request-save failure sends no POST |
| Stale review / source-review / work-order revisions | PASS — distinct errors, no stale screen restored and exact requests retained |
| Competing decisions and source-review races | PASS — browser stale decision; B1/B2 concurrent decision/review tests |
| Manager assignment / reassignment / revocation / active-Technician filter | PASS — controlled UI revisions/replay; B1/B2 actual authorization/auditing |
| Alternate-Technician access and revoked caller refusal | PASS — retained B1/B2 integration and C1/B3 browser coverage; no ordinary ownership widening |
| Admin review does not grant assignment/replay or Technician submission | PASS — absent controls, adapter refusal, role-downgrade saved-request refusal and inspector context denial |
| Online decisions; cached identity and offline fail closed | PASS — false grant denied, actual offline screen cleared, no offline mutation |
| Authority failures retain drafts / frozen data / operations / Blobs | PASS — C2 retained bytes/record/outbox and C1/B3 regressions |
| Stale caller / actor / workspace / late response | PASS — edited saved request, actor/workspace replacement and route-superseded refresh cannot confirm |
| Immutable repeated-cycle repair/decision/source history | PASS — approved prior cycle and new independent cycle; append-only history preserved |
| 360×800 / 768×1024 / 1280×800 Admin comparisons | PASS — screenshots, stacked/two-column comparisons, no overflow |
| Manager assignment/source review at all three viewports | PASS — labeled select/reason fields, validation/focus, 44px targets, overflow and screenshots |
| 44px targets, 16px inputs, labels, visible focus, linked errors | PASS — browser dimensions/computed-style/focus assertions and scoped UI audit |
| Existing Technician C1 behavior | PASS — 21 C1 cases in first full cold run |
| Existing B3 data/sync preservation | PASS — 10 B3 cases in first full cold run |
| Existing inspection browser dispatch and refusal | PASS — 3 cases in first full cold run |
| Manager auth / navigation / normal report approval / Final Report | PASS — 8/8 existing browser cases in final focused regression run |
| Chromium executable available | PASS — checked by cold runner |
| API typecheck | PASS — cold runner |
| API build | PASS — cold runner |
| Historical matrix | PASS — 20/20 |
| V6 evidence/storage/compatibility | PASS — 11/11 |
| Wet Chemical definition | PASS — 2/2 |
| V7 contracts / environment configuration | PASS — 38/38 |
| B1 finding readers | PASS — 22/22 |
| B1 foundation integration | PASS — 10/10 |
| B2 submission/decision integration | PASS — 18/18 |
| Attachment storage reconciliation | PASS — 1/1 |
| V6 integration | PASS — 1/1 |
| CO2 V7 integration | PASS — 4/4 |
| Wet Chemical V7 integration | PASS — 2/2 |
| Fire Alarm V7 integration | PASS — 4/4 |
| V7 evidence race | PASS — 1/1 |
| Optional-photo / ordinary report-PDF regression | PASS — 14/14 |
| Web typecheck | PASS — cold runner plus final adapter typecheck |
| NODE_ENV=production web build | PASS — final cold run; reviewer chunk 27.24 kB, React chunk 222.53 kB, app chunk 1,199.58 kB |
| Production precache / registration / controller-change contract | PASS — 3/3; 11 entries, all 3 JavaScript chunks below unchanged 2 MiB limit |
| Web stale evidence | PASS — 1/1 |
| C2 + C1 + B3 + inspection + Manager browser suite | PASS — final 59/59; prior focused C2+Manager 24/24 |
| Original default-mode Phase A entry / retired-draft compatibility | PASS final 24/24; first trial FAIL 23/24 remains recorded; inherited readiness intermittency retained |
| Separate healthy-online current-entry / accepted-display | PASS — 14/14, not a replacement for default-mode proof |
| Inspection auto-sync / queued-write refusal | PASS — 8/8 and 8/8 |
| Historical-file status / approved baseline exception | PASS — protected status empty; exact exception and migration hashes above |
| B1/B2/B3/C1 authority / Dexie v10 / protected and unrelated work | PASS — C2 edits only the file list below; no API/schema/evidence/sync pipeline edit |
| UI/React companion audit | PASS — semantic controls/labels, unique linked errors, visible focus, token-only responsive additions, bounded independent reads and conditional module loading |
| Documentation / whitespace / scope stop | PASS — handover/plan/report updated, final git diff --check clean; no staging, Git mutation, deployment or next checkpoint |

## Files changed by C2

| File | Reason |
|---|---|
| `apps/web/src/App.tsx` | Role-gated reviewer routes, lazy screen, service/part deep links retained through verified role/login paths; existing C1 integration preserved |
| `apps/web/src/layout/AppShell.tsx` | Repair Review icon in existing navigation renderer |
| `apps/web/src/manager/ManagerHome.tsx` | Shared Manager/Admin Repair Review navigation and Home destination |
| `apps/web/src/manager/roleAccess.ts` | Allow Admin reviewer list/detail routes without assignment permissions |
| `apps/web/src/styles/app.css` | C2-only token-based forms, target sizes, focus and wrapping |
| `apps/web/src/repairs/repairReviewRepository.ts` | Live reviewer context, strict online authority/evidence adapters, durable exact mutation/receipt/replay contracts |
| `apps/web/src/repairs/RepairReview.tsx` | Service comparisons, per-part decisions, eligibility/history, Manager assignment/replay and fail-closed refresh |
| `apps/web/tests/repair-c2.html` | Controlled fixture mounting real App/AppShell/C2 modules and real IndexedDB |
| `apps/web/tests/repair-c2.spec.ts` | C2 browser role/layout/reason/idempotency/stale/failure/history/preservation regressions |
| `scripts/testing/verify-cr09-c2.ps1` | Own cold disposable database, forced URLs, standing gates, C1/B3/C2/inspection and Manager regressions |
| `HANDOVER.md` | Current C2 checkpoint, completed C1 acceptance evidence and limits/debt |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | C1 accepted and C2 implementation-review status; D/Level 3 remain unbuilt/unrun |
| `docs/testing/CR09_C2_IMPLEMENTATION_REPORT.md` | This full DoD, results, cold commands, findings and proof limits |

## Reproduce from cold

PowerShell; Docker, installed Playwright Chromium and free port 55432 are required:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-c2.ps1
```

The runner creates a fresh uniquely named disposable PostgreSQL at **127.0.0.1:55432**, validates the target and forces **BOTH DATABASE_URL and SEED_INTEGRATION_DATABASE_URL** regardless of prior values. API fixtures run under **NODE_ENV=test** with temporary uploads; pool-closing suites run in separate processes. Web build runs under **NODE_ENV=production**. The runner restores prior environment values and removes only its own container. Nonzero gates and nonzero skips fail it. No runtime/customer writes, Compose startup, production materialization or deployment occur.

Focused final UI/Manager regression command actually run:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
$env:NODE_ENV='test'
npx.cmd playwright test tests/repair-c2.spec.ts tests/manager-dashboard-navigation.spec.ts tests/manager-app-auth-transitions.spec.ts tests/manager-report-approval.spec.ts tests/manager-final-report-navigation.spec.ts tests/manager-final-report-failure-matrix.spec.ts --workers=1
```

Protected checks actually run:

```powershell
cd C:\PWA_OfflineRecordWebApp
git status --short -- apps/api/src/inspections/templates 'apps/api/migrations/017*' 'apps/api/migrations/018*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff e30c649 --name-only -- apps/api/src/inspections/templates/masterServiceReportV1.ts apps/api/src/inspections/templates/masterServiceReportV2.ts apps/api/src/inspections/templates/masterServiceReportV3.ts apps/api/src/inspections/templates/masterServiceReportV4.ts apps/api/src/inspections/templates/masterServiceReportV5.ts apps/api/src/inspections/templates/masterServiceReportV6.ts 'apps/api/migrations/017*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
git diff 10f3bbb -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts
git diff --check
```

Protected status: **no entries**. Baseline name-only output: `apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts` only, with empty `git diff 10f3bbb` for that exact approved exception. Historical V1–V5, Fire Alarm V6, CO2 V1 and Wet Chemical V4 immutability is intact under the approved exception.

## Findings, inherited debt and limits

**P0 remaining: 0 identified. P1 remaining: 0 identified. New C2 P2: 0 identified. Inherited P2 validation debt: 1 intermittent Phase A Hose Reel fixture-readiness item.** Owner: later **Phase A/ordinary-inspection acceptance checkpoint**, with independent C2 review to assess its effect on the present evidence. It is retained and not falsely closed by C2. The first cold run failed `repair-disabled.spec.ts:10` waiting for Save Draft in the Hose Reel new-form case. The same assertion is recorded failing against the hash-exact pre-C1 App in `logs/cr09-c1-prechange-hose.log`, `logs/cr09-c1-rereview-prechange-hose.log` and `logs/cr09-c1-independent-prechange-hose.log`. The C1 completed review subsequently passed all 24 corrected fixtures and accepted C1; C2 preserves that acceptance and its earlier history. A passing rerun does not prove this intermittent debt is eliminated. No original fixture, inspection form, validator or assertion was edited by C2.

Evidence: first cold `logs/cr09-c2-first-cold-gates.log` (exit 1, zero skips, one inherited fixture failure), focused `logs/cr09-c2-final-web-regressions.log` (24/24, exit 0) and final cold `logs/cr09-c2-gates.log` (exit 0, ALL GATES PASS, zero skips; 59 + 24 + 14 browser cases). Admin screenshots: `logs/cr09-c2-360.png`, `-768.png`, `-1280.png`; Manager assignment/source screenshots: `logs/cr09-c2-manager-360.png`, `-768.png`, `-1280.png`. Phone and desktop images were also visually inspected. The residual P2 does not leave a missing current C2 proof: the final required suites passed, including the actual retired-draft offline assertions. The later Phase A/ordinary-inspection acceptance owner must still resolve intermittent fixture readiness; no determinism or release acceptance is claimed here.

The initial sandboxed Vite startup did not reach collection and was stopped; required browser/cold checks ran outside that sandbox after approval. The first focused UI run was 10/11 because its replay assertion assumed random UUID key order equaled submission order. It now compares the replayed identity with the matching earlier request; validators were not weakened. Those failed/stopped development runs are not credited as PASS.

Browser evidence uses controlled HTTP routes and real per-user IndexedDB, plus retained C1/B3 test-worker offline flows. API/server authority, actual database races, audit/idempotency and report/PDF integration are separately tested against fresh disposable PostgreSQL. **No single live browser-to-PostgreSQL repair flow is claimed.** No installed-PWA force-close, real browser-process restart, physical phone/camera, HTTPS/customer-network, production container persistence, deployment, manual final acceptance or Level 3 proof was performed. The production/precache publication and phone acceptance follow-up remains owned by the later authorized acceptance checkpoint; a build/precache test is not deployment proof. The ordinary >500 kB build advisory remains informational.

No repair PDF/export UI, Phase D or next-checkpoint work.

**SAFE FOR C2 REVIEW: Y.**
**PHASE C REPAIR WORKFLOW READY: Y for implementation review.**
**C2 INDEPENDENT REVIEW ACCEPTED: N. PHASE C INDEPENDENT ACCEPTANCE: N.**
Stop before staging. No Git mutations or manual final acceptance.
