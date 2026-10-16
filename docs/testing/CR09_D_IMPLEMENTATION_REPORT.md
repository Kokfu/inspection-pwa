# CR-09 / CR-10 D — Approved-subset repair report and PDF

Date: 2026-10-13 (Asia/Kuala_Lumpur). Scope: section 8 D and its implementation prompt only. D1–D11 remain confirmed.

Latest checkpoint: both inherited browser-fixture blockers are remediated with concrete regression evidence. The final cold runner passes every required gate (68 core + 24 original compatibility + 14 healthy-online browser cases, zero skips). Final D review acceptance: Y. Ready for owner Level 3 acceptance: Y; Level 3 itself remains NOT RUN. See the final acceptance addendum below. Earlier pending/rejected verdicts remain historical records.

## Independent C2 prerequisite

Before editing, inspected the completed **Review CR-09/CR-10 section 8 C2** chat `01a133ed-1726-7e40-8677-edc5b8c8b803`, completed turn `01a13473-551b-7f51-b4a9-430a139d384a`. Its final answer explicitly states:

- `C2 INDEPENDENT REVIEW ACCEPTED: Y`
- `PHASE C REPAIR WORKFLOW REVIEW ACCEPTED: Y`
- `READY FOR D: Y`
- P0: 0; P1: 0; NEW DEFECTS: N.

The review retains one inherited intermittent Phase A Hose Reel fixture-readiness P2 for the later Phase A/ordinary-inspection acceptance owner. It does not waive a required gate. C2 implementation readiness was not substituted for this prerequisite. Older pending-review wording in the C2 implementation report and prior handover entries is historical.

## Implementation and authority

Repair export is separate from ordinary service reports and report approvals. Admin (`supervisor`) and Manager (`admin`) open **Repair Export** from the existing service-specific Repair Review. Technician (`inspector`) gets no export capability. Existing C1 offline drafts/capture/Submit and B3 sync remain unchanged.

The user selects individual approved cycles explicitly; no cycle or finding is selected automatically. Older and repeated cycles have separate checkboxes with unit, section, field, sequence and UUID. Pending/rejected/withdrawn and source-ineligible cycles remain outside the selector and visible in the underlying C2 history. A preview is required before issuance. New issuance is blocked while an earlier saved request has an unknown outcome; that exact request remains available for replay. Explicit server refusals known to precede commit are retained as **Not issued**, allowing a refreshed selection/new UUID. Authentication, transport, malformed receipts and idempotency/concurrency conflicts stay unknown; HTTP 200 alone never resolves them.

API requests contain one original job + system, request UUID, and 1–100 explicit selections. Each selection identifies a submitted repair UUID, approval sequence, current source revision and source-review sequence. UUID ordering canonicalizes the set; it never substitutes a newer cycle. Unknown keys, duplicate entries, foreign/mixed services, absent server records, pending/rejected/withdrawn approvals and stale source/approval/review sequences are refused.

Fresh preview/issuance validates original accepted source identity and fingerprint through B1 extraction, including frozen template/contract and bound original evidence. D exports the existing B2 `boundEvidence` validator without changing its implementation: the exact immutable repair submission fingerprint, author, manifest and single accepted/bound After evidence must agree, and file bytes/hash/JPEG dimensions are checked. Drafts, local Pending data and unbound staged photos never supply report content. A legitimately absent historical Before is labelled **Historical finding: no original Before photo**. Missing/corrupt required evidence is an error, never that historical label.

Approval is checked against the append-only decision sequence, reviewer role and the decision's audited request fingerprint/source revision. Current source eligibility uses the existing reviewed B1 authority. Report content comes from those server records, not a client snapshot. The issued body contains ORIGINAL Before result/photo/remark, immutable After photo/remark, original customer/visit/service/unit/section/field, explicit cycle/repair identity, verified Technician identity with performed/submitted dates, and reviewer identity with approval date/sequence. Times are formatted in Asia/Kuala_Lumpur.

The repair template reuses the actual service-report CSS, live company profile/logo resolver, Noto Sans/DejaVu font embedding, A4 landscape size, letterhead, navy section/table styling, page-number/footer format and existing `renderHtmlToPdf` engine. Its named `repair` page and top alignment within the reserved header margin preserve the running header on issued part breaks and remark continuation pages. Both header/footer text on each issued page and rendered header ink were checked; Poppler and PDFium renders were inspected. Dynamic text uses the existing HTML/CSS escaping functions. The preview iframe is sandboxed without script or same-origin privileges and scrolls inside its own contained frame.

