# Slice A: technician ownership and home

2026-09-17. HEAD baseline `a760ae1`; protected-file baseline `e30c649`.
V7 stays `good / not_good / complete_repair / na`, per-field allowedValues.
Normal / Test / Isolation, published templates, migrations and serviceVisits.ts are unchanged.

## Sol remediation — 2026-09-18

The prior zero-findings assessment was withdrawn. This pass changes only the reported
Slice A defects, their fixtures/tests, the focused gate lists and the required documentation.

- P0: PFE now obtains `localDatabase.masterSystemInspections` inside each repository
  function. An AST scan of all 169 `.ts`/`.tsx` files under apps/web/src, plus import/reference
  searches, found no other eager module-level database/table capture. The only module-scope
  `localDatabase` reference left is its exported binding in db/localDatabase.ts.
- P1: the Dry/Wet Riser, Automatic Sprinkler and Hydrant route fixtures now model
  parameterized ownership queries and authenticated actor IDs. Connectivity Pending data
  is created in the authenticated user's database. All four fixtures' tests are in the
  focused gate lists, alongside the new PFE browser test.
- P1: deployment requires every device/profile to come online and sync before upgrade,
  then each user to refresh online after upgrade. An offline first launch may show an empty
  new workspace. Legacy records for non-created/NULL-creator/unattributable jobs remain
  preserved and quarantined. See the deployment runbook; do not clear storage.
- P2: ownership preflight rejects an excessive Content-Length before reading any bytes.
  Legacy attachments retain their existing 2 MiB + 32 KiB body limit and HTTP 413;
  staged evidence retains its existing 400 semantics and 64 KiB overhead. The streamed
  length check also preserves attachment 413 for chunked bodies.

Regression proof uses real HTTP headers with no body sent (early length rejection), an
oversized chunked body, and both owned/foreign batch orderings. Neither batch writes the
otherwise-valid owned PFE item; that exact item succeeds when submitted alone. The admin
replay test uses identical photo metadata/bytes and a reservation assigned to admin so
that the stored uploader mismatch itself produces 409 IDEMPOTENCY_CONFLICT, without
changing the original uploader. The mounted-App PFE test signs in after module loading,
then clicks Save Draft, Submit, Sync (Failed), Edit Failed, Submit and Sync (Synced).
It checks the same UUID in the per-user database, completed outbox and empty legacy tables.

### Full web Playwright suite: every baseline failure

Command in both trees: `npx playwright test --workers=1 --reporter=json`.
The baseline was extracted with `git archive a760ae1` into
`C:/Users/kokfu/AppData/Local/Temp/slice-a-sol-baseline-a760ae1`; dependencies were linked,
and no Git checkout or history was changed. The full baseline suite has **51 passed,
2 failed, 0 skipped**. The full remediated suite has **55 passed, 2 failed, 0 skipped**.
Both have exactly these failures, with the same errors:

| Test | Baseline a760ae1 and remediated error |
|---|---|
| co2-v7-live-accepted-detail.spec.ts — CO2 V7 accepted detail renders from the real accepted authority and opens actor-scoped photos | `Error: CO2_V7_LIVE_BROWSER_FIXTURE_PATH is required` |
| wet-chemical-v7-live-accepted-detail.spec.ts — Wet Chemical V7 accepted detail renders from the real accepted authority and opens actor-scoped photos | `Error: WET_CHEMICAL_V7_LIVE_BROWSER_FIXTURE_PATH is required` |

These live-fixture prerequisites were not supplied. This is a failed full-suite run, not
a pass or skip; neither failure was introduced by Slice A. Setting up live browser
acceptance remains a separate verification requirement. No unrelated implementation was changed.
Raw reports are in the Windows temporary directory as `slice-a-sol-baseline-playwright.json`
and `slice-a-sol-full-playwright-final.json` (preceded by existing Node unit-test output).

### Files changed by this remediation

- `apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts`: Resolve the PFE table per operation.
- `apps/web/tests/portable-user-workspace.html`: Mounted App, login, catalog and controlled failed/successful sync fixture.
- `apps/web/tests/portable-user-workspace.spec.ts`: Exercise PFE Save Draft/Submit/Edit Failed/sync in the user database.
- `apps/api/src/routes/dryWetRiserInspectionsV7.test.ts`: Add actor-bound ownership lookup and uniform missing-job response.
- `apps/api/src/routes/masterSystemInspectionsAutomaticSprinklerV7.test.ts`: Add authenticated ownership lookup before frozen-detail assertions.
- `apps/api/src/routes/masterSystemInspectionsHydrantSummary.test.ts`: Model ownership and updated SQL parameter positions.
- `apps/web/tests/connectivity-recovery.html`: Place Pending work in the authenticated workspace.
- `apps/api/src/jobs/ownedMultipart.ts`: Early Content-Length rejection and legacy attachment 413/limit preservation.
- `apps/api/src/routes/technicianOwnership.integration.test.ts`: Early/chunked oversize and mixed-batch no-write regressions.
- `apps/api/src/sync/co2V7.integration.test.ts`: Prove admin still reaches immutable uploader-mismatch 409.
- `scripts/Test-ManagerScheduling.ps1`: Add the requested route/connectivity/PFE tests to focused file lists only.
- `docs/architecture/06-deployment-runbook.md`: Document mandatory online upgrade preparation and quarantine recovery limits.
- `HANDOVER.md`: Withdraw incorrect severity claims and record dated remediation results.
- `docs/technician-ownership-slice-a.md`: Record scope, baseline failures, changed files and verbatim validation evidence.

## Route inventory

