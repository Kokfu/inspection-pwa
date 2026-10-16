# Parallel runs — Wave 1 (CR-07 P1 · CR-01 P1 · CR-02 P1)

Written 2026-10-10. Three agents work at the same time, each in its **own git worktree and branch**, so they cannot overwrite each other.
The owner does all Git (create worktrees, merge). Claude reviews each report from the worktree path and helps resolve merge conflicts.

## Why these three can run together

| Run | Touches | Migration | Web? | DB port |
|---|---|---|---|---|
| **A — CR-07 Phase 1** (section remarks, Automatic Sprinkler pilot) | `RemarksField`, Sprinkler form, `syncEngine.ts`, `localDatabase.ts` (type only), new `sectionRemarks.ts` | **049** | yes | 55432 |
| **B — CR-01 Phase 1** (optional Good photo, **server contract only, inert**) | `v7EvidenceContracts.ts`, `finalServiceReport.ts`, one skill doc | none | **no** | 55433 |
| **C — CR-02 Phase 1** (manual site + Admin approval, **API + DB only**) | `serviceVisits.ts`, `inspectionJobs.ts`, new `siteProposals.ts` | **050** | **no** | 55434 |

Shared-file overlaps (only these): `server.ts` (A, C mount one router each) and `db/migrations.ts` (A, C register one file each) — a 1–2 line merge conflict
at most. Nothing else overlaps. B and C are API-only, so they cannot clash with A's web work or with the uncommitted web files.
**Not in this wave** (they would collide): CR-09 B (Dexie v10 + `localDatabase.ts`/`syncEngine.ts`, also needs your Q1–Q9 answers), every web phase of
CR-01/02/07 (same forms and `NewServiceVisit.tsx`), CR-06 option B (`App.tsx`).

## Step 0 (you, once): get a clean baseline
1. Commit the older phone-fix batch (I-34 … I-48; listed in the tracker §0.3) on `phase-8e-client-demo-polish`, so the worktrees start from it.
2. Create the worktrees (PowerShell; outside the repo so tools do not scan them):

```powershell
cd C:\PWA_OfflineRecordWebApp
foreach ($w in @(@('cr07','cr07-p1'),@('cr01','cr01-p1'),@('cr02','cr02-p1'))) {
  git worktree add "C:\PWA_wt\$($w[0])" -b $w[1] phase-8e-client-demo-polish
  foreach ($d in @('node_modules','apps\api\node_modules','apps\web\node_modules')) {
    New-Item -ItemType Junction -Path "C:\PWA_wt\$($w[0])\$d" -Target "C:\PWA_OfflineRecordWebApp\$d" | Out-Null
  }
}
git worktree list
```

Junctions reuse the installed `node_modules` (same lockfile at the same commit), so no `npm install` is needed and no lockfile changes.
Start each agent with its worktree as the working directory: `C:\PWA_wt\cr07`, `C:\PWA_wt\cr01`, `C:\PWA_wt\cr02`.

## Common addendum — paste at the TOP of every prompt in this wave
```
PARALLEL-RUN RULES (this task runs at the same time as two others, each in its own git worktree)
- Work ONLY inside your worktree (given below). Do not cd into C:\PWA_OfflineRecordWebApp or any other worktree. Your branch is already checked out; do not switch branches.
- Do NOT edit: HANDOVER.md, docs/client-format-request/*, package.json / package-lock.json (put any new test command in your report instead), docker-compose.yml,
  infra/*. Do not run Docker Compose. Write only your own report file named in the task.
- Your OWN disposable Postgres: use ONLY the container name and host port given in your task (never 55432 unless you are run A, never inspection_pwa-postgres-1);
  verify host TCP readiness; remove only your own container at the end. A SKIP is not a PASS.
- Playwright / dev server: never use port 4175. Use the port given in your task via a temporary config, and delete the config afterwards.
- Migration numbers are fixed: A=049, C=050 (B has none). Do not take another number.
- Git: no stage/commit/stash/restore/reset/merge. Stop before staging.
```

Per-run values to put in the addendum: A → worktree `C:\PWA_wt\cr07`, container `pwa-cr07-db`, port **55432**, Playwright port **4191**.
B → worktree `C:\PWA_wt\cr01`, container `pwa-cr01-db`, port **55433**, no web. C → worktree `C:\PWA_wt\cr02`, container `pwa-cr02-db`, port **55434**, no web.

---