### Migration scope and immutable issuance

Rechecked migration files: 051 was the highest existing numbered migration; **052_repair_exports.sql** was free. This forward migration adds only `repair_exports`, its service lookup index, identity number sequence and append-only update/delete/truncate triggers using the existing repair append-only function. Applied migrations, migration 051, PostgreSQL inspection schema, Dexie v10/stores/indexes and package locks are unchanged.

The new table freezes export UUID, global request UUID/fingerprint, issuing actor, original job/system, report number, selected repair UUIDs/cycles/finding IDs/approval IDs and sequences/source revisions/review sequences, issued timestamp, rendered HTML (including fonts/branding/evidence data URIs), exact generated PDF bytes and SHA-256. The stored issued artifact is independent of container-local temporary rendering files and subsequent branding/evidence/authority changes. Uploaded inspection/repair photos continue using their existing uploads storage. The PostgreSQL document copies are necessary to preserve the exact issued presentation and PDF, rather than regenerating old documents from mutable branding or later eligibility.

Before the issuance API call, the browser persists UUID/content/fingerprint in the existing per-user IndexedDB `referenceData` store under `repair-export-request:`. No Dexie migration or generic sync operation was added. The request is retained across response loss/reload. Server uniqueness + request lock produce one export for concurrent identical requests; exact retries return the original identity/number/selection even after later withdrawal/correction. Changed content or issuing actor under that UUID conflicts. Client receipt validation checks exact UUID/fingerprint/service/selection and stable replay identity, never HTTP 200 alone.

Issued history never rewrites a document. It shows the frozen cycles and current validity per selected UUID: current, approval withdrawn, approval changed, source eligibility changed or authority unavailable. An earlier issued PDF remains downloadable with its original bytes after withdrawal or source correction. The history explicitly says that approval was withdrawn after issuance; it does not present the old document as a new current approval. Downloads are role gated, no-store, identity guarded and verify the frozen PDF digest.

### Consistent snapshot / locking

Issuance/preview acquire active-actor share authority, then the existing service advisory lock. They gather the immutable selected record identities, acquire **all selected correction locks in sorted form-ID order**, then sorted finding row locks, before reading source revisions, source reviews, approval events and evidence. No API call assembles these from separately committed DTO reads. B2 decisions/submissions share the service lock; B1 source reviews and ordinary corrections share correction locks. Locks remain held through PDF rendering, insertion, audit and commit. READ COMMITTED queries after lock acquisition therefore read the serial authority, including changes committed while the caller was waiting. Deadlocks/serialization conflicts use the existing transaction failure mapping and rollback.

Role, live App grant, device auth token, captured database object and workspace ID are pinned across browser awaits and IndexedDB transactions. Offline events/unmounts/generation changes clear displayed authority and preview; late responses cannot confirm another actor/workspace's request. Initial effects handle React Strict Mode cleanup without revoking a valid remount.

## Full Definition of Done

Final result rows below combine the full cold run with the final focused rerun after the PDF header correction and added commit-lock race test. A skip is not a pass.

