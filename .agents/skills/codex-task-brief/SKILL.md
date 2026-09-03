# Codex Task Brief Skill

## Purpose

Standing scaffold for every implementation/remediation task handed to an external coding agent
("Terra") on this repo, and for the review pass that follows it ("Sol"). A per-task prompt then
only needs: **"Follow `.agents/skills/codex-task-brief/SKILL.md`. TASK: … DoD additions: …"**
plus the task-specific detail. Everything below is assumed and does not need repeating.

Read this together with `.agents/skills/v7-evidence-acceptance/SKILL.md` (the governing
architecture) and whichever domain skills the task touches (`sync-engine`, `indexeddb-data-model`,
`backend-api-security`, `offline-first-pwa`, `on-premise-windows-deployment`, `pwa-release-testing`).

---

## Standing header (true for every task)

- Repo command is always exactly: `cd C:\PWA_OfflineRecordWebApp`
- Branch: `phase-8e-client-demo-polish`   Accepted baseline: `e30c649`
- Local runtime: `https://localhost/`   Demo accounts: Manager `mobiletest` / Technician `technician-demo`
- Live status + roadmap: `HANDOVER.md` (update its "Last updated" line and the relevant section
  as part of finishing any task).

---

## Standing rules

1. **No git mutations, ever.** Do not stage, commit, push, merge, rebase, tag, reset, restore,
   stash, or switch branches. The owner does all git manually. Stop before staging.
2. **No scope widening.** Do only the task. Note anything else you spot; do not fix it.
3. **Mirror the proven path.** CO2 V7 and Wet Chemical V7 and Fire Alarm V7 are the reference
   implementations. New work copies their shape; it does not invent a new mechanism.
4. **Additive only.** Never mutate a published template version or auto-upgrade an existing
   Job / Draft / Pending / Accepted. V1–V5, Fire Alarm V6, CO2 V1, Wet Chemical V4 stay
   byte-identical to `e30c649`.
5. **Historical immutability + result model:** `good` / `poor` / `not_relevant` only;
   `Normal` / `Test` / `Isolation` are a separate control and never change.
6. **Test DB discipline:** integration tests use the disposable Postgres on `127.0.0.1:55432`
   only. Never the runtime Postgres (`inspection_pwa-postgres-1`). Never `docker compose down -v`,
   `docker volume rm`, or `docker system prune`. A SKIP is not a PASS.
7. **Reproducible from cold.** Any command block you hand back must start a fresh disposable DB
   itself and work verbatim even when `DATABASE_URL` is already set to something else.
8. **Report honestly.** If a gate fails or a proof is missing, say so; do not mark it closed.

---

## Standard file map

| Area | Path |
|---|---|
| V7 evidence adapter registry | `apps/api/src/inspections/evidence/v7EvidenceContracts.ts` |
| V7 staged-evidence authority | `apps/api/src/inspections/evidence/v7StagedEvidence.ts` |
| V7 master template | `apps/api/src/inspections/templates/masterServiceReportV7.ts` |
| V7 schema migration (all V7 DDL here) | `apps/api/migrations/018_v7_shared_staged_evidence.sql` |
| CO2 / Wet Chemical V7 acceptance (pattern) | `apps/api/src/sync/co2FormInstanceSync.ts` |
| Fire Alarm V7 acceptance (pattern) | `apps/api/src/sync/fireAlarmV7Acceptance.ts` |
| Generic master-system sync | `apps/api/src/sync/masterSystemInspectionSync.ts` |
| Accepted Detail | `apps/api/src/inspections/acceptedMasterSystemDetail.ts`, `apps/api/src/routes/masterSystemInspections.ts` |
| Final Report / PDF | `apps/api/src/reports/finalServiceReport.ts` |
| Customer config / catalog version | `apps/api/src/routes/managerCustomers.ts`, `apps/api/src/routes/inspectionReference.ts` |
| Service-visit creation | `apps/api/src/jobs/serviceVisits.ts` |
| Seed | `apps/api/src/db/seedMasterServiceReport.ts` |
| API config resolution | `apps/api/src/config/env.ts` |
| Web V7 evidence (pattern) | `apps/web/src/co2/v7Evidence.ts`, `v7AcceptedEvidence.ts`, `V7EvidenceField.tsx` |
| Web sync engine | `apps/web/src/sync/syncEngine.ts` |
| Web local DB | `apps/web/src/db/localDatabase.ts` |
| Per-system web module | `apps/web/src/<system>/` |

