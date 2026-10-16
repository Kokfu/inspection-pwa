# CR-09 / CR-10 — Copyable build prompts

Date: 2026-10-12 (Asia/Kuala_Lumpur).
Specification: [Repair build plan](CR09_CR10_REPAIR_BUILD_PLAN.md).

Copy one implementation block at a time. Start with B1. Use the review block after each checkpoint; only proceed once relevant P0/P1 findings are closed. Git remains the owner's responsibility.

## B1 — Start here: API foundation and repair assignments

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md.
Read v7-evidence-acceptance, backend-api-security, sync-engine,
indexeddb-data-model, and offline-first-pwa before related work.
Read docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md in full.

TASK: Implement CR-09 Phase B1 ONLY, as specified in section 8.
All owner decisions D1-D11 in that plan are confirmed. Do not ask them again.
Phase A is already done in d0c371a; preserve its recoverable entry policy and
server tolerance of complete_repair. Inspect current source and working-tree
changes before editing. Do not overwrite unrelated work or switch branches.

1. Create/register additive repair schema (proposed migration 051; verify
   availability first). Protected scope is limited to the new tables in
   section 4 plus required migration registration. Never edit applied migrations.
2. Implement original accepted finding identities/readers across all 11 V7
   result-bearing systems and supported historical Poor formats. Frozen source
   authority only; row UUID + canonical field path, explicit response mapping.
   Historical permitted missing Before photo must be labelled; missing required
   V7 evidence fails closed. Complete Repair/Good/N.A. are not repair candidates.
3. Add scoped repair finding/detail reads, service-level repair work orders,
   Manager assignment/reassignment to another active technician, and the
   original-technician self-start path for owned services. Do not widen existing
   inspection ownership. Authorize Before-photo reads through repair authority.
4. Add append-only source-eligibility review decisions for administrative
   corrections. Original Before remains unchanged; reviewed correction revision
   must match. Follow existing per-form correction advisory locking.
5. Include a safe batched idempotent materializer/backfill and disposable fixture
   tests. Do not run it, migrations, or tests against runtime/customer data.
6. Model repeated repair cycles and at-most-one awaiting decision per finding;
   no permanent unique finding constraint on repair_records. Actual evidence,
   repair submission and workmanship approval endpoints are B2, not B1.

OUT OF SCOPE: web/Dexie changes, navigation/UI, uploads, repair submission,
workmanship approval, PDFs, deployment, production backfill, unrelated refactors.
Creating the B2 evidence/approval tables in the additive migration is in scope;
do not expose placeholder or unsafe write endpoints before B2.

DoD ADDITIONS: focused Level 2 tests for extraction, historical absence vs
corruption, stable identities, unknown/foreign paths, owner vs assigned other
technician vs unassigned actor, assignment revocation, strict validation,
idempotent work-order/review mutations, reviewed-source revision and races,
repeat-cycle schema constraints, safe migration replay/backfill, and unchanged
historical inspection/read/report behavior. Plus standing task-brief gates.
Use freshly started disposable Postgres 127.0.0.1:55432 only; force both test
database URL variables to it. SKIP is not PASS.

Update HANDOVER.md, the B1 status in the plan, and a B1 test/report document.
Run git diff --check. Report DoD table, files changed, actual test results,
cold reproducible commands, P0/P1/P2, limitations, and SAFE FOR B1 REVIEW: Y/N.
Do not claim Phase B complete: B2/B3 remain. Stop before staging. No Git
mutations, deployment, manual final acceptance, or next checkpoint.
```

## B2 — API evidence, atomic submission, per-part decisions

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md.
Read v7-evidence-acceptance, backend-api-security, sync-engine,
indexeddb-data-model, offline-first-pwa, and the complete
docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md.
Implement section 8 B2 ONLY. Owner decisions D1-D11 are confirmed.
First inspect B1's implementation/report; relevant P0/P1 must be closed.

Build repair-specific staged After evidence, atomic parent submission/binding,
and per-part approve/reject/withdraw events using B1 schema/authority. One own
After photo + nonblank remark per part. Preserve submitted bytes/records;
resubmission and repeat approved repair get new UUIDs and validated lineage.
Use existing photo normalization/persistent storage helpers and V7 acceptance
patterns, not inspection parent tables or open-job requirements. Make repair
files safe under existing storage reconciliation before creating those files.
Reuse current actor guards, strict parsing, parameterized SQL, idempotent
request fingerprints, assignment checks, current source-eligibility revision,
lock ordering, scoped evidence uniqueness, and exact UUID receipts.
Closed original visits are allowed; original inspections/reports stay unchanged.

DoD: evidence-first, missing/extra/foreign evidence, immutable-photo conflict,
source/stored hash scope, cross-job independence, timeout/identical replay,
partial batches, rollback, competing same-finding submissions, approval races,
different parts independently approved/rejected in one service, rejection
reason, approved first cycle then second repair, stale source/assignment/actor,
correction races, storage reconciliation, auth/read security, standing gates.
Disposable Postgres 127.0.0.1:55432 only, freshly started and both URLs overridden.

No web/Dexie/UI/PDF/deployment or runtime-data changes. Update checkpoint docs
and HANDOVER; provide DoD, changed files, actual tests/cold commands, findings,
limitations, SAFE FOR B2 REVIEW: Y/N. Stop before staging; no Git mutations or
next checkpoint. Do not mark B complete until B3 passes.
```