| Requirement / gate | Result | Actual proof |
|---|---|---|
| Completed independent C2/Phase C prerequisite, no relevant P0/P1 | PASS | Completed review turn and exact flags above |
| D only; D1–D11; preserve unrelated/reviewed B/C work | PASS | Only D files/additions listed below; no next-checkpoint implementation |
| Separate repair report; existing branding/header/footer/fonts/format/engine | PASS | Shared CSS/profile/fonts/engine; named-page PDF; ordinary report source untouched |
| Explicit exact approved subset from one original job + system | PASS | D PostgreSQL integration and browser subset receipts |
| Explicit older/repeated cycle selection and immutable ORIGINAL Before | PASS | Two cycles of one finding selected by separate UUIDs; pending other part omitted |
| Original finding/photo/remark, After/photo/remark, unit/section/cycle, Technician/date and reviewer/date | PASS | Frozen template and representative generated document |
| Foreign/mixed-service and unauthorized export refusal | PASS | Direct API functions plus mounted production Express routes: unauthenticated 401, Technician 403, expected-actor mismatch 409 |
| Draft/pending/rejected/withdrawn/unbound evidence excluded/refused | PASS | Server-record/approval/evidence tests and explicit browser selector |
| Both exact JPEG byte streams embedded in PDF | PASS | `pdf-lib` reads image streams and compares original Before and normalized After Buffers |
| Historical Before absence distinct from required evidence unavailable/corrupt | PASS | Historical label and required Before/After file deletion/corruption/unbinding refusal |
| Escaped/long remarks, pagination and page breaks | PASS | Script-like text escaped; ~3,800-character remark spans continuation; >=3-page assertion; four rendered pages |
| Render and visually inspect representative PDF pages | PASS | Poppler PNGs of all four final pages; letterhead, photos, header/footer and continuation inspected |
| New forward migration; freeze identity/number/selection/authority/presentation/time | PASS | 052 only; replay/migration gates; immutable table triggers and stored exact PDF |
| Persist request UUID/content before mutation | PASS | Browser API interception asserts IndexedDB request exists before POST |
| UUID replay, changed-content conflicts and concurrent issuance | PASS | Same UUID returns one row/number/selection; actor/global content conflicts; lost response + reload/replay; local changed request guard |
| Confirmed refusal recovery distinct from unknown outcome | PASS | Stale issuance refusal retained without receipt; refresh/new UUID issues once; unknown receipt/transport outcomes still require replay |
| Withdrawal/source-correction/export races and immutable issued history | PASS | Both authority-first and export-first lock tests, actual correction insertion, concurrent correction/withdrawal during held issuance commit, immutable downloads/history |
| Consistent record/approval/source snapshot and lock order | PASS | Transaction implementation and deterministic lock-blocking assertions |
| Stale approval/source/review callers fail closed | PASS | PostgreSQL expected-sequence/revision refusal; browser stale-preview/refreshed-history refusal |
| Stale actor/workspace/grant and late receipt guards | PASS | Browser actor-change late receipt stays unconfirmed; explicit workspace/current-grant guards prevent POST; inherited C2/B3 guard regressions |
| Online-only reviewer preview/issuance/history; failures fail closed | PASS | Offline clears preview/export authority; malformed history/receipt never confirms; exact request retained |
| Role-gated preview/selection/download/issued-history UI | PASS | Production App harness; Technician has no export control; Admin selection, preview, issue, download and withdrawal validity |
| Browser UI 360×800, 768×1024, 1280×800 | PASS | Viewport assertions, full-page and preview viewport screenshots; visual inspection |
| Labels/focus/linked errors/44px targets/no page overflow | PASS | Empty selection focuses labelled checkbox; fieldset error link; target bounds; overflow assertions including preview |
| Technician offline work and C1/C2 regressions | PASS | B3 10 + C1 21 + C2 17 cases included in full cold browser suite |
| Ordinary inspection/report approval/Final Report/PDF regressions | PASS | 3 inspection + 8 Manager browser cases; historical/V6 and optional-photo PDF gates; ordinary report code unchanged |
| API typecheck/build | PASS | Full and final focused cold runner |
| Historical matrix | PASS | 20/20 |
| V6 evidence / Wet Chemical definition | PASS | 11/11 and 2/2 |
| V7 evidence contracts + config | PASS | 38/38 |
| B1 readers / B1 integration / B2 integration / storage reconciliation | PASS | 22/22, 10/10, 18/18, 1/1 |
| V6 integration / CO2 V7 / Wet Chemical V7 / Fire Alarm V7 / V7 evidence race | PASS | 1/1, 4/4, 2/2, 4/4, 1/1 |
| Optional-photo / ordinary report-PDF integration | PASS | 14/14 |
| Web typecheck / NODE_ENV=production web build | PASS | Production React; separate RepairReview chunk |
| PWA build contract / V7 stale evidence | PASS | 3/3 and 1/1; 11 precache entries; default 2 MiB per-chunk limit unchanged |
| Core browser suite including D/C2/C1/B3/inspection/Manager | PASS | 67/67, zero skips: 8 D + 59 prior cases |
| Phase A original default/retired-draft compatibility | PASS | 24/24 this run; does not close inherited intermittency |
| Separate healthy-online entry/accepted-display regressions | PASS | 14/14 |
| Auto-sync / queued-write guards | PASS | 8/8 each |
| Protected historical status + approved exception | PASS | Protected working-tree status empty; 051/V6 hashes unchanged; approved `10f3bbb` is sole historical exception |
| git diff --check | PASS | CRLF warnings only; final check after documentation edits |
| Fresh disposable-only database, both URL overrides, zero skips | PASS | Each cold runner creates its own uniquely named DB container on 127.0.0.1:55432 and removes only that container |
| No runtime/customer writes, production backfill, deployment, Level 3 or Git mutations | PASS | Fixture-only writes and disposable uploads; stopped before staging |