## Run A — CR-07 Phase 1
Use the **CR-07 Phase 1** prompt at the end of [CLIENT_CHANGE_REQUEST_PROMPTS.md](CLIENT_CHANGE_REQUEST_PROMPTS.md), with the addendum above on top.
Two changes for the parallel run: ignore its line "In package.json add only the new test:* script line(s)" (the addendum forbids it; list the commands in the report),
and write the report to `docs/testing/CR07_SECTION_REMARKS_P1.md`.

---

## Run B — CR-01 Phase 1: optional photo on Good, SERVER CONTRACT ONLY (inert)

```
[paste the PARALLEL-RUN RULES addendum + "Worktree C:\PWA_wt\cr01, container pwa-cr01-db, port 55433, no web run" here]

Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Read .agents/skills/v7-evidence-acceptance/SKILL.md, sync-engine,
backend-api-security. Read docs/client-format-request/CLIENT_CHANGE_REQUESTS_2026-10.md (CR-01). Level 2.

TASK: CR-01 Phase 1 — let the SERVER accept an OPTIONAL photo on a field whose result is Good, for all 11 V7 systems, without any web change. Inert until
a web phase sends such photos. Owner decisions: only `good` gets the optional photo (na / not_good / complete_repair rules unchanged); one photo per field;
optional photos are included in Accepted Detail and the client PDF; no new template version, no migration, no Dexie, no web change; server deploys before web.

1. FIRST verify and report the status of known issue P0-FR1 (HANDOVER: Final Report fails for V7 Dry/Wet Riser jobs; finalServiceReport.ts ~721 and ~917 omit
   dry_wet_riser from the V7 evidence path). Reproduce with a test. If it is still failing, report it as a separate prerequisite finding; fix it ONLY if the fix is
   small and isolated, and say so clearly. Do not hide it.
2. apps/api/src/inspections/evidence/v7EvidenceContracts.ts: for each of the 11 adapters add the derivation of OPTIONAL photo paths (canonical paths whose
   effective result is `good`) next to the existing required (finding) paths: `derivePhotoFieldPaths(...) -> {required, optional}`. Keep `derivePoorFieldPaths`
   as a wrapper returning `required`, so no existing caller changes behaviour.
3. Relax parseV7EvidenceManifest (~:817-832): valid iff required ⊆ manifest paths AND every extra path is canonical AND is in `optional` (currently `good` in the
   frozen response) AND no duplicates. Anything else (na, null, removed rows, unknown or duplicate paths, a missing required photo) is rejected exactly as today.
   Every manifest that is valid today stays valid and means the same. Re-derive the 250-entry cap: compute the largest possible required+optional count across the
   definitions/row limits, set the cap with a written justification, keep it fail-closed.
4. apps/api/src/reports/finalServiceReport.ts (~:723-726): change the evidence-row equality to required ⊆ rows ⊆ required ∪ optional(good paths of the accepted
   response). Good photos then appear in the generic Photo Evidence block with a normal caption; check reportViewModel.ts / renderReportHtml.ts render them.
5. Read-only verification (change only if a test proves it necessary, minimal diff): the per-system acceptors (co2FormInstanceSync, fm200FormInstanceSync,
   hydrantV7Acceptance, hoseReelV7Acceptance, automaticSprinklerV7Acceptance, dryWetRiserV7Acceptance, smokeVentilationV7Acceptance, fireIntercomV7Acceptance,
   fireRatedRollerShutterV7Acceptance, fireAlarmV7Acceptance) incl. the "staged rows == manifest length" check; v7StagedEvidence.ts (staging must stay result-agnostic);
   acceptedMasterSystemDetail.ts; inspectionCorrections.ts (a correction Good->Not Good on a field that already has an optional photo; Not Good->Good keeps/ignores the photo).
6. Update .agents/skills/v7-evidence-acceptance/SKILL.md wherever it says only a poor value carries evidence (Result Model §3, Prohibited Patterns, Acceptance
   Tests 4-5): findings REQUIRE evidence; Good MAY carry one optional photo. Keep the rest of the skill intact.
7. Do not modify: V1-V6 templates, fireAlarmV6Evidence.ts, fireAlarmV6Acceptance.ts, migrations, any web file. Show `git status --short` proving it.

TESTS (disposable Postgres, container pwa-cr01-db, 127.0.0.1:55433; SEED_INTEGRATION_DATABASE_URL = DATABASE_URL)
- Contract unit for ALL 11 adapters: Good+photo accepted; na+photo rejected; unknown path, duplicate path, missing required photo rejected; findings-only manifest
  unchanged; cap boundary (at / over).
- Integration: accept a form with a Good photo for CO2, Wet Chemical and at least one row-based system (Hydrant) + one more of your choice; Accepted Detail shows it;
  Final Report and PDF embed the bytes; the accepted-evidence content route serves it.
- Level 2: exact retry after acceptance and after the job is closed (duplicate, no new rows); forged Good path while the server result is `na` (rejected, nothing
  accepted); stale client sending an extra after the field changed to na (rejected); two parallel acceptances sharing one photo (at most one accepted); a failed
  acceptance leaves no `accepted` rows (rollback); re-staging the same photoUuid with different bytes -> IDEMPOTENCY_CONFLICT.
- Existing suites must stay green and UNWEAKENED: historical matrix, v6-evidence, v7EvidenceContracts.test.ts, co2V7 / wetChemicalV7 / fireAlarmV7 /
  v7EvidenceRace integration, reportReview, renderReportHtml. Run the API part of the standard gates in codex-task-brief/SKILL.md.

REPORT -> docs/testing/CR01_P1_SERVER_CONTRACT.md: files changed (one line each), the P0-FR1 finding, the manifest rule as implemented, the cap and its justification,
tests + results, P0/P1/P2, the rollback caveat (once a Good photo is accepted, rolling the server back makes that record fail closed -> deploy server first),
reproducible PowerShell block that starts its own disposable DB. Verdict lines: HISTORICAL IMMUTABILITY INTACT Y/N, SAFE FOR REVIEW Y/N. STOP when green. Do NOT stage/commit.
```