## B3 — Local persistence, offline cache, evidence-first sync

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md.
Read indexeddb-data-model, sync-engine, offline-first-pwa,
v7-evidence-acceptance, backend-api-security, pwa-release-testing,
and docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md in full.
Implement section 8 B3 ONLY. Owner decisions D1-D11 are confirmed.
Verify B1/B2 have no relevant open P0/P1 before proceeding.

Add the additive per-user Dexie upgrade and repair stores in section 4
(next version; currently 9 -> 10). Preserve existing stores/indexes/drafts,
Blobs, pending/failed operations. Build repair repositories, authorized work-order
and finding downloads, unchanged Before-photo Blob cache, one-photo draft
capture through existing processing helpers, frozen Submit transactions, repair
evidence/parent outbox dispatch, interrupted-sync recovery and exact UUID/
fingerprint confirmations. Keep repair operations out of generic inspection
dispatch. Retain actor/workspace guards and sync/review status separation.

DoD: existing-data upgrade, offline cache/capture/type/save/Submit/reload,
immutable manifests, evidence-first ordering, timeout replay, partial batches,
interrupted sync, stale dispatch/workspace/actor, expired/revoked assignment,
source review changes, rejection revision and repeat repair, no lost local work,
unchanged inspection sync and standing gates. Browser harness tests required;
do not claim installed-PWA force-close or phone proof unless actually performed.

No screens/navigation/PDF/deployment. API edits only for proven repair-contract
gaps, documented and tested. Update checkpoint docs/HANDOVER. Report DoD,
changed files, tests/cold commands, findings, limitations, SAFE FOR B3 REVIEW:
Y/N and PHASE B DATA+SYNC READY: Y/N. Stop before staging; no Git mutations
or next checkpoint.
```

## C1 — Technician Repair List and Before/After form

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md.
Read mobile-first-ui and its applicable UI/React companions,
offline-first-pwa, indexeddb-data-model, sync-engine, v7-evidence-acceptance,
backend-api-security, pwa-release-testing, and
docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md in full.
Implement section 8 C1 ONLY after reviewed Phase B is ready.
Owner decisions D1-D11 are confirmed.

Add technician Repair List routes/nav in App.tsx and AppShell.tsx. Group by
customer/source visit/service/unit/section, select ONLY failed parts, show original
Before photo/remark read-only, require one After photo + repair remark per part,
reuse B3 local repositories/outbox, and show separate sync/review states. Include
offline preparation, assigned-other-technician flow, historical missing-photo
label vs not-downloaded label, immutable prior history and Start Another Repair.
Entry/save/capture/local Submit must work offline. Do not turn repair into a
full re-inspection or change normal inspection forms/Final Report.

DoD: 360x800/768x1024/1280x800 browser proof, touch/focus/errors/overflow,
original and assigned technician navigation/deep links, per-part requirements,
offline save/reload/Submit/reconnect, stale assignment/source errors preserve
drafts, repeat cycle/history, missing Before label, regression + standing gates.
No Admin review UI/PDF/deployment. Only narrowly tested API gaps if necessary.
Update checkpoint docs/HANDOVER. Report DoD, files/tests/commands/findings,
limitations and SAFE FOR C1 REVIEW: Y/N. Stop before staging; no Git mutation
or next checkpoint.
```