Inventory inspected before implementation; these are final working-tree line locations.
All routes have the production `/api` prefix. Every technician route below is exercised
by a named subtest in the new ownership integration suite.

| Method and path | Source | Coverage |
|---|---|---|
| GET `/inspection-jobs` | `apps/api/src/routes/inspectionJobs.ts:92` | technicianOwnership.integration.test.ts |
| POST `/inspection-jobs/service-visits` | `apps/api/src/routes/inspectionJobs.ts:250` | technicianOwnership.integration.test.ts |
| GET `/inspection-jobs/:jobId/final-report` | `apps/api/src/routes/inspectionJobs.ts:256` | technicianOwnership.integration.test.ts |
| GET `/inspection-jobs/:jobId/final-report.pdf` | `apps/api/src/routes/inspectionJobs.ts:263` | technicianOwnership.integration.test.ts |
| GET `/inspection-jobs/:jobId/completion` | `apps/api/src/routes/inspectionJobs.ts:270` | technicianOwnership.integration.test.ts |
| POST `/inspection-jobs/:jobId/close` | `apps/api/src/routes/inspectionJobs.ts:293` | technicianOwnership.integration.test.ts |
| GET `/inspection-jobs/:jobId` | `apps/api/src/routes/inspectionJobs.ts:351` | technicianOwnership.integration.test.ts |
| GET `/inspections` | `apps/api/src/routes/inspections.ts:15` | technicianOwnership.integration.test.ts |
| GET `/hose-reel-inspections/:clientUuid` | `apps/api/src/routes/masterSystemInspections.ts:126` | technicianOwnership.integration.test.ts |
| GET `/co2-inspections/:clientUuid` | `apps/api/src/routes/masterSystemInspections.ts:144` | technicianOwnership.integration.test.ts |
| GET `/wet-chemical-inspections/:clientUuid` | `apps/api/src/routes/masterSystemInspections.ts:156` | technicianOwnership.integration.test.ts |
| GET `/fire-alarm-inspections/:clientUuid` | `apps/api/src/routes/masterSystemInspections.ts:168` | technicianOwnership.integration.test.ts |
| GET `/dry-wet-riser-inspections/:clientUuid` | `apps/api/src/routes/masterSystemInspections.ts:186` | technicianOwnership.integration.test.ts |
| GET `/master-system-inspections` | `apps/api/src/routes/masterSystemInspections.ts:266` | technicianOwnership.integration.test.ts |
| GET `/master-system-inspections/:clientUuid` | `apps/api/src/routes/masterSystemInspections.ts:477` | technicianOwnership.integration.test.ts |
| POST `/inspection-attachments` | `apps/api/src/routes/inspectionAttachments.ts:332` | technicianOwnership.integration.test.ts |
| GET `/inspection-attachments` | `apps/api/src/routes/inspectionAttachments.ts:661` | technicianOwnership.integration.test.ts |
| GET `/inspection-attachments/:photoUuid/content` | `apps/api/src/routes/inspectionAttachments.ts:701` | technicianOwnership.integration.test.ts |
| POST `/v6-evidence/stage` | `apps/api/src/routes/stagedEvidence.ts:16` | technicianOwnership.integration.test.ts |
| POST `/v7-evidence/stage` | `apps/api/src/routes/stagedEvidence.ts:29` | technicianOwnership.integration.test.ts |
| GET `/v6-evidence/accepted` | `apps/api/src/routes/stagedEvidence.ts:44` | technicianOwnership.integration.test.ts |
| GET `/v6-evidence/accepted/:photoUuid/content` | `apps/api/src/routes/stagedEvidence.ts:61` | technicianOwnership.integration.test.ts |
| GET `/v7-evidence/accepted` | `apps/api/src/routes/stagedEvidence.ts:88` | technicianOwnership.integration.test.ts |
| GET `/v7-evidence/accepted/:photoUuid/content` | `apps/api/src/routes/stagedEvidence.ts:105` | technicianOwnership.integration.test.ts |
| POST `/sync` | `apps/api/src/routes/sync.ts:20` | technicianOwnership.integration.test.ts |
| GET `/manager/service-visits` | `apps/api/src/routes/managerServiceVisits.ts:424` | Existing Manager regression gates; unchanged admin-only route |
| GET `/manager/service-visits/:jobId/final-report` | `apps/api/src/routes/managerServiceVisits.ts:446` | Existing Manager regression gates; unchanged admin-only route |
| GET `/manager/service-visits/:jobId/final-report.pdf` | `apps/api/src/routes/managerServiceVisits.ts:452` | Existing Manager regression gates; unchanged admin-only route |
| GET `/manager/service-visits/:jobId` | `apps/api/src/routes/managerServiceVisits.ts:458` | Existing Manager regression gates; unchanged admin-only route |

The summary routes also accept jobId/jobIds, location and cursor filters. An explicit
foreign jobId gets 404; a bulk list contains only owned records. Form IDs and photo IDs
resolve through their stored parent to the job. Inspector foreign/NULL/missing access
returns the same HTTP 404 body: `{"error":"JOB_NOT_FOUND"}`. Close, sync and upload
failures retain their existing audit actions. Identities are SQL parameters.

`POST /sync` is the only sync HTTP endpoint. Tests cover each dispatch: legacy
inspection, Hose Reel, CO2, Wet Chemical, Automatic Sprinkler, Dry/Wet Riser, Fire Alarm,
Hydrant, Portable Fire Extinguisher, Smoke Ventilation and Fire Intercom. The guard runs
before completed-job replay and every acceptance dispatch, including frozen V6.
An existing foreign form UUID cannot be disguised with an owned payload jobId.
The internal functions under apps/api/src/sync are not independent HTTP routes.
The non-job-bound testRecord dispatch is unchanged. Admin bypasses the new ownership
check; existing status, visibility, actor and validator checks remain.