## Changed files and reasons

Paths are repository-relative in this table; existing unrelated changes were not staged, reverted or reformatted.

| File | D change / reason |
|---|---|
| `apps/api/migrations/052_repair_exports.sql` | Necessary new forward issued-document table, numbering/index and append-only protection; no unrelated DDL |
| `apps/api/src/db/migrations.ts` | Register 052 after existing 051 with table-presence replay marker |
| `apps/api/src/repairs/repairExports.ts` | Strict selection, authoritative locks/evidence/approval, preview, idempotent issuance, immutable downloads and current validity |
| `apps/api/src/repairs/repairReport.ts` | Separate escaped repair HTML using existing report presentation assets/fonts/profile and PDF engine |
| `apps/api/src/repairs/repairSubmission.ts` | Export existing bound-evidence validator for D reuse; no validator logic change |
| `apps/api/src/routes/repairs.ts` | Add role-gated preview/issue/history/download routes under existing auth/no-store/expected-actor guard |
| `apps/api/src/repairs/repairExports.integration.test.ts` | Disposable source/repair fixtures, subset/evidence/PDF/replay/race/history/route proofs |
| `apps/web/src/repairs/repairExportRepository.ts` | Existing IndexedDB store request persistence; exact receipt validation and actor/workspace/current-grant guards |
| `apps/web/src/repairs/RepairExport.tsx` | Explicit selection, sandboxed preview, online issue, replay, download and validity history |
| `apps/web/src/repairs/RepairReview.tsx` | Service-specific open/close export control; preserve C2 review/assignment behavior |
| `apps/web/src/styles/app.css` | D-scoped token-based choice hit targets and contained report preview |
| `apps/web/tests/repair-d.spec.ts` | Real App/IndexedDB controlled-browser tests and three-width screenshots |
| `scripts/testing/verify-cr09-d.ps1` | Own cold disposable DB; force both URLs; test/production separation; standing/D checks; fail on skip |
| `docs/testing/CR09_D_IMPLEMENTATION_REPORT.md` | D DoD/evidence/commands/preservation/limitations/review handoff |
| `docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md` | Record independent C2 prerequisite and D implementation status; owner acceptance remains blocked |
| `HANDOVER.md` | Current checkpoint with D implementation/review boundary and inherited owners |

Protected historical working-tree status command returns **no entries**:

```powershell
git status --short -- apps/api/src/inspections/templates 'apps/api/migrations/017*' 'apps/api/migrations/018*' apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts apps/api/src/sync/fireAlarmV6Acceptance.ts apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
```

Migration 051 SHA-256 remains `BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E`. Approved V6 uploader exception file hash remains `A92914DB2017FAF49611DB132E70329762723409536027E1337355526ACFDA7B`. V1–V5, Fire Alarm V6, CO2 V1 and Wet Chemical V4 are unchanged in this task. No report/template/PDF-engine file under the ordinary reports directory was edited.

## Actual runs and cold reproduction

`logs/cr09-d-gates.log`: final full cold runner **exit 0, ALL GATES PASS, zero skips**, 67 core + 24 original compatibility + 14 healthy-online browser cases and all standing gates; D integration 11/11. `logs/cr09-d-first-full-gates.log` preserves the earlier passing full run (66 core cases, earlier D integration 10/10). The final focused cold run also covers the issued header and added export-held-through-commit race with 11/11 D tests; standing B1/B2/storage and API build/typecheck also rerun. `logs/cr09-d-focused.log` holds that output; `logs/cr09-d-first-focused.log` preserves the initial 8/8 D focused run. A supplementary post-recovery D+C2 browser run passes 25/25.