---

## Run C — CR-02 Phase 1: manually typed site + Admin approval, API + DB ONLY

```
[paste the PARALLEL-RUN RULES addendum + "Worktree C:\PWA_wt\cr02, container pwa-cr02-db, port 55434, no web run" here]

Follow AGENTS.md and .agents/skills/codex-task-brief/SKILL.md (standing rules). Read offline-first-pwa, indexeddb-data-model, sync-engine, backend-api-security.
Read docs/client-format-request/CLIENT_CHANGE_REQUESTS_2026-10.md (CR-02). Level 2.

TASK: CR-02 Phase 1 — API and database only. A technician creating a service visit may send `newSite` instead of `siteId`; the site is created INACTIVE (pending), the
visit proceeds, and an Admin (roles admin + supervisor) approves or rejects it. No web change in this run (a later phase builds the UI).

OWNER DECISIONS (final; D1-D7): D1 admin AND supervisor can decide; D2 a pending site with the same normalized name (any technician, same customer) is reused — attach the
visit to it, no second proposal; D3 the rejection note is exposed to the technician; D4 report approval is NOT blocked while a site is pending; D5 approve exactly as typed
(server uses the stored proposal text, never the request body) or reject; no name editing; D6 the technician's pending sites are NOT in the normal site list;
D7 "Add New Customer" (customer + first site) is unchanged. Visit creation stays online-only. No Dexie change.

1. Migration apps/api/migrations/050_customer_site_proposals.sql (additive; register in apps/api/src/db/migrations.ts; NUMBER 050 is fixed):
   customer_site_proposals(id uuid PK, customer_id FK RESTRICT, site_id FK RESTRICT UNIQUE, job_id uuid NULL no FK (as 048), submitted_by_user_id, submitted_by_role
   CHECK 'inspector', submitted_at, proposed_display_name 1..160, proposed_address NULL <=500) and customer_site_proposal_decisions (copy the 048 decisions table minus
   resulting_revision_id: decision, note, decided_by_user_id, decided_by_role IN ('admin','supervisor'), decided_at, sequence, request_id, request_fingerprint,
   UNIQUE(proposal_id, sequence)). Append-only triggers (update/delete/truncate refused) as in 048. No change to customer_sites or any existing table; no backfill.
2. Pure derivation module apps/api/src/inspections/siteProposal.ts (status = approved if site active; rejected if inactive with a rejected decision; else pending) with unit tests.
3. Parser in routes/inspectionJobs.ts (parseCreateServiceVisit ~:129): exactly ONE of `siteId` or `newSite:{displayName, address?}`; unknown keys still rejected; the siteId path
   byte-identical in behaviour. displayName: trim + collapse whitespace, 1..160, same helper/rules the Manager add-site route uses; address <=500; reject control chars.
4. serviceVisits.ts newSite branch, ONE transaction: advisory lock on (actor, requestId); lock the customer row (+ advisory lock on (customer, normalized name)); an ACTIVE
   same-name site -> 409 SITE_ALREADY_EXISTS {existingSiteId} and write nothing; a pending same-name site -> reuse it; else insert customer_sites is_active=false with
   site_code SITE-XXXXXXXX (same scheme as the Manager add-site route) + the proposal row; insert the job (snapshot freezes the typed name/address as today); audit events
   service_visit_create + site_proposal_submitted; if the job insert hits ON CONFLICT DO NOTHING (replay) roll back the newSite work so no orphan site remains.
   sameReplay for a newSite request compares normalized name+address with the stored job's site (select them in the replay query); mismatch -> IDEMPOTENCY_MISMATCH.
5. Routes apps/api/src/routes/siteProposals.ts mounted in server.ts: GET /manager/site-proposals?status=, GET /manager/site-proposals/:id, POST /manager/site-proposals/:id/decision
   {requestId, decision:'approved'|'rejected', note}. requireRoleAudited('admin','supervisor'); technicians 403. Per-proposal advisory lock; same requestId+fingerprint -> 200 replay,
   same requestId different body -> 409, a second decision under a new requestId -> ALREADY_DECIDED; reject needs a note 3..500; approve: re-check no ACTIVE same-name site
   (409 SITE_NAME_CONFLICT), lock the customer row and require it active, `UPDATE customer_sites SET is_active=true WHERE id=$1 AND is_active=false`, insert the decision +
   audit event. Fail-closed parsers; uniform not-found.
6. Additive `siteApproval: null | {status:'pending'|'approved'|'rejected', note?: string}` on the canonical job DTO (loadCanonicalInspectionJob). FIRST check the web job parsers
   (apps/web/src/jobs/*) accept an extra key; if any would reject it, report that instead of changing web files (the web phase will handle it).
7. Existing paths must be untouched: GET /api/customers/:id/sites (is_active only), Manager visit lists, final report (reads the site from the snapshot), the closed-job
   site_id trigger, deleteUnstartedServiceVisit.

TESTS (disposable Postgres pwa-cr02-db, 127.0.0.1:55434; SEED_INTEGRATION_DATABASE_URL = DATABASE_URL; style of locationProposals.integration.test.ts)
401 unauthenticated; inspector 403 on manager routes; admin and supervisor can list+decide; parser (exactly one of siteId/newSite, unknown keys, blank/oversize/control chars);
create = 1 inactive site + 1 proposal + job points at it + snapshot + audit rows; same request same body -> same job, no duplicate rows; same request different name -> 409;
concurrent double-submit -> exactly 1 job/1 site/1 proposal; two technicians same name concurrently -> 1 site, 1 proposal, 2 jobs; active-name conflict -> 409 and nothing written;
pending site absent from technician and manager site lists; old path with a pending siteId -> SITE_NOT_FOUND; approve makes it visible everywhere; replay returns the same
decision; reused requestId with a different body 409; second decision 409; concurrent approve vs reject -> one winner; reject needs a note and the visit + report still load;
approve with an active same-name site -> 409; approve for an inactive customer -> 404; append-only triggers refuse update/delete/truncate; deleteUnstartedServiceVisit leaves the
proposal intact; decision body cannot change the name; siteId-path snapshot byte-identical to before. Existing serviceVisits.test.ts, locationProposals.integration.test.ts, final
report/PDF tests and the historical matrix stay green and unweakened. Run the API typecheck/build and the API part of the standard gates.

REPORT -> docs/testing/CR02_P1_SITE_PROPOSALS_API.md: files changed (one line each), the migration SQL, the web-parser finding from step 6, tests + results, P0/P1/P2, limitations
(a rejected visit cannot be re-pointed to another site in v1; web UI is Phase 2), reproducible PowerShell block that starts its own disposable DB. STOP when green. Do NOT stage/commit.
```

---

## Merge order and what happens after
1. As each report arrives, paste it to Claude for review (Claude reads the worktree, so no merge is needed to review).
2. Merge in the order the reviews finish. Expected conflicts: `server.ts` and `db/migrations.ts` between A and C only — keep both lines, keep 049 before 050.
3. After each merge, run that branch's focused gates once on the merged result. Then remove the worktree (`git worktree remove C:\PWA_wt\cr07`).
4. Wave 2 (after merge): CR-07 Phase 2 (other systems), CR-02 Phase 2 (web), CR-01 Phase 2 (pilot CO2/Wet Chemical web), CR-09 B (after Q1–Q9). Web phases still collide with
   each other on the forms, so run at most one web phase per form family at a time.