## Shared-device persistence

The existing version-9 IndexedDB schema is instantiated separately as
`inspection-pwa:user:<authenticated user ID>`. Jobs, reference data, drafts, groups,
forms, attachment Blobs and outbox operations therefore switch together. No schema,
version or index changed. `inspection-pwa` retains device-wide authentication and
legacy records; it is never an authenticated business workspace.

Legacy recovery trusts a successful owner-scoped server job refresh, not the old cache
or its last signed-in user. Only records for confirmed owned jobs are copied. Linked
attachments and outbox operations follow their parent. Copies and import receipts
commit together in the destination database. Newer destination records win; receipts
prevent stale Pending operations being resurrected after sync/pruning. Original legacy
records remain intact. Unattributable records remain quarantined rather than being
deleted or assigned to the next login. The first recovery of pre-upgrade data requires
an online owner-scoped refresh; subsequent use of that user's workspace works offline.

Identity replacement waits for active local save/open operations and sync to finish.
React's records and active forms are replaced with the new workspace. Cross-tab identity
changes trigger revalidation; sync checks persisted identity before network dispatch.
No offline data-entry, local-save or capture controls were disabled.

Playwright mounts the real App with mocked HTTP and real browser IndexedDB. Its fixture
starts with A and B drafts mixed in the legacy database. It verifies selective recovery,
A-to-B-to-A isolation, unchanged Draft recovery, no A outbox dispatch as B, A's Pending
operation dispatch after relogin, preservation of legacy originals, and a suspended save
finishing in A's workspace before logout. It also checks tabs/counts, keyboard operation,
newest-first cards, report navigation, empty Completed state, session preference and
375px overflow. This is not a physical phone or installed-PWA force-close claim.

## Revert proof

Scratch copy outside the repo:
`C:/Users/kokfu/AppData/Local/Temp/slice-a-revert-18566b87a8a04ef385def7ca08a41370`.
Only source/migrations/package metadata were copied; dependencies used a junction.
No runtime configuration or customer data was copied. Tests used only
`127.0.0.1:55432/phase6_seed_integration` with a bogus DATABASE_URL.

The list creator clause and shared creator predicate were removed in that scratch copy.
The bound user parameter was retained in a tautology, so this is an authorization proof,
not a SQL parameter-count failure. Repository predicates stayed intact.

Actual output excerpts (full output: `revert-proof.txt` in the scratch directory):

```text
REVERT_EXIT=1
ℹ tests 38
ℹ pass 15
ℹ fail 23
ℹ skipped 0
✖ job read: foreign and NULL creator are indistinguishable from missing
  200 !== 404
✖ GET inspection-attachments/:photoUuid/content
  actual:   { error: 'ATTACHMENT_FILE_MISSING' }
  expected: { error: 'JOB_NOT_FOUND' }
✖ POST v6-evidence/stage: ownership before multipart business validation
  400 !== 404
```

## Reproduction

The final cold-run counts and DoD table are in the 2026-09-17 Slice A HANDOVER.md entry.
Port 55432 must be free. This script creates/removes its own disposable database and
overrides any pre-existing DATABASE_URL. A skip is not a pass.

```powershell
cd C:\PWA_OfflineRecordWebApp ; .\scripts\Test-ManagerScheduling.ps1
git status --short ; git diff --check
```

Only the focused file lists in Test-ManagerScheduling.ps1 changed. No staging, commits,
production database access, physical-phone test or deployment was performed.

## Original Slice A implementation files (before Sol remediation)

- `apps/api/src/jobs/technicianOwnership.ts`: Parameterized ownership lookup and route guard, including disguised foreign form UUIDs.
- `apps/api/src/jobs/ownedMultipart.ts`: Bounded ownership preflight while preserving frozen multipart validators and oversized-body error behavior.
- `apps/api/src/routes/inspectionJobs.ts`: Owner-scoped list/read/completion/close/report/PDF; canonical single-job read.
- `apps/api/src/routes/inspections.ts`: Owner-scoped legacy accepted summaries.
- `apps/api/src/routes/masterSystemInspections.ts`: Owner-scoped accepted detail and progress lists.
- `apps/api/src/routes/stagedEvidence.ts`: V6/V7 upload and accepted-evidence ownership, with denial audits.
- `apps/api/src/routes/inspectionAttachments.ts`: Ownership for legacy attachment upload, enumeration and content.
- `apps/api/src/routes/sync.ts`: Authorize all job-bound work before replay, acceptance or batch writes.
- `apps/api/src/routes/technicianOwnership.integration.test.ts`: 38 PostgreSQL tests covering the route inventory, NULL creators, admin, audits and identity disguise.
- `apps/api/src/sync/co2V7.integration.test.ts`: Assign HTTP fixtures an owner and assert foreign-owner 404 responses.
- `apps/api/src/sync/wetChemicalV7.integration.test.ts`: Assign HTTP fixtures an owner and assert foreign-owner 404 responses.
- `apps/api/src/sync/fireAlarmV7.integration.test.ts`: Give the accepted-detail fixture its explicit technician owner.
- `apps/api/src/sync/fireAlarmV6Acceptance.integration.test.ts`: Own every HTTP job fixture and replace the old shared-job access expectation with 404; retain acceptance/race assertions.
- `apps/web/src/db/localDatabase.ts`: Per-user database instances and atomic, server-authorized legacy record recovery; schema unchanged.
- `apps/web/src/db/workspaceActivity.ts`: Drain suspended local operations before replacing the database binding.
- `apps/web/src/auth/authStateRepository.ts`: Keep device authentication separate from per-user business data; notify other tabs.
- `apps/web/src/referenceData/referenceDataCache.ts`: Recover legacy work only from freshly server-confirmed owned job IDs.
- `apps/web/src/sync/syncEngine.ts`: Waitable sync completion and identity checks before network dispatch.
- `apps/web/src/App.tsx`: Switch and refresh local state by identity; protect pending local actions; keep connectivity revalidation active during refresh.
- `apps/web/src/jobs/TechnicianHome.tsx`: Two accessible remembered tabs, newest-first cards, service date, system progress and direct report action.
- `apps/web/src/styles/app.css`: Prominent primary action and narrow-screen tab/card layout.
- `apps/web/tests/technician-home-ownership.html`: Real App/IndexedDB fixture with mixed legacy users and controllable pending save.
- `apps/web/tests/technician-home-ownership.spec.ts`: Three Playwright scenarios for layout/navigation, draft/outbox isolation and the save/logout race.
- `apps/web/tests/manager-app-auth-transitions.html`: Reset device-wide auth explicitly between existing harness cases.
- `scripts/Test-ManagerScheduling.ps1`: Add the new API and Playwright files to focused sets only.
- `HANDOVER.md`: Dated completion entry, exact cold counts, DoD and limitations.
- `docs/technician-ownership-slice-a.md`: Route inventory, persistence design, revert output and reproducible command.