Development browser runs initially exposed a Strict Mode cleanup/remount bug (fixed in the D effect) and incorrect test expectations for existing App offline/reload role behavior (corrected without changing App authority). No failed trial is counted as pass. The full cold final browser suite passed all 8 D cases. Issued/preview PDF probes led to named page assignment and top alignment within the header margin; final pages were re-rendered and inspected, with per-page text plus rendered-ink checks. Final code review also found and fixed the confirmed-refusal recovery trap before handoff. No validator/test expectation was weakened to accept invalid data.

Cold, verbatim commands; neither depends on an already running database or an inherited DATABASE_URL:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-d.ps1
if ($LASTEXITCODE -ne 0) { throw 'D cold gates failed' }
```

The runner starts a fresh unique `postgres:16-alpine` container with only `127.0.0.1:55432:5432` published, waits for three successful TCP readiness checks, sets **both** `DATABASE_URL` and `SEED_INTEGRATION_DATABASE_URL` to its disposable fixture database, sets `NODE_ENV=test` for API fixtures and `NODE_ENV=production` for the web build, and uses temporary uploads. It restores caller environment and removes only its own container in `finally`. Port collision fails rather than using another database. No Compose operation occurs. `-FocusedOnly` starts a separate fresh database and runs API typecheck/build plus D/B1/B2/storage focused checks; it is not a substitute for the full standing browser/web gates.

Actual supplementary final command:

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-d.ps1 -FocusedOnly
if ($LASTEXITCODE -ne 0) { throw 'Final D focused gates failed' }
& 'C:\Users\kokfu\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe' -scale-to 1400 -png logs/cr09-d-representative.pdf logs/cr09-d-pdf
if ($LASTEXITCODE -ne 0) { throw 'PDF rasterization failed' }
git diff --check
```

Generated representative evidence: `logs/cr09-d-representative.pdf`, `logs/cr09-d-representative.html`, Poppler `logs/cr09-d-final-page-1.png` through `-4.png`, plus PDFium cross-checks; browser `logs/cr09-d-{360,768,1280}.png` and `logs/cr09-d-preview-{360,768,1280}.png`. These are synthetic fixture artifacts, not customer reports or manual owner acceptance.

## Findings, owners and limitations

- **P0 remaining: 0. P1 remaining: 0** identified in D implementation checks. New D P2: 0.
- **Inherited P2: 1**, intermittent Phase A Hose Reel fixture readiness in `apps/web/tests/repair-disabled.spec.ts:8–10`. This run is 24/24; that does not prove intermittency closed. Existing Phase A/ordinary-inspection acceptance owner retains deterministic closure and the earlier C2 failed log. D does not refactor that fixture.
- Production publication/precache follow-up and existing validation debt retain their prior owners/checkpoints. The production build passes the current unchanged precache contract; that does not establish deployed offline behavior. The existing >500 kB bundler advisory remains; all chunks are under the unchanged 2 MiB precache limit.
- Selection is bounded to 100 cycles per issued document. Issuance renders under authority locks (30-second engine timeout; browser request timeout 60 seconds); large exports can hold relevant reviewers/corrections until completion or rollback. Database storage includes exact document/HTML copies to preserve issued evidence; retention/capacity planning belongs to later deployment acceptance.
- Preview/browser proof uses controlled HTTP routes and real IndexedDB in the production App. PostgreSQL/API/PDF proof runs separately against fresh disposable PostgreSQL. **No live browser-to-PostgreSQL claim.** Synthetic colored JPEGs prove byte inclusion/layout, not physical camera quality.
- Installed-PWA force-close, browser-process restart, physical phone, production Docker/HTTPS/persistence, production migration/backfill, deployment and owner manual final acceptance/Level 3 were **not performed**. They remain with the explicit owner Level 3 checkpoint after independent D review.
- D implementation is not independent D acceptance. **Independent D acceptance: N (pending separate read-only review).** Owner Level 3 remains blocked until that review passes. This task performs no acceptance or next-checkpoint work.

**SAFE FOR D REVIEW: Y**

**READY FOR OWNER LEVEL 3 ACCEPTANCE: N**