## DO-NOT-MODIFY (must be byte-identical to `e30c649` at the end; show `git status` for these)

```
apps/api/src/inspections/templates/masterServiceReportV1.ts … V6.ts
apps/api/migrations/017*
apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts
apps/api/src/sync/fireAlarmV6Acceptance.ts
apps/api/src/reports/fireAlarmV6FinalReport.integration.test.ts
```

---

## Standard gates (run all; paste output; all must PASS)

```
cd apps/api && npm run typecheck && npm run build
cd apps/api && npm run test:historical-matrix && npm run test:v6-evidence && npm run test:wet-chemical-definition
cd apps/api && npx tsx --test src/inspections/evidence/v7EvidenceContracts.test.ts src/config/env.test.ts
cd apps/api && npm run test:v6-integration            # DB up
# full V7 integration set — cold, hermetic, one command:
docker rm -f phase8f-v7-verify 2>$null
docker run -d --rm --name phase8f-v7-verify -e POSTGRES_DB=inspection -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=replace-with-a-real-secret-outside-git -p 127.0.0.1:55432:5432 postgres:16-alpine
# wait for pg_isready
cd apps/api ; $env:NODE_ENV='test'
$env:DATABASE_URL='postgres://bogus:bogus@10.255.255.1:9999/nope'
$env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/inspection'
node --import tsx --test --test-concurrency=1 src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts
docker rm -f phase8f-v7-verify
cd ../web && npm run typecheck && npm run build && npm run test:v7-stale-evidence
git status --short        # DO-NOT-MODIFY list clean
git diff --check          # clean (CRLF warnings only)
```
Plus any task-specific tests named in the brief.

---

## Definition of Done — report as a table

For every task, end with:

- A row per DoD item (from this skill's standard gates + the brief's "DoD additions"), each PASS/FAIL.
- `git status --short` proving the DO-NOT-MODIFY list is clean.
- Historical immutability confirmed (V1–V5, Fire Alarm V6, CO2 V1, Wet Chemical V4 unchanged).
- `P0 remaining: <n>` and `P1 remaining: <n>`.
- The list of files changed, each with a one-line reason.
- The corrected reproducible command block if the brief involved tests.
- Explicit verdict line the brief asks for (e.g. `SAFE FOR SOL RE-REVIEW: Y/N`).

Then stop. Do not commit, do not run manual sanity, do not start the next task.

---

## Sol review brief (the pass after Terra)

- Review the uncommitted working tree against `e30c649`. Modify no file.
- Confirm each item the Terra brief claimed closed, with `file:line` + a concrete failing scenario
  for anything not closed.
- Check for NEW defects introduced by the change (especially in auth predicates, SQL built by
  interpolation, config resolution, and anything that could touch the runtime DB or production).
- Re-run the standard gates from a cold start; a command block that doesn't work verbatim is a finding.
- Deliver: `P0` count, `P1` count, `NEW DEFECTS: Y/N` (list), `HISTORICAL IMMUTABILITY INTACT: Y/N`,
  `SAFE FOR MANUAL FINAL SANITY: Y/N`, `SAFE TO COMMIT: Y/N`.

---

## Per-task brief skeleton (what the owner pastes)

```
Follow .agents/skills/codex-task-brief/SKILL.md. Read v7-evidence-acceptance + <domain skills>.

TASK
<the specific work, in numbered points; name the files from the file map>

DoD ADDITIONS (beyond the standard gates)
<task-specific proofs, e.g. "new customer lands on v7", "browser: Fire Alarm form shows 3-state">

STOP when the DoD table is green. Print files-changed + reproducible block. Do NOT commit.
```