The pre-existing edits in `docs/client-format-request/README.md` and
`docs/client-format-request/asiamost-sample-report-format.md` were preserved, not changed by this task.

## Sol remediation cold gate output (verbatim)

2026-09-18; exit 0. The command was run from the repository root and its complete
stdout/stderr is reproduced below. The script itself owns disposable-DB startup/cleanup.

```powershell
cd C:\PWA_OfflineRecordWebApp ; .\scripts\Test-ManagerScheduling.ps1
```

```text
529fb74f6ec125c59d198f1198a61ff4213fa7b23ab813629699f618fc6106a5

> @inspection-pwa/api@0.1.0 typecheck
> tsc -p tsconfig.json


> @inspection-pwa/api@0.1.0 build
> npm run clean && tsc -p tsconfig.json


> @inspection-pwa/api@0.1.0 clean
> node -e "require('node:fs').rmSync('dist', { recursive: true, force: true })"


> @inspection-pwa/api@0.1.0 test:historical-matrix
> tsx --test src/inspections/templates/historicalCompatibilityMatrix.test.ts src/inspections/dryWetRiserAccepted.test.ts src/inspections/templates/portableFireExtinguisherDefinition.test.ts

✔ Dry/Wet Riser stored responses require their frozen authoritative definition (4.524ms)
✔ published V1-V5 constants remain frozen and V6 is selected only by its frozen identity (46.7223ms)
✔ historical Fire Alarm V3/V4/V5 accepts Good/Poor and rejects V6 widening without V6 evidence (14.622ms)
✔ V2 Dry/Wet and malformed V6 remain isolated from historical Fire Alarm parsing (1.7561ms)
✔ Portable Fire Extinguisher V5 publishes only the authoritative V1 quantity form (3.909ms)
▶ Portable sync rejects malformed closed envelope, provenance, timestamp, and snapshot shapes before persistence
  ✔ unknown envelope (0.5308ms)
  ✔ unknown payload (0.31ms)
  ✔ empty snapshot (0.3155ms)
  ✔ unknown snapshot (0.33ms)
  ✔ unknown provenance (0.2748ms)
  ✔ non-positive creator (0.343ms)
  ✔ empty username (0.372ms)
  ✔ overlong username (0.3372ms)
  ✔ impossible timestamp (0.5373ms)
  ✔ noncanonical timestamp (0.4217ms)
  ✔ unknown definition key (0.5909ms)
✔ Portable sync rejects malformed closed envelope, provenance, timestamp, and snapshot shapes before persistence (9.0797ms)
✔ Portable V5 accepted history keeps the server acceptedAt snapshot shape readable (0.6294ms)
✔ Portable V5 accepted history remains readable through the final report and PDF pipeline (104.8775ms)
✔ Portable unique-conflict classifier is deterministic for UUID and authority races (1.0089ms)
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1302.8976

> @inspection-pwa/api@0.1.0 test:v6-evidence
> tsx --test src/attachments/attachmentStorage.test.ts src/inspections/evidence/fireAlarmV6Evidence.test.ts src/inspections/templates/systemContractCompatibility.test.ts

✔ directory open and directory fsync failures remain fatal except exact Windows EPERM/fsync (8.4995ms)
✔ exact Windows directory fsync EPERM continues to integrity verification (42.4849ms)
✔ normal attachment publication still renames and hash verification fails closed (29.7959ms)
✔ V6 evidence manifest is immutable, field-specific, and excludes Normal/Test/Isolation (5.5503ms)
✔ MFE-FSSR V5 carries every implemented runtime contract forward exactly (7.1073ms)
✔ V7 Hose Reel controls report templateVersion 7 and resolve the Test Run Fire Pump block (1.3629ms)
✔ system contract compatibility fails closed for identity, status, field/control and future changes (2.1763ms)
✔ persisted JSONB system definitions retain their authoritative runtime contract (0.6247ms)
✔ V6 selects only the frozen Fire Alarm variant and leaves V1-V5 exact (2.2898ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 589.2277

> @inspection-pwa/api@0.1.0 test:wet-chemical-definition
> tsx --test src/inspections/templates/wetChemicalDefinitionControls.test.ts

✔ Wet Chemical is published only by forward-only V4 (3.2164ms)
✔ Wet Chemical resolver rejects an altered published definition (1.5052ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 349.8844
✔ test configuration prefers the integration database URL while production never consults it (0.938ms)
✔ customer catalog version defaults to V7 and permits an explicit catalog pin (0.3374ms)
✔ V7 adapters resolve only exact CO2/Wet tuples and derive field-specific Poor evidence (22.1462ms)
✔ V7 Wet Chemical adapter preserves static-only evidence scope (1.0556ms)
✔ V7 Fire Alarm adapter derives only current Poor fields and keeps row evidence field-owned (3.8074ms)
✔ V7 Hydrant adapter keeps all seven row columns, with row UUID paths and field-owned findings (3.0042ms)
✔ V7 Hose Reel combines frozen checklist and row-scoped evidence without accepting stale findings (10.8078ms)
✔ V7 Automatic Sprinkler derives flat checklist and measurement findings, each owning its remark (7.9031ms)
✔ V7 Dry/Wet Riser combines flat checklist/measurement findings with row-scoped findings, without the duplicate PSI checklist keys (5.3517ms)
✔ V7 Smoke Ventilation combines frozen checklist and Fan Schedule row-scoped evidence without accepting stale findings (7.3037ms)
✔ V7 Fire Intercom derives only current-Poor Station Schedule row findings with field-owned remarks (2.3688ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 536.8767
✔ PostgreSQL 010 -> 011 -> 012 upgrade fails unresolved legacy retries closed and preserves modern idempotency (3135.5057ms)
✔ service call number, arrival, and departure persist on real PostgreSQL and are readable by the final-report cover query (2704.9602ms)
✔ service-visit replay compares cover fields on real PostgreSQL: exact retry is idempotent, any change is a 409 (3272.9689ms)
✔ create service visit rejects client-controlled creation date and time (1.8906ms)
✔ create service visit accepts optional cover fields and rejects malformed ones (0.3874ms)
✔ new service visit is server-identified, scheduled, blank, and leaves completed history untouched (2.9785ms)
✔ unsupported selections fail before a job insert and roll back (0.7747ms)
✔ idempotency is actor-scoped and rejects altered replay payloads (1.0254ms)
✔ existing-row replay: an exact cover-field retry stays idempotent (0.357ms)
✔ existing-row replay: a changed serviceCallNumber is an idempotency mismatch (0.5346ms)
✔ existing-row replay: a changed arrivalTime is an idempotency mismatch (0.3045ms)
✔ existing-row replay: a changed departureTime is an idempotency mismatch (0.3042ms)
✔ existing-row replay: absent, explicit null and blank cover fields are the same request (0.4536ms)
✔ concurrent-insert replay: an exact cover-field retry stays idempotent (1.0537ms)
✔ concurrent-insert replay: a changed serviceCallNumber is an idempotency mismatch (2.0608ms)
✔ concurrent-insert replay: a changed arrivalTime is an idempotency mismatch (1.4903ms)
✔ concurrent-insert replay: a changed departureTime is an idempotency mismatch (1.4433ms)
✔ concurrent-insert replay: absent, explicit null and blank cover fields are the same request (1.3583ms)
✔ an unresolved legacy request id fails closed without creating or exposing a job (0.5041ms)
✔ co2_fire_extinguisher preserves valid configured location authority (0.9469ms)
✔ co2_fire_extinguisher rejects malformed configured location-zone authority atomically (0.8838ms)
✔ wet_chemical preserves valid configured location authority (1.6113ms)
✔ wet_chemical rejects malformed configured location-zone authority atomically (0.7689ms)
✔ canonical replay representation preserves a completed job's actual state and completion metadata (3.7678ms)
✔ service visit role contract rejects unauthenticated callers and permits inspector/admin (0.5088ms)
✔ completed service visit report uses accepted server history, preserves per-location sections, and produces a valid PDF (151.9901ms)
✔ historical Fire Alarm V3/V4/V5 accepted authority remains readable through the final-report and PDF path (154.6634ms)
✔ historical V2 Dry/Wet Riser accepted authority remains readable through the final-report and PDF path (38.1184ms)
✔ open service visits and missing accepted results fail closed (1.0254ms)
✔ empty, malformed, or mismatched accepted historical content fails closed (4.6119ms)
✔ CO2 reports reject isolated frozen template-version and configuration-revision-number corruption (0.8942ms)
✔ Wet Chemical reports require frozen definition, controls, and accepted location authority (4.8849ms)
✔ final-report PDF route requires authentication and returns a safe PDF download (135.5565ms)
✔ derived Summary of Testing condition maps the 4-state and legacy result models onto the client 3-state roll-up (2.988ms)
✔ sectionRemarkLines folds each finding's OWN remark by label structure, never by adjacency (1.1344ms)
✔ Summary of Testing PDF block renders numbered per-system conditions and per-section Remarks (102.0493ms)
✔ cover page renders Telephone/Contact/Service Call No/Arrival/Departure/Systems when present, and omits them cleanly when absent (65.1207ms)
✔ V7 Automatic Sprinkler final report renders frozen definition wording, not the prettified response key (4.4988ms)
✔ V7 Automatic Sprinkler final report with NO frozen override map is stable (pinned report-section digest) (29.739ms)
✔ V7 Automatic Sprinkler override renames exactly one field; every sibling label is byte-identical (83.1922ms)
✔ V7 Hose Reel response aliases keep a mismatched field label and its bound-evidence caption in lockstep (63.1006ms)
✔ V7 CO2 response aliases apply frozen detector wording without moving any sibling field (10.0576ms)
✔ V7 Wet Chemical response aliases move the second-detector column to the frozen override; siblings byte-identical (7.1785ms)
✔ technician customer creation is persistent, idempotent, concurrent-safe, and atomic (3471.5523ms)
✔ GET /dry-wet-riser-inspections/:clientUuid returns 200 (not 404) for a real accepted V7 record (49.3532ms)
✔ GET /dry-wet-riser-inspections/:clientUuid still 404s when nothing is stored (15.4548ms)
✔ manager customer transaction integration (5298.5074ms)
✔ due date routes gate authority and reject malformed dates without database work (127.804ms)
✔ Manager Customer Configuration routes require admin authority before any database work (24.2028ms)
✔ manager customer presentation is operational-only and its catalog excludes unsupported FM200 (2.1329ms)
✔ manager write connection failure is routed through Express error handling (16.916ms)
✔ manager configuration activation rejects Dry/Wet Riser without systemConfiguration.riserMode before writing a revision (12.9707ms)
✔ technician customer creation is authenticated, server-backed, and does not grant Manager access (18.5874ms)
✔ Manager locations GET/PUT versions the zone/location set, freezes it into new jobs only, and rejects malformed payloads (5607.2977ms)
✔ locations endpoints: auth matrix, unsupported system (2800.2143ms)
✔ locations PUT fresh-enables a location-dependent system and unblocks its Assigned Services checkbox (2776.0518ms)
✔ configuration-revisions accepts an inline locations map that fresh-enables and configures a system atomically (2804.1692ms)
✔ cold migration, technician lifecycle, concurrent uniqueness and real session invalidation (4750.7658ms)
✔ all technician routes reject missing/inspector authority and invalid inputs before DB access (110.1766ms)
✔ technician transaction conflict, missing row and audit failure roll back and release (273.3386ms)
✔ a V7 Automatic Sprinkler job with NO frozen overrides keeps its exact historical wire shape (112.7459ms)
✔ a V7 Automatic Sprinkler job WITH a frozen override forwards the map verbatim, and no controls tree (14.8347ms)
✔ a database failure reading the frozen override map surfaces, it is not silently downgraded (14.6663ms)
✔ real master-system summary route supports the authoritative Hydrant filter (43.6036ms)
▶ technician ownership HTTP inventory (disposable PostgreSQL)
  ✔ list hides other owners and NULL creators; admin sees all (74.084ms)
  ✔ job read: foreign and NULL creator are indistinguishable from missing (26.7134ms)
  ✔ job /completion: foreign and NULL creator are indistinguishable from missing (20.171ms)
  ✔ job /close: foreign and NULL creator are indistinguishable from missing (56.9258ms)
  ✔ job /final-report: foreign and NULL creator are indistinguishable from missing (29.8183ms)
  ✔ job /final-report.pdf: foreign and NULL creator are indistinguishable from missing (25.3923ms)
  ✔ owner single-job read and admin foreign read (44.3473ms)
  ✔ GET hose-reel-inspections/:clientUuid (16.042ms)
  ✔ GET co2-inspections/:clientUuid (14.7644ms)
  ✔ GET wet-chemical-inspections/:clientUuid (9.6543ms)
  ✔ GET fire-alarm-inspections/:clientUuid (16.9241ms)
  ✔ GET dry-wet-riser-inspections/:clientUuid (14.6303ms)
  ✔ GET master-system-inspections/:clientUuid (14.0073ms)
  ✔ GET master-system-inspections filters job lists and denies explicit foreign job (27.5262ms)
  ✔ GET v6-evidence/accepted?inspectionClientUuid (11.8792ms)
  ✔ GET v7-evidence/accepted?inspectionClientUuid (13.1223ms)
  ✔ GET inspection-attachments?inspectionClientUuid (15.4873ms)
  ✔ sync cannot disguise a foreign accepted UUID behind an owned job (22.7506ms)
  ✔ GET v6-evidence/accepted/:photoUuid/content (15.353ms)
  ✔ GET v7-evidence/accepted/:photoUuid/content (15.9987ms)
  ✔ GET inspection-attachments/:photoUuid/content (15.4035ms)
  ✔ GET inspections does not expose other owners' legacy summaries (11.9902ms)
  ✔ POST sync dispatch hose_reel: foreign, NULL, missing (42.4227ms)
  ✔ POST sync dispatch co2_fire_extinguisher: foreign, NULL, missing (34.9722ms)
  ✔ POST sync dispatch wet_chemical: foreign, NULL, missing (47.9364ms)
  ✔ POST sync dispatch automatic_sprinkler: foreign, NULL, missing (31.5587ms)
  ✔ POST sync dispatch dry_wet_riser: foreign, NULL, missing (33.5412ms)
  ✔ POST sync dispatch fire_alarm_detector: foreign, NULL, missing (38.8537ms)
  ✔ POST sync dispatch hydrant: foreign, NULL, missing (44.5824ms)
  ✔ POST sync dispatch portable_fire_extinguisher: foreign, NULL, missing (94.4648ms)
  ✔ POST sync dispatch smoke_ventilation: foreign, NULL, missing (41.645ms)
  ✔ POST sync dispatch fire_intercom: foreign, NULL, missing (38.5178ms)
  ✔ POST sync dispatch legacy: foreign, NULL, missing (44.7829ms)
  ✔ POST v6-evidence/stage: ownership before multipart business validation (30.0892ms)
  ✔ POST v7-evidence/stage: ownership before multipart business validation (21.8829ms)
  ✔ POST inspection-attachments: ownership before multipart business validation (27.1921ms)
  ✔ oversized Content-Length is rejected before any body bytes arrive (40.2376ms)
  ✔ oversized chunked attachment retains 413 (22.7723ms)
  ✔ mixed owned/foreign sync batch writes nothing in either ordering (121.9181ms)
  ✔ failure audits retain sync, close and upload denials (11.9869ms)
✔ technician ownership HTTP inventory (disposable PostgreSQL) (4797.2209ms)
ℹ tests 105
ℹ suites 0
ℹ pass 105
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 55421.6963
▶ CO2 V7 stages distinct multipart evidence and atomically binds it to its own location form
  ✔ admin reaches immutable uploader-mismatch 409 after the ownership bypass (54.333ms)
✔ CO2 V7 stages distinct multipart evidence and atomically binds it to its own location form (4742.5581ms)
✔ CO2 V7 accepts a fully clean per-location draft with zero findings and no reservation (2690.3461ms)
✔ V6 reservations and acceptance are isolated and atomic on PostgreSQL (5524.7392ms)
✔ Fire Alarm V7 accepts frozen current-Poor evidence, retries after closure, and PDF-embeds accepted image (3394.9017ms)
✔ Fire Alarm V7 accepts complete_repair and alarm-device row evidence, and names a reused photo (2951.677ms)
✔ Fire Alarm V7 accepts a fully clean draft with zero findings and no reservation (2742.2623ms)
✔ Fire Alarm V7 exact retry with an unsorted manifest is still duplicate success (2770.863ms)
✔ V7 accepted-evidence indexes make source/stored identity races retryable for CO2, Wet Chemical, and Fire Alarm (3248.2544ms)
✔ Wet Chemical V7 uses the shared staged-evidence authority without widening V4 (4553.2164ms)
✔ Wet Chemical V7 accepts a fully clean per-location draft with zero findings and no reservation (2659.9817ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 80868.7431

> @inspection-pwa/web@0.1.0 typecheck
> tsc -b


> @inspection-pwa/web@0.1.0 build
> tsc -b && vite build

vite v6.4.3 building for production...
transforming...
✓ 187 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest           0.33 kB
dist/index.html                     0.56 kB │ gzip:   0.32 kB
dist/assets/index-Bd2-OmUR.css     40.36 kB │ gzip:   8.66 kB
dist/assets/index-BGFfE-WS.js   1,482.64 kB │ gzip: 329.79 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 5.91s

PWA v0.21.2
mode      generateSW
precache  9 entries (1488.82 KiB)
files generated
  dist/sw.js
  dist/workbox-6fc47aa9.js

> @inspection-pwa/web@0.1.0 test:v7-stale-evidence
> ..\api\node_modules\.bin\tsx.cmd --test tests/v7EvidenceStaleManifest.test.ts

✔ V7 stale-draft evidence matrix keeps only current Poor fields and freezes Pending authority (18.4895ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 471.8242

> @inspection-pwa/web@0.1.0 test:job-progress
> ..\api\node_modules\.bin\tsx.cmd --test tests/jobProgress.test.ts

✔ deriveAutomaticSprinklerServerProgress covers the full auth x summary-state x summary matrix (4.9677ms)
✔ deriveAutomaticSprinklerServerProgress distrusts a cached summary unless auth is verified (0.5363ms)
✔ deriveAutomaticSprinklerServerProgress distrusts a cached summary unless the summary is loaded (0.3994ms)
✔ deriveAutomaticSprinklerServerProgress derives from evidenceState when verified and loaded (0.2955ms)
✔ deriveAutomaticSprinklerServerProgress reports an absent summary as not cached even when verified and loaded (0.2488ms)
✔ deriveNoLocalSystemProgress covers the full accepted x auth x summary-state matrix (0.4894ms)
✔ deriveNoLocalSystemProgress trusts an accepted server record regardless of auth or load state (0.2042ms)
✔ deriveNoLocalSystemProgress reports Not Started only when verified and loaded (0.1702ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 318.4151
[WebServer] (node:30016) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)

Running 24 tests using 1 worker

(node:13368) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ok  1 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: basic (3.7s)
  ok  2 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: retry (1.5s)
  ok  3 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: bounded (5.5s)
  ok  4 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: cancel (2.6s)
  ok  5 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: unmount (1.5s)
  ok  6 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: authorization (2.5s)
  ok  7 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: unavailable (1.5s)
  ok  8 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: malformed (1.5s)
  ok  9 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: outbox (1.4s)
  ok 10 tests\connectivity-recovery.spec.ts:6:3 › connectivity recovery: race (1.5s)
  ok 11 tests\manager-app-auth-transitions.spec.ts:3:1 › mounted App Manager authorization and customer authority transitions (4.5s)
  ok 12 tests\manager-created-time.spec.ts:3:1 › Manager presents the server creation timestamp in Malaysia time (375ms)
  ok 13 tests\manager-dashboard-navigation.spec.ts:3:1 › dashboard has five working App hash routes and no dashboard data fetch (1.7s)
  ok 14 tests\manager-final-report-navigation.spec.ts:3:1 › Manager Final Report Back to Operations bypasses service-visit detail (921ms)
  ok 15 tests\manager-navigation-request-count.spec.ts:3:1 › Manager Operations detail navigation creates one request and preserves hash navigation (906ms)
  ok 16 tests\manager-technicians.spec.ts:3:1 › create/list/deactivate with cancel confirmation preventing the write (705ms)
  ok 17 tests\manager-technicians.spec.ts:29:1 › malformed list fails closed (396ms)
  ok 18 tests\manager-upcoming-services.spec.ts:3:1 › sort unsorted due dates, separate unscheduled and save/clear dates (518ms)
  ok 19 tests\manager-upcoming-services.spec.ts:27:1 › empty schedule uses the empty state (342ms)
  ok 20 tests\new-service-visit-schedule.spec.ts:3:1 › New Service Visit submits no browser schedule and accepts the server creation time (521ms)
  ok 21 tests\portable-user-workspace.spec.ts:3:1 › PFE login, Save Draft, Submit, Edit Failed and sync use the authenticated workspace (2.3s)
  ok 22 tests\technician-home-ownership.spec.ts:3:1 › technician tabs, report, keyboard, session memory and 375px layout (1.0s)
  ok 23 tests\technician-home-ownership.spec.ts:22:1 › same browser logout/login hides A's jobs and preserves unsynced draft for A (2.0s)
  ok 24 tests\technician-home-ownership.spec.ts:58:1 › logout waits for a suspended local save before another identity can replace its workspace (1.5s)

  24 passed (45.5s)
warning: in the working copy of 'HANDOVER.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/architecture/06-deployment-runbook.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/client-format-request/README.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/client-format-request/asiamost-sample-report-format.md', LF will be replaced by CRLF the next time Git touches it
 M HANDOVER.md
 M apps/api/src/routes/dryWetRiserInspectionsV7.test.ts
 M apps/api/src/routes/inspectionAttachments.ts
 M apps/api/src/routes/inspectionJobs.ts
 M apps/api/src/routes/inspections.ts
 M apps/api/src/routes/masterSystemInspections.ts
 M apps/api/src/routes/masterSystemInspectionsAutomaticSprinklerV7.test.ts
 M apps/api/src/routes/masterSystemInspectionsHydrantSummary.test.ts
 M apps/api/src/routes/stagedEvidence.ts
 M apps/api/src/routes/sync.ts
 M apps/api/src/sync/co2V7.integration.test.ts
 M apps/api/src/sync/fireAlarmV6Acceptance.integration.test.ts
 M apps/api/src/sync/fireAlarmV7.integration.test.ts
 M apps/api/src/sync/wetChemicalV7.integration.test.ts
 M apps/web/src/App.tsx
 M apps/web/src/auth/authStateRepository.ts
 M apps/web/src/db/localDatabase.ts
 M apps/web/src/jobs/TechnicianHome.tsx
 M apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts
 M apps/web/src/referenceData/referenceDataCache.ts
 M apps/web/src/styles/app.css
 M apps/web/src/sync/syncEngine.ts
 M apps/web/tests/connectivity-recovery.html
 M apps/web/tests/manager-app-auth-transitions.html
 M docs/architecture/06-deployment-runbook.md
 M docs/client-format-request/README.md
 M docs/client-format-request/asiamost-sample-report-format.md
 M scripts/Test-ManagerScheduling.ps1
?? apps/api/src/jobs/ownedMultipart.ts
?? apps/api/src/jobs/technicianOwnership.ts
?? apps/api/src/routes/technicianOwnership.integration.test.ts
?? apps/web/src/db/workspaceActivity.ts
?? apps/web/tests/portable-user-workspace.html
?? apps/web/tests/portable-user-workspace.spec.ts
?? apps/web/tests/technician-home-ownership.html
?? apps/web/tests/technician-home-ownership.spec.ts
?? docs/technician-ownership-slice-a.md
PASS: Manager scheduling automated gates; no Git mutations performed.
```