Stop before staging. No Git mutations were performed.

## Independent D review remediation — 2026-10-13

The independent review's cold runner exited 1: original default-mode compatibility was 23/24, with Hose Reel timing out at the Save Draft assertion. All other gates passed. That failed run is preserved in `logs/cr09-d-independent-failed-gates.log`; subsequent passing output does not erase it.

The fresh Hose Reel fixture requires its row-setup step. The test previously used an immediate `Start Inspection` count to decide whether to perform it. A held-authentication browser probe reproduced the concrete timing window: after network reconciliation began, the button count was **0**. Releasing the authentication response, waiting for Start Inspection, clicking it, and checking Save Draft succeeded. The old conditional could silently skip this required setup while the form was temporarily unmounted.

`apps/web/tests/repair-disabled.spec.ts` now explicitly waits for the required Hose Reel Start Inspection control before clicking it. The existing Save Draft, result-control and Complete Repair exclusion assertions remain unchanged. Default API-failure mode, offline retired-draft coverage, timeouts, retries and skip policy remain unchanged. No production source, harness mode, validator, API, PDF authority, migration or Dexie schema was changed by this follow-up.

### Remediation Definition of Done

| Requirement / gate | Actual result |
|---|---|
| Preserve independent failure and inherited ownership | PASS — failed cold log retained; independent closure remains with D re-review and Phase A/ordinary-inspection acceptance owner |
| Fix the missing-button setup branch without weakening assertions | PASS — required Hose Reel setup is awaited explicitly |
| Concrete timing-window proof | PASS — held authentication produced zero Start buttons; awaited recovery reached Save Draft |
| Focused default-mode repetitions after fix | PASS — 30/30, zero skips |
| Pre-fix supplementary repetitions | 10/10 passed; this did not close the already reproduced intermittency |
| Fresh disposable-only full D runner | PASS — exit 0, ALL GATES PASS, zero skips; both URLs forced, API test environment, production web build |
| API typecheck / build | PASS / PASS |
| Historical matrix / V6 evidence / Wet Chemical definition | PASS — 20/20, 11/11, 2/2 |
| V7 evidence contracts / config | PASS — 38/38 |
| D export integrity and PDF races | PASS — 11/11 |
| B1 readers / B1 integration / B2 integration / storage reconciliation | PASS — 22/22, 10/10, 18/18, 1/1 |
| V6 / CO2 V7 / Wet Chemical V7 / Fire Alarm V7 / evidence race | PASS — 1/1, 4/4, 2/2, 4/4, 1/1 |
| Optional-photo and ordinary PDF integration | PASS — 14/14 |
| Web typecheck / production build | PASS / PASS |
| PWA build contract / stale evidence | PASS — 3/3, 1/1 |
| Core browser suite | PASS — 67/67, including D/C2/C1/B3 and inspection/Manager regressions |
| Original default-mode entry and offline retired-draft compatibility | PASS — 24/24, including Hose Reel new entry and offline retired draft |
| Separate healthy-online entry/display | PASS — 14/14 |
| Auto-sync / queued-write guards | PASS — 8/8 each |
| Protected historical working-tree status | PASS — no entries; approved V6 exception retained |
| Migration 051 / Dexie v10 / reviewed B/C authority | PASS — preserved; 051 hash still BF057005856ED16580E4D6EDEE587A1B86121C5313940694325F0421A569694E |
| git diff --check | PASS — CRLF warnings only |