## C2 — Admin/Manager service-group review and assignment

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md.
Read mobile-first-ui and applicable UI/React companions, backend-api-security,
v7-evidence-acceptance, sync-engine, offline-first-pwa, pwa-release-testing,
and docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md in full.
Implement section 8 C2 ONLY after C1 review. D1-D11 are confirmed.

Add role-gated Admin/Manager navigation and online service-group review using
the B1/B2 API. Before/After per part; approve/reject per part, rejection reason,
source correction eligibility decisions, audit/history and repeated cycles.
Manager assigns/reassigns service repair work to another technician. Stored
roles remain inspector/supervisor/admin. Review permissions do not grant
technician submission. Refresh/review failures fail closed; never imply cached
authority is current. Existing whole-visit approval/report behavior stays intact.

DoD: independently approve/reject different parts in one service, stale review
and eligibility revisions, competing decisions, request replay, assignment/
revocation, alternate technician access, authority failures, role/deep-link
gates, mobile/desktop accessibility, unchanged normal report and standing gates.
No PDF/export/deployment. Update docs/HANDOVER and report DoD/files/tests/
cold commands/findings/limitations, SAFE FOR C2 REVIEW: Y/N and PHASE C
REPAIR WORKFLOW READY: Y/N. Stop before staging; no Git mutation or next step.
```

## D — CR-10 approved-subset repair PDF

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md.
Read v7-evidence-acceptance, backend-api-security, sync-engine,
indexeddb-data-model, mobile-first-ui for export UI, pwa-release-testing,
the applicable PDF skill for artifact render verification, and
docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md in full.
Implement section 8 D ONLY after reviewed Phase C is ready.
D1-D11 are confirmed, including approved-subset export.

Create a separate repair report/PDF using service-visit branding/header/footer/
fonts/format and existing PDF engine. Body contains only explicit selected
approved repair records from one source job + system, with ORIGINAL Before
finding/photo/remark, After photo/remark, unit/section labels, cycle, technician/
dates and reviewer/dates. Historical legitimately absent Before photo is
explicit. Pending/rejected/withdrawn or stale-source-review records are excluded
or refused. Never read drafts/pending or unbound staged evidence.

Add issued repair export history in a new forward migration (next free number;
provisionally 052). Freeze selection/approval sequences/source eligibility/
presentation and report number. Persist export request UUID locally before the
API mutation; identical retries return the same export and changed content
conflicts. Add preview/selection/download/history UI; show pending parts outside
the selected approved subset. Preserve old issued documents and show later
withdrawal validity explicitly. Ordinary service Report/PDF stays unchanged.

DoD: exact approved subset, repeat-cycle selection, foreign/mixed-service
rejection, both image bytes embedded, missing/corrupt required photos fail
closed, historical absence, escaped/long remarks, page breaks, physical PDF
render inspection, withdrawn/source-correction/export concurrency, export
idempotency/history, existing PDF regressions + standing gates. Disposable DB
only. Do not deploy or claim phone/offline-force-close/Level 3 acceptance.

Update checkpoint docs/HANDOVER. Report DoD, files/tests/cold commands,
findings/limitations, SAFE FOR D REVIEW: Y/N and READY FOR OWNER LEVEL 3
ACCEPTANCE: Y/N. Stop before staging; no Git mutations or next checkpoint.
```

## Read-only review after each step

Replace `<STEP>` with B1, B2, B3, C1, C2, or D. Replace `<REPORT_PATH>` with
the implementation's actual checkpoint report. This is a separate review task,
not authorization to create a new chat automatically.

```text
Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md Sol review rules.
Read docs/testing/CR09_CR10_REPAIR_BUILD_PLAN.md and <REPORT_PATH>.
Review CR-09/CR-10 step <STEP> ONLY. Modify no files.
Inspect relevant current changes and preserve/identify unrelated preexisting
work. Confirm owner decisions D1-D11, protected scope, task-specific DoD and
standing gates. Re-run cold disposable DB checks only on 127.0.0.1:55432;
override both test URL variables. SKIP is not PASS; no runtime data writes.
Check historical immutability, exact UUID/fingerprint replay, assignments,
per-part approval, repeat cycles, correction races, evidence ownership,
local-data survival and PDF authority where this step touches them.
Give each actionable finding file:line and a concrete failing scenario.
Report P0/P1/P2, NEW DEFECTS: Y/N, HISTORICAL IMMUTABILITY INTACT: Y/N,
missing proof and READY FOR NEXT PLANNED CHECKPOINT: Y/N.
Do not start implementation, stage, commit, deploy or do Git mutations.
```