## Final Git checks (verbatim)

Both commands exited 0; the only diff-check output is the existing line-ending warnings.

```text
git status --short
 M HANDOVER.md
 M apps/api/src/routes/dryWetRiserInspectionsV7.test.ts
 M apps/api/src/routes/inspectionAttachments.ts
 M apps/api/src/routes/inspectionJobs.ts
 M apps/api/src/routes/inspections.ts
 M apps/api/src/routes/masterSystemInspections.ts
 M apps/api/src/routes/masterSystemInspectionsAutomaticSprinklerV7.test.ts
 M apps/api/src/routes/masterSystemInspectionsHydrantSummary.test.ts
 M apps/api/src/routes/stagedEvidence.ts
 M apps/api/src/routes/sync.ts
 M apps/api/src/sync/co2V7.integration.test.ts
 M apps/api/src/sync/fireAlarmV6Acceptance.integration.test.ts
 M apps/api/src/sync/fireAlarmV7.integration.test.ts
 M apps/api/src/sync/wetChemicalV7.integration.test.ts
 M apps/web/src/App.tsx
 M apps/web/src/auth/authStateRepository.ts
 M apps/web/src/db/localDatabase.ts
 M apps/web/src/jobs/TechnicianHome.tsx
 M apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts
 M apps/web/src/referenceData/referenceDataCache.ts
 M apps/web/src/styles/app.css
 M apps/web/src/sync/syncEngine.ts
 M apps/web/tests/connectivity-recovery.html
 M apps/web/tests/manager-app-auth-transitions.html
 M docs/architecture/06-deployment-runbook.md
 M docs/client-format-request/README.md
 M docs/client-format-request/asiamost-sample-report-format.md
 M scripts/Test-ManagerScheduling.ps1
?? apps/api/src/jobs/ownedMultipart.ts
?? apps/api/src/jobs/technicianOwnership.ts
?? apps/api/src/routes/technicianOwnership.integration.test.ts
?? apps/web/src/db/workspaceActivity.ts
?? apps/web/tests/portable-user-workspace.html
?? apps/web/tests/portable-user-workspace.spec.ts
?? apps/web/tests/technician-home-ownership.html
?? apps/web/tests/technician-home-ownership.spec.ts
?? docs/technician-ownership-slice-a.md

git diff --check
warning: in the working copy of 'HANDOVER.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/architecture/06-deployment-runbook.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/client-format-request/README.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'docs/client-format-request/asiamost-sample-report-format.md', LF will be replaced by CRLF the next time Git touches it
```