Current cold output is `logs/cr09-d-gates.log`. Focused repetitions and the held-auth probe are recorded in this chat's tool results. Reproduce:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npx.cmd playwright test tests/repair-disabled.spec.ts --grep 'hose_reel: new form' --repeat-each=30 --workers=1
if ($LASTEXITCODE -ne 0) { throw 'Hose Reel readiness repetitions failed' }
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-d.ps1
if ($LASTEXITCODE -ne 0) { throw 'D cold gates failed' }
git diff --check
```

Files changed by this follow-up only:

- `apps/web/tests/repair-disabled.spec.ts`: await required Hose Reel row setup through startup reconciliation.
- `docs/testing/CR09_D_IMPLEMENTATION_REPORT.md`: preserve the rejected gate and record remediation evidence/limits.
- `HANDOVER.md`: record the current remediation and independent re-review boundary.

P0 remaining: 0. P1 remaining: 0. New defects identified in this follow-up: 0. The inherited P2 has an implemented readiness fix with timing-window and regression evidence; independent closure is pending re-review, not inferred from passing reruns. Existing production/precache follow-up and other validation debt retain their owners. No live browser-to-PostgreSQL, installed-PWA force-close, physical-phone, deployment, production persistence or Level 3 proof was performed. No runtime/customer writes, staging or Git mutations.

**SAFE FOR D RE-REVIEW: Y**

**D INDEPENDENT REVIEW ACCEPTED: N — pending re-review**

**READY FOR OWNER LEVEL 3 ACCEPTANCE: N — pending independent D acceptance**

## Final fixture remediation and D acceptance — 2026-10-13

The next read-only re-review verified the Hose Reel fix, including the held-authentication timing window and 24/24 original compatibility cases. It nevertheless rejected acceptance because the required core browser gate was 66/67: C1's 768×1024 case raised `route.fulfill: Route is already handled!` in its service fixture. That failed run is retained in `logs/cr09-d-c1-route-failed-gates.log`; the earlier Hose Reel failure remains in `logs/cr09-d-independent-failed-gates.log`.

The owner explicitly requested fixing the P2 and continuing until ready for Level 3 acceptance. Only the C1 fixture lifecycle was changed. The installed Playwright implementation removes interception before its `unrouteAll({ behavior: "wait" })` callback wait, which can continue an in-flight request while its handler is still awaiting `page.evaluate`. C1 now tracks every registered fixture callback, blocks new fetches, drains those callbacks while the page and interception remain alive, and only then removes interception. `try/finally` releases tracking; handler failures still propagate. There is no `ignoreErrors`, blanket error suppression, retry increase, timeout increase or changed business assertion.

The new held-route regression verifies that interception stays installed until the held callback is released, then checks the exact controlled JSON response. It fails with the old teardown order (recorded exit 1 in `logs/cr09-c1-route-before-fix.log`) and passes with the fix. An initial receipt-only version did not detect premature removal; the explicit ordering assertion was added before adopting the regression. No failed trial is counted as passing evidence.

All C1 cases pass 22/22 (`logs/cr09-c1-route-focused.log`). The new regression and formerly failing tablet case pass 20/20 across ten repetitions each (`logs/cr09-c1-route-repeated.log`). The final full cold runner exits 0, reports ALL GATES PASS and zero skips (`logs/cr09-d-gates.log`). The exact fixture tested by these runs remains unchanged through final audit (SHA-256 `06D87DDE2D363F8FF1E7B53A671C2539A7D84A8012F9F1B89886DC0CDC6583F9`).

### Final D Definition of Done and acceptance audit

| Requirement / gate | Actual result |
|---|---|
| C2/Phase C independent prerequisite and reviewed B/C authority | PASS — preserved |
| Explicit selected approved UUID subset from one original job + system | PASS |
| Explicit older/repeated-cycle selection; immutable ORIGINAL Before | PASS |
| Before/After photos and remarks; unit/section/cycle; Technician/reviewer and dates | PASS |
| Foreign/mixed services, unauthorized actors, pending/rejected/withdrawn records refused | PASS |
| Invalid source/approval authority and unbound staged evidence refused | PASS |
| Historical Before absence distinct from missing/corrupt required evidence | PASS |
| Migration 052 necessary, forward-only and scoped to immutable issued documents | PASS |
| Frozen identity/number/selection/approval/source authority/presentation/time | PASS |
| Durable request before API; exact replay, changed-content conflict and concurrent issuance | PASS |
| Confirmed refusals permit fresh recovery; unknown outcomes require exact replay | PASS |
| Consistent snapshot/locks through rendering, insertion, audit and commit | PASS |
| Earlier issued bytes unchanged; later withdrawal/source validity explicit | PASS |
| Role gates and stale actor/workspace/grant/navigation/late-response guards | PASS |
| Both exact JPEG streams, escaped/long remarks, page breaks and pagination | PASS |
| Current representative PDF visual inspection | PASS — all four current Poppler pages plus enlarged headers inspected; `cr09-d-ready-page-1.png` through `-4.png` and `cr09-d-ready-headers.png` |
| D UI at 360×800, 768×1024 and 1280×800 | PASS — current screenshots inspected; target/focus/error/overflow assertions passed |
| Technician offline, C1/C2 and ordinary inspection/report/PDF behavior | PASS — required browser and integration gates below |
| Hose Reel P2 closure | PASS — required setup wait, reproduced held-auth timing window, original compatibility passing; not inferred solely from reruns |
| C1 route-lifecycle P2 closure | PASS — old ordering fails the new regression; callback draining passes it and the required core gate |
| API typecheck / build | PASS / PASS |
| Historical matrix / V6 evidence / Wet Chemical definition | PASS — 20/20, 11/11, 2/2 |
| V7 evidence contracts / config | PASS — 38/38 |
| D export integrity and PDF races | PASS — 11/11 |
| B1 readers / B1 integration / B2 integration / storage reconciliation | PASS — 22/22, 10/10, 18/18, 1/1 |
| V6 / CO2 V7 / Wet Chemical V7 / Fire Alarm V7 / evidence race | PASS — 1/1, 4/4, 2/2, 4/4, 1/1 |
| Optional-photo and ordinary PDF integration | PASS — 14/14 |
| Web typecheck / NODE_ENV=production build | PASS / PASS |
| PWA build contract / stale evidence | PASS — 3/3, 1/1 |
| Core browser suite | PASS — 68/68: 22 C1, 17 C2, 10 B3, 8 D, 3 inspection and 8 Manager |
| Original default-mode entry and offline retired-draft compatibility | PASS — 24/24 |
| Separate healthy-online entry/display | PASS — 14/14 |
| Auto-sync / queued-write guards | PASS — 8/8 each |
| Cold database isolation and environment overrides | PASS — fresh disposable 127.0.0.1:55432 only; both URLs forced; API test environment, production web build; zero skips |
| Historical protection, migration 051, Dexie v10 and approved 10f3bbb exception | PASS — protected status has no entries; recorded hashes unchanged |
| git diff --check after documentation | PASS — CRLF warnings only |

Final review found no new actionable defect in D or this fixture fix. P0 remaining: 0. P1 remaining: 0. Relevant P2 remaining: 0. The two demonstrated fixture blockers are closed for this checkpoint with mechanism/regression evidence and a passing required cold gate. Other inherited validation debt, production publication/precache work and deployment capacity/retention planning retain their existing owners; this is not blanket closure of repository-wide debt.

Changes in this follow-up only: `apps/web/tests/repair-c1.spec.ts` (tracked callback drainage and regression), this report (failed gate/closure/acceptance proof), `HANDOVER.md` (current readiness), and `CR09_CR10_REPAIR_BUILD_PLAN.md` (D checkpoint status). No production source, migration, Dexie, package-lock, Compose, Caddy, runtime/customer data or Git mutation. Existing unrelated working-tree work is preserved.

Reproduce the focused and full gates:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
npx.cmd playwright test tests/repair-c1.spec.ts --workers=1
if ($LASTEXITCODE -ne 0) { throw 'C1 fixture regressions failed' }
npx.cmd playwright test tests/repair-c1.spec.ts --grep 'fixture settles a held route|validation 768x1024' --repeat-each=10 --workers=1
if ($LASTEXITCODE -ne 0) { throw 'C1 fixture repetition failed' }
cd C:\PWA_OfflineRecordWebApp
& .\scripts\testing\verify-cr09-d.ps1
if ($LASTEXITCODE -ne 0) { throw 'D cold gates failed' }
git diff --check
```

Proof remains controlled browser routes/real IndexedDB plus separate disposable PostgreSQL integration. Live browser-to-PostgreSQL, installed-PWA force-close, physical-phone/camera, production publication/HTTPS/persistence, deployment, production migration/backfill and owner manual Level 3 acceptance were NOT performed. Ready for that checkpoint does not mean Level 3 passed. Stop here; no deployment or next-step work.

**NEW DEFECTS: N**

**HISTORICAL IMMUTABILITY INTACT: Y**

**SAFE FOR D REVIEW ACCEPTANCE: Y**

**D INDEPENDENT REVIEW ACCEPTED: Y**

**READY FOR OWNER LEVEL 3 ACCEPTANCE: Y — LEVEL 3 NOT RUN**
