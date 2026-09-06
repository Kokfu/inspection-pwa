# Project Handover & Live Status

> Single source of truth for current state. Update the "Last updated" line and the
> relevant section on every change. Keep it short — link to code, don't duplicate it.

**Last updated:** 2026-09-06 — **STEP 2.3 Fire Intercom DONE, end to end** (this commit; Sol
review pending). The
second V7-only system (no V1-V6 lineage), composed fresh in `masterServiceReportV7.ts`
(`fire_intercom`, sortOrder 11, four-state natively). Structurally the simplest page on the form:
ONE `station_schedule` section, one `repeatable_table` (`asset_reference` "Station" /
`condition` / `remarks`), one section-level comments block, **no checklist sections and no header
fields at all**. Per the 2026-09-04 owner decision the paper's `Condition Yes`/`Condition No` x
`1`/`2` box grid is collapsed to one four-state result + own remark per station row; the original
four-box structure is not modelled, and the three interpretive calls are recorded in the
definition's own `confirmationNotes`. Full stack: migration `026` (evidence CHECK widening only),
contract adapter, `fireIntercomV7Acceptance.ts` (with G10's `sameManifest()` from day one),
`fireIntercomInspectionSync.ts`, sync/staged-evidence/job-completion wiring, Accepted Detail
reader + route branch, Final Report + PDF, and a new `apps/web/src/fireIntercom/` module.
Proofs: `fireIntercomV7.integration.test.ts` (12 cases incl. G10 reverse-order retry),
`acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6), `fireIntercomV7SubmissionIssues.test.ts`
(12, both gates proven to fail against perturbed code), `fire-intercom-v7-offline.html/.spec.ts`
(browser round trip, 2 findings on distinct rows each loading its own accepted photo). Full V7
integration set green from cold: **76 tests** (was 62 with G10). G10 was committed on its own
first and is untouched by this task. Also in this change: §1/§3/§5/§6a corrected — STEP 0.2,
Hydrant 1.1, Hose Reel 1.2, Automatic Sprinkler 1.3 and Smoke Ventilation 2.2 were all still
labelled "uncommitted" here long after they were committed, and §6a still showed Hydrant / Hose
Reel / Automatic Sprinkler as not on V7. Real count is **10 / 12**. See §5 2.3, §6a and §7.
Previously: **STEP 2.2 Sol remediation committed and re-reviewed: SAFE TO
COMMIT: Y, 0 P0 / 0 P1.** Sol's first pass returned N with 2 P1s; both are now closed. (1) Manifest
ordering broke idempotent retry — fixed, and Sol's re-review confirmed Terra's dispute: the bug is
**INHERITED**, present in all six V7 acceptance handlers. **The other five are still wrong** and
are the top outstanding P1 (see §4 G10). (2) The configured-Fan-Schedule-row concern was a *test
and documentation* hole, not a missing guard — no guard added, correctly. **Note: Terra's stated
reason for refusing that guard was factually wrong** (it conflated
`initialStructureRequiredSystemKeys`, which only filters the technician initial-format picker and
already contains Dry/Wet Riser, with `locationDependentSystemKeys`, which governs Manager
assignment). The conclusion held; the reasoning did not. Corrected in §7 — do not trust the
remediation commit message on that point.
Previously: **STEP 2.2 Smoke Ventilation complete (committed `ade85f6`), Slices 1–3.**
The first system with **zero V1–V6 lineage**: composed fresh into `masterServiceReportV7.ts`
(sortOrder 10, four-state natively) rather than upgraded from V6, which needed a small new
"no legacy contract" registration in both `systemContractCompatibility.ts` files. Full V7
evidence path: adapter, migration 025, atomic acceptance, Accepted Detail, Final Report,
web module, offline round trip. 9 adversarial DB integration cases + 12-check offline browser
harness + 10 client submit-gate tests (drift guard proven to fail against a deliberately
perturbed client path). **STEP 2.1 FM200 remains BLOCKED** — the roadmap's "client says same
structure as CO2" line has no dated record and is contradicted by the stub's own
`confirmationNotes` and by `docs/paper-forms/fm200.md`; see §7.
Previously: STEP 1.5 Portable Fire Extinguisher closed (`7cba8fb`): hypothesis
confirmed — a V7-templated job's Portable Fire Extinguisher system already resolved, opened,
saved a Draft, submitted, and synced correctly with **zero code changes**, purely via the
structural (non-version-gated) match in `isCompatibleSystemContract`. Proved with a real browser
round trip and a real-Postgres integration test; no production file touched. Dry/Wet Riser STEP
1.4 offline-round-trip browser proof committed (`a1cb7bf`), two independent Sol review passes both
SAFE TO COMMIT: Y; G4 closed (was already fixed in `ba1fb2a`, just never marked done here).
Hydrant STEP 1.1 (`81db211`), Hose Reel STEP 1.2 (`efef275`) and Automatic Sprinkler STEP 1.3
(`7e2a7e6`) all committed and complete.
**Repo:** `C:\PWA_OfflineRecordWebApp`  ·  **Branch:** `phase-8e-client-demo-polish`  ·  **HEAD:** `f5ed7e3` (+ G10 and STEP 2.3 committed on top)
**Local runtime:** https://localhost/  ·  **Demo accounts:** Manager `mobiletest` / Technician `technician-demo` (passwords held by owner, never committed — created manually via `create-admin`, not seeded)

---

## 1. One-line status

**10 of 12 services on the V7 evidence model** — 9 with a full evidence workflow (Fire Alarm, CO2,
Wet Chemical, Hydrant, Hose Reel, Automatic Sprinkler, Dry/Wet Riser, Smoke Ventilation, Fire
Intercom), plus Portable Fire Extinguisher (registration-only by design, C4). All committed and
browser-proven through the full offline→sync→Accepted→PDF workflow. **Release blocked by P0-M1
(§4) — the runtime API is in a migration restart loop.** Result model is now
**4-state** (Hokuden legend: `good` / `not_good` / `complete_repair` / `na`); validators are
per-field `allowedValues`-driven so a 2-state page can declare its own set. Detector
Normal/Test/Isolation is multi-select. Shared repeatable-row model (C3) extracted, unconsumed.

**Hydrant STEP 1.1 — DONE, committed `81db211`.** Its seven deployed row result columns—including
both Canvas Hose results—use the four-state V7 definition with row+column evidence paths, additive
migration 021, field-owned accepted photos, and Final Report/PDF output. The isolated browser proof
covers IndexedDB reload, offline queueing, reconnect sync, and Accepted Detail.

**Hose Reel STEP 1.2 — DONE, committed `efef275`** (server slice landed with Hydrant in `81db211`).

**Automatic Sprinkler STEP 1.3 — DONE, committed `7e2a7e6`** (server + web slices `ba1fb2a`,
`eea9c5d`). **Owner decision:** V7 Automatic Sprinkler **drops** the legacy Cut-In/Cut-Out PSI photo
lifecycle — V7 carries V7 finding evidence only; the legacy PSI lifecycle stays exactly as-is for
V1–V6. The V7 input form no longer shows the legacy `PhotoEvidenceField` (gated on `!isV7`, proven
by `automaticSprinklerV7PsiControl.test.tsx`). Slice 3 added
`validateAcceptedAutomaticSprinklerV7Detail` (separate schema-2 reader), the `automatic_sprinkler`
+ schema-2 branches in `masterSystemInspections.ts` / `finalServiceReport.ts`
(`validHistoricalUnit`, `validatedV7SuppressionEvidence`, evidence dispatch), a schema-2 branch +
V7 accepted-evidence fetch in the web `ServerAutomaticSprinklerView` / `serverAutomaticSprinklerApi`,
and a full offline-round-trip browser proof (`automatic-sprinkler-v7-offline.html/.spec.ts`).
`stagedEvidence.ts` `/v7-evidence/accepted[/…/content]` now serve every V7 system (owner fix —
Hydrant/Hose Reel accepted photos returned empty before).

**Dry/Wet Riser STEP 1.4 — DONE, committed `a1cb7bf`.** The V7 web module (form, evidence
adapter, Accepted Detail, sync wiring) already existed from earlier work; this pass added the
missing `dry-wet-riser-v7-offline.html/.spec.ts` automated browser proof, mirroring Automatic
Sprinkler's Slice 3 harness: Save Draft → reload → offline Submit → reconnect Sync → Accepted →
Accepted Detail, with 3 distinct findings (checklist / measurement / riser-outlet row), each
owning its own remark + photo. Two independent Sol review passes, both **SAFE TO COMMIT: Y** —
the first pass caught a stale `sortOrder` on the harness's synthetic fixture definition and a
UUID-prefix collision with `fire-alarm-v6-offline.html`, both fixed and re-verified before commit.
**G4 also closed** (see §4) — it turned out to already be fixed server-side in `ba1fb2a`, just
never marked done in this doc. Historical V1–V6 riser (`dryWetRiserAccepted.test.ts`) unaffected.
Not yet through a live-runtime manual browser sanity pass (unlike Fire Alarm/CO2/Wet Chemical's
STEP 0.3) — verification here is the automated Playwright harness only.

Committed chain (all verified): `5bc968d` V7 foundation · `0e04a64` NTI multi-select ·
`7635cb3` paper-form transcription + C3 skill · `2e07ab1` C3 row model (T1) ·
`d7ecc0d` **C1-REWORK 4-state**. Safety branches: `phase-8f2b2a…d-final-accepted`, `phase-8f2c-final-accepted`.

**Deployed:** runtime rebuilt + recreated 2026-09-04 on the G7 fix, which was uncommitted at
that time
(`build-20260903T174358Z`); migration 020 applied, API booted clean, stored V7 defs are 4-state.
`SV-20260903-36` is already `technician_visible=false`. **Still owed: the 4-state browser sanity
pass** (checklist in §4) — it is the only thing between here and "3/12 fully proven".

**Fire Intercom STEP 2.3 — DONE.** The second system with **no V1-V6 lineage**,
built by mirroring Smoke Ventilation (STEP 2.2, `ade85f6`) and trimming: Fire Intercom is a strict
subset — one repeatable table, one four-state result per station row, one section-level comments
box, no checklist sections and no header fields. Its "legacy" contract version is 7 itself, the
same deliberate self-reference Smoke Ventilation introduced, so it also gets a single contract
variant rather than the legacy+V7 pair every STEP 1 system has.

**Next:** STEP 2.4 **Fire Rated Roller Shutter** still needs a client-confirmed spec, and STEP 2.1
FM200 remains blocked on a real client answer (see §5). With Fire Intercom done, every STEP 2
service that was *ready to build* is built. All STEP 1/2 services inherit 4-state + C3. C2
(remarks pick-list) remains deferred to last.

---

## 2. How to run / rebuild / test

```powershell
# Run the local runtime (https://localhost)
docker compose up -d
docker compose logs api --tail=50        # confirm migrations + seed ran clean

# Rebuild after code changes (images bake source at build time — no hot reload)
docker compose build api proxy ; docker compose up -d

# V7 integration tests (disposable DB, never the runtime DB)
docker run -d --rm --name phase8f-v7-verify -e POSTGRES_DB=inspection -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=replace-with-a-real-secret-outside-git -p 127.0.0.1:55432:5432 postgres:16-alpine
# wait for TCP readiness (use -h 127.0.0.1 — the unix socket races the postgres:16-alpine init/restart):
#   do { Start-Sleep -Seconds 1 } until (docker exec phase8f-v7-verify pg_isready -h 127.0.0.1 -U inspection_app -d inspection)
cd apps/api
$env:NODE_ENV='test'; $env:DATABASE_URL='postgres://bogus:bogus@10.255.255.1:9999/nope'
$env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/inspection'
node --import tsx --test --test-concurrency=1 src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts
# manager/catalog integration test needs its own dedicated DB (asserts path = /phase6_seed_integration):
#   docker exec phase8f-v7-verify createdb -h 127.0.0.1 -U inspection_app phase6_seed_integration
#   $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/phase6_seed_integration'
#   npx tsx --test src/routes/managerCustomers.integration.test.ts
cd ../.. ; docker rm -f phase8f-v7-verify
Remove-Item Env:DATABASE_URL,Env:NODE_ENV,Env:SEED_INTEGRATION_DATABASE_URL -ErrorAction SilentlyContinue

# Fast gates
cd apps/api ; npm run typecheck ; npm run build ; npm run test:historical-matrix ; npm run test:v6-evidence
cd apps/web ; npm run typecheck ; npm run build
```

Rules: never `docker compose down -v` / `volume rm` / `system prune`. Never point tests at the
runtime Postgres. Git is done manually by the owner (agents never stage/commit/push).

---

## 3. What is DONE and verified

**STEP 0.1 — committed `5bc968d`** (safety branch `phase-8f2b2a-final-accepted`):

- V7 template `00000000-0000-4000-8000-000000000807` (MFE-FSSR v7), migration `018`, shared
  staged-evidence authority, per-system contract adapters (`co2_fire_extinguisher`,
  `wet_chemical`, `fire_alarm_detector`).
- Good / Poor / Not Relevant; per-Poor own remark + own photo; Normal/Test/Isolation untouched.
- Frozen manifest derived from the current Poor set; stale evidence (Poor→Good/NR) excluded.
- Evidence uniqueness scoped to `jobId + systemKey`; accepted-only partial indexes; concurrent
  race → one Accepted, loser mapped to retryable `EVIDENCE_CONFLICT`; different Job + same bytes allowed.
- Closed/hidden-job exact idempotent retry → same Accepted authority; unknown/forbidden/closed/
  hidden collapse to one response (`JOB_ACCESS_DENIED`).
- Fire Alarm V7 Accepted Detail requires owner/admin scope (no `technician_visible` over-restriction).
- Atomic acceptance, Accepted Detail, Final Report, PDF-with-embedded-image — all covered by
  integration tests against real PostgreSQL, reproducible from a cold start with a hostile
  `DATABASE_URL`.
- Historical immutability intact: V1–V5, Fire Alarm V6, CO2 V1, Wet Chemical V4 byte-identical.
- Docs: `.agents/skills/v7-evidence-acceptance/SKILL.md` + cross-references in sync-engine /
  backend-api-security / indexeddb-data-model / AGENTS.md.
- Review: 4 independent (Sol) passes; final verdict **SAFE TO COMMIT: Y**.

**STEP 0.2 — DONE, committed `0e04a64`** (re-verified 2026-09-03):

- `INSPECTION_CUSTOMER_CATALOG_VERSION` config key (`env.ts`, default 7); `managerCustomers.ts`
  consumes it for every customer/config-revision/service-visit insert; `inspectionReference.ts`
  lists + resolves v7 (Fire Alarm v7 → `resolveFireAlarmV6Controls(def, 7)`).
- New coverage: `env.test.ts` (unset→7, `"6"`→6); `managerCustomers.integration.test.ts`
  (catalog `[1..7]`, v7 Fire Alarm `templateVersion:7`, new customer + visit freeze v7).
- All standard gates + both new tests green. DO-NOT-MODIFY list clean.

---

## 4. Known gaps / blockers

| # | Gap | Impact | Where |
|---|-----|--------|-------|
| **P0-M1** | **RELEASE BLOCKER — the runtime API cannot start; migration 018 is replayed and NARROWS the two evidence `system_key` CHECK constraints back to Fire Alarm / CO2 / Wet Chemical.** `runMigrations` replays every migration unconditionally, in order: `018` (3-key CHECK) runs at `migrations.ts:288`, and only then do `021`–`026` re-widen it. `ALTER TABLE … ADD CONSTRAINT … CHECK` validates existing rows, so on any database that already holds a reservation for a later V7 system (`hydrant`, `hose_reel`, `automatic_sprinkler`, `dry_wet_riser`, `smoke_ventilation`, `fire_intercom`) migration 018's own `ADD` raises `23514` and startup aborts before 021 is reached. **Pre-existing since `81db211` (STEP 1.1, migration 021 introduced `hydrant`)** — not introduced by STEP 2.3, but it makes migration 026 non-idempotent through the real startup path and it is why the deployed API is down. Confirmed live: `inspection_pwa-api-1` = `Restarting (1)`, API log `23514` on `inspection_evidence_reservations_system_key_check` at `runMigrations`. Integration tests never see it because every V7 test starts from `DROP SCHEMA public CASCADE`. | Deployed API never starts. Any restart of an already-deployed runtime is fatal. No technician can sync. | `apps/api/src/db/migrations.ts:288`, `apps/api/migrations/018_v7_shared_staged_evidence.sql:4-13` |
| ~~G2~~ | **CLOSED 2026-09-03.** Full browser workflow proven for Fire Alarm + CO2 + Wet Chemical V7 on `SV-20260903-34`: 3-state, Poor+own remark+own photo, Save Draft → reload → offline Submit → reconnect → Sync → Accepted → Accepted Detail → photo → Complete Service → Final Report → PDF with 3 embedded images. Stale Poor→Good evidence correctly excluded. Historical CO2 V1 / Wet Chemical V4 unchanged (2-state). | — | — |
| ~~G3~~ | **CLOSED.** All V7 work through C1-REWORK committed (`d7ecc0d`). | — | — |
| ~~G4~~ | **CLOSED** (fixed in `ba1fb2a`, confirmed 2026-09-05 — never marked done here until now). `managerCustomers.ts`'s `assertDryWetRiserAssignments` rejects an unconfigured/invalid `dry_wet_riser` assignment at write time (`RISER_MODE_REQUIRED`, no valid `riserMode`); `inspectionReference.ts`'s `usableEnabledSystems` filter additionally excludes any stored riser row that fails `parseDryWetRiserSystemConfiguration` from `GET /customers/:id/configuration`, so a bad row degrades that one system instead of 500ing the whole customer. | — | — |
| G5 | Manager "Create Service Visit" silently reset the form without creating anything and no error (hit during 0.3 browser sanity, 2026-09-03). | Primary action fails silently. | `apps/web` new-service-visit flow |
| ~~G6~~ | **PARTLY CLOSED 2026-09-04.** `d7ecc0d` deployed; 4-state options render in all 3 forms. Bug found + fixed (`3065539`): CO2/Wet Chemical `V7EvidenceField` was gated on `result === "poor"` (unreachable) so no photo could be attached on a finding — now `not_good \|\| complete_repair`. Deployed `sha256-188fbb1857f422d5`. |
| ~~G7~~ | **ROOT-CAUSED + FIXED 2026-09-04, awaiting browser re-verification.** Not a 4-state defect at all: the technician **attached the same photo to two findings**. Reproduced in-browser on `SV-20260904-38` (instance `10433777`), outbox `lastError` captured = `"This V7 inspection is unavailable"` (`JOB_ACCESS_DENIED`). Both staged rows carried identical `source_sha256` **and** `stored_sha256`, so `parseV7EvidenceManifest` refused the manifest, and `fireAlarmV7Acceptance.ts` folded `!manifest` into the collapsed job-access guard — reporting a payload problem as a Job problem. Confirmed the same duplicate pair in the owner's original `8b4cc663` rows. Fixes: (a) capture-time guard in `saveFireAlarmV7Photo` / `saveV7SuppressionPhoto` refuses a photo already attached to another field, naming it; (b) submit gate `duplicateV7PhotoIssues` in both `fireAlarmV7Evidence.ts` and `co2/v7Evidence.ts` — the offline-safety layer, same precedent as 0.4b; (c) server splits the manifest failure out of the collapsed guard (after it, so no job-existence leak) and names the reused image; CO2/WC get the same treatment plus a separate `EVIDENCE_NOT_STAGED` for two sources that normalize to the same stored bytes. Coverage: new `fireAlarmV7.integration.test.ts` case (first ever to submit `complete_repair`, a secondary alarm-device row finding with row-scoped evidence, and a reused photo); 3 new web submit-gate tests, the duplicate one **proven to fail against the pre-fix code**. | — | — |
| G9 | **Duplicate photo across two *instances* of one system in the same Job** (CO2/Wet Chemical multi-location) is still only caught at acceptance, by the `acceptedHashes` pre-check (backed by the `staged_inspection_evidence_v7_accepted_*_per_job_system` indexes) → `EVIDENCE_CONFLICT`. The message is truthful, but the outbox re-attempts `Failed` items on every sync (`syncEngine.ts:193`), so it can never succeed. The G7 client guards are scoped to one `inspectionClientUuid`; attachments carry no `jobId`, so widening needs a join through `masterSystemFormInstances`. | A technician reusing one photo across two CO2 locations retries forever. | `apps/web/src/co2/v7Evidence.ts`, `apps/api/src/sync/co2FormInstanceSync.ts` |
| ~~G10~~ | **CLOSED 2026-09-06.** The order-independent `sameManifest()` comparison (length + fingerprint of `canonical`-ised entries, order-independent) — proven earlier on Smoke Ventilation — is now applied to the accepted-authority pre-check in all five remaining V7 acceptance handlers: `fireAlarmV7Acceptance.ts`, `hydrantV7Acceptance.ts`, `hoseReelV7Acceptance.ts`, `automaticSprinklerV7Acceptance.ts`, `dryWetRiserV7Acceptance.ts`. Comparison side only — `parseV7EvidenceManifest`'s fieldPath sort is the stored authority and is untouched. Permutation equality is the sole behaviour change: a manifest with different entries, a different length, or duplicates still returns `IDEMPOTENCY_CONFLICT`. One regression case per handler in its existing `*V7.integration.test.ts` (reverse-fieldPath manifest → accept → identical retry is duplicate success, and again after Job closure; plus dropped-entry and changed-bytes retries that both still conflict) — each proven to fail against the old positional comparison by reverting the one-line swap and observing the retry assertion fail with `IDEMPOTENCY_CONFLICT`, then restoring. **CO2 / Wet Chemical (`co2FormInstanceSync.ts`) checked and NOT affected** — it fingerprints over the `v7Manifest()`-sorted manifest on both the first-acceptance store and the retry pre-check, so an unsorted retry normalizes to the same fingerprint (the `grep` for `canonical(payload.evidenceManifest)` correctly did not match it). Full V7 integration set green: 62 tests (was 57). `hydrantV7.integration.test.ts` still sorts its happy-path manifest with a now-stale "compares … positionally" comment — harmless, left in place; a trivial follow-up can drop that workaround. | — | — |
| G8 | Fire Alarm form auto-persists a Draft on Add/Remove row (pre-existing — technician-row helpers write immediately). Not a C1-REWORK regression. Low priority. | Minor UX surprise. | `apps/web/src/fireAlarm/fireAlarmRepository.ts` |
| — | ~13 orphaned `staged` Fire Alarm evidence rows in runtime back to Aug 30 — abandoned drafts/test runs, **not a bug** (evidence stages before acceptance). Ignore or clean at leisure. Two more were added by the G7 repro (`10433777…`). | none | — |

### Outstanding owner check — 4-state browser sanity (blocks closing G7)

Sign in as `technician-demo` on `https://localhost/` (build `build-20260903T174358Z` or later), then
per system on a V7 job (`SV-20260903-37` is open and untouched):

1. **Fire Alarm / CO2 / Wet Chemical each:** `Good` and `No Need Checking / N.A.` show **no**
   remark-required and **no** photo widget; `Not Good` and `Complete Repair` each reveal
   `Remark *` **and** the photo widget on that field only.
2. **G7 regression:** attach one photo to a finding, then attach the *same file* to a second
   finding — expect `This photo is already attached to <field>. Each finding needs its own photo.`
   at capture time, and nothing queued.
3. Distinct photos on every finding → Submit → Sync → **Accepted** → Accepted Detail renders the
   4-state labels and serves each photo from `/api/v7-evidence/accepted/…`.
4. Complete Service → Final Report → **PDF** with one embedded image per finding.
5. Additive: historical CO2 (V1) and Wet Chemical (V4) still render 2-state.

---

## 5. Roadmap

**Goal (owner-confirmed):** every service gets the V7 evidence model (Good / Poor / Not Relevant
+ per-Poor own remark + own photo) on a fixed base template, with future per-customer *minor*
modification done by the Manager via `customer_enabled_systems.system_configuration` (jsonb hook
already exists; editing UI is Phase 8H). Customers subscribe to many services; technician or
manager picks them (`customer_enabled_systems` rows).

### STEP 0 — Workflow demo: Fire Alarm + CO2 + Wet Chemical  ← DO FIRST  (~2–3 working days)
- [ ] 0.1 Commit the finished V7 work + create `phase-8f2b2a-final-accepted`. (ready now — owner review, then `git commit`)
- [x] 0.2 **G1 — V7 front door:** `customerCatalogVersion` config-driven (default 7);
      `inspectionReference.ts` catalog includes v7; Manager customer setup can choose v7.
      Re-verify gates + short Sol spot-check. **DONE + re-verified 2026-09-03** — all standard
      gates green; `managerCustomers.integration.test.ts` green after `createdb -h 127.0.0.1`
      fix (Codex's repro block used the racy unix socket). Uncommitted (6 files). Nits (owner's
      call): `loadConfig()` captured at module load in `managerCustomers.ts`; env pin to `"6"` is
      a soft default only — `inspectionReference.ts` still lists/asserts exactly 7 published rows.
- [x] 0.4 **DONE + verified 2026-09-03.** Seed demo customer `demoV7Customer`
      (`00000000-0000-4000-8000-0000000009xx`, code `DEMO-V7-SHARED-EVIDENCE`): customer +
      PRIMARY site + active configuration revision on V7 + 3 enabled systems (Fire Alarm, CO2,
      Wet Chemical, all frozen to V7 `…0807`) + one zone/location each for CO2 and Wet Chemical.
      **No job** — seeded jobs are deliberately `technician_visible = false` (regression-fixture
      isolation, asserted by `seedMasterServiceReport.integration.test.ts`). Guarded no-op on
      re-run. Terra did customer+systems+zones/locations; owner added the PRIMARY site
      (`…0909`, inside the same guard) so 0.3 needs no manual add-site. seed + manager
      integration + typecheck green. No open technician-visible pre-V7 Fire Alarm demo job
      exists (0.3 additive check will need a pre-V7 job created via the Manager, or accept the
      historical-matrix test as the V6 regression proof).
- [x] 0.4a **Web catalog contract fix (found by browser sanity, 2026-09-03).**
      `compatibleCatalogSystem` picked the contract template by scanning the catalog
      (`version === contractVersions[key] || version === 7`); since the catalog is ordered by
      version, V1 (CO2) / V4 (Wet Chemical) always shadowed V7, so a V7 job compared its V7
      definition against the historical contract, mismatched, and threw "Cached template version
      is unavailable" — **CO2 and Wet Chemical V7 were unreachable in the browser**. Now the
      contract version is derived from the job's frozen identity.
      `apps/web/src/referenceData/systemContractCompatibility.ts` + new regression suite
      `apps/web/tests/v7CatalogContractResolution.test.ts` (`npm run test:v7-catalog-contract`,
      proven to fail against the old code). Fire Alarm branch untouched.
- [x] 0.4b **Fire Alarm V7 client submit gate (found by browser sanity, 2026-09-03).**
      `v7FireAlarmSubmissionIssues` had dropped every *structural* check `v6SubmissionIssues`
      performs (Control Panel Location, at-least-one-primary-device-row, per-row Alarm Zone /
      Location / all four Normal-Test-Isolation) while the server's `validResponses`
      (`apps/api/src/sync/fireAlarmV7Acceptance.ts`) still enforced them. The form therefore
      queued submissions the server rejected non-retryably with `VALIDATION_ERROR` — offline
      that strands the technician's work in the outbox as "Sync needs attention" with no
      recovery. Structural checks restored in `apps/web/src/fireAlarm/fireAlarmV7Evidence.ts`;
      regression suite `apps/web/tests/fireAlarmV7SubmissionIssues.test.ts`
      (`npm run test:v7-fire-alarm-submit`, proven to fail against the old code).
- [x] 0.3 **G2 — browser sanity: DONE 2026-09-03** on release `sha256-785201faec6bed92`
      (`build-20260903T095536Z`), job `SV-20260903-34`. Per system: Good / Poor / Not Relevant;
      Poor revealed its own remark + photo controls on that field only; Save Draft → full page
      reload → state, remark and photo rehydrated; offline Submit queued ("waiting to sync");
      reconnect → Sync → Accepted. Accepted Detail rendered `Main Supply: Good`,
      `Battery: Not Relevant`, `CO2 Cylinder: Poor - <remark>` with the photo served from
      `/api/v7-evidence/accepted/…`. Stale case: a second field set Poor with a photo then
      reverted to Good was excluded — never staged, never accepted. Complete Service → Final
      Report → PDF (30,543 bytes, 3 `/Subtype /Image` + 3 `/DCTDecode` streams). Accepted
      evidence is field-scoped: `…co2_cylinder`, `…wet_chemical_cylinder`,
      `charger_batteries.charger_battery_checks.main_supply`, all `master_template_version = 7`.
      Additive check: historical CO2 (V1) and Wet Chemical (V4) forms still render 2-state.
- [ ] 0.5 Commit checkpoint (0.2 + 0.4 + 0.4a + 0.4b). **→ Demo-ready.**
      Not yet re-run since the web fixes: the full API gate set. Re-run before committing.

### CROSS-CUTTING — decide before building more services
- [x] **C1 DECIDED 2026-09-03, owner-CONFIRMED 2026-09-04 — 4-state everywhere, all customers.**
      Hokuden cover legend is the house grading standard for every customer:
      `good` (√ Good/Baik) · `not_good` (X Not Good/Tidak Memuaskan) ·
      `complete_repair` (◯ Complete Repair/Siap Baik Pulih) · `na` (/ No Need Checking/N.A.).
      (The MFE system pages are only 2-state; the 3rd/4th states come from the Hokuden cover
      sheet — owner has confirmed this is intentional and universal.) Supersedes the shipped
      3-state. Done via **C1-REWORK** below (`d7ecc0d`).
- [x] **C1-REWORK (Phase 8F.2C):** V7 result model 3-state → 4-state. `masterServiceReportV7.ts`
      `upgradeV7EvidenceSystem` emits the 4 values; every V7 validator
      (`fireAlarmV7Acceptance.ts`, `co2FormInstanceSync.ts`, …) honors **per-field
      `allowedValues`** instead of hardcoding the set (so a 2-state page like Roller Shutter can
      declare `["good","not_good"]`); accepted detail + PDF render 4 states; migration rewrites
      stored V7 definitions (FK-safe: `INSERT … ON CONFLICT DO UPDATE`, restart-proof — see the
      reverted 020 FK failure); V7 Fire Alarm contract SHA recomputed + web constant updated;
      the 3 accepted V7 demo records on `SV-20260903-36` must be owner-cleaned/re-seeded. The
      FK-safe 020 upsert and disposable T1-definition restart proof are green; V1–V6 untouched.
- [ ] C2 **Remarks pick-list — DEFERRED to the very last step (owner, 2026-09-04).** Client has
      not supplied the list. Build every service with free-text remarks for now; retrofit the
      pick-list once received. Do not invent one.
- [x] C3 **Repeatable row model** — skill `.agents/skills/repeatable-row-model/SKILL.md` (`7635cb3`);
      helpers `apps/web/src/inspectionControls/repeatableRows.ts` + 4-invariant tests (`2e07ab1`,
      T1). Unconsumed until STEP 1.1 (Hydrant) / STEP 2.4 (Roller Shutter).
- [x] **C4 DECIDED 2026-09-05 (owner) — a service with no result ovals on its paper form gets no
      V7 evidence; never invent one.** Portable Fire Extinguisher's paper form is count-fields-only
      (no Good/Poor anywhere). Precedent for any future service in the same situation: V7 work is
      registration-only (carry the existing fields onto the V7 template/contract), not a synthetic
      "overall condition" field. See STEP 1.5.
- **Fire Intercom (STEP 2.3) — UNBLOCKED (owner, 2026-09-04).** Do not wait on the client for the
      `Condition Yes / No` `1`/`2` column meaning. Model each floor row as one standard 4-state
      result (good / not_good / complete_repair / na), same as every other service. The paper
      form's Yes/No `1`/`2` grid collapses to a single per-row result + remark.

### STEP 1 — Upgrade existing base templates to V7 evidence  (est. ~4–5 weeks total)
Each: add a V7 evidence-contract adapter (mirror `co2Adapter`), wire the web form to the V7
field, add integration coverage, re-verify, Sol pass.
- [x] 1.1 **Hydrant — DONE, committed `81db211`.** 7-column row-scoped V7 evidence,
      web wiring, Accepted Detail/Final Report/PDF, and integration/browser proof.
- [x] 1.2 **Hose Reel — DONE, committed `efef275`** (server slice landed with Hydrant in
      `81db211`). V7 combined checklist +
      repeatable-drum evidence adapter, forward-only migration 022, and atomic single-instance
      acceptance; V7-only 4-state web wiring, per-finding photos/remarks, evidence-first outbox,
      and the V7 catalog front-door resolver. Slice 3 adds a separate schema-2 Accepted Detail reader,
      accepted evidence rendering, Final Report/PDF embedding, adversarial eight-case integration coverage,
      and browser reload/sync/detail proof. The paper form supports only Duty / Standby in the new 30-minute test block;
      it explicitly omits Jockey, so no Jockey row was invented.
- [x] 1.3 **Automatic Sprinkler — DONE, committed `7e2a7e6`.** Water Tank /
      Pump House / Main Alarm Valve / 30-min pump test on the V7 four-state model, separate
      schema-2 Accepted Detail reader, Final Report/PDF embedding, and a full offline-round-trip
      browser proof. **Owner decision:** V7 DROPS the legacy Cut-In/Cut-Out PSI photo lifecycle
      (V7 carries V7 finding evidence only); the legacy PSI lifecycle is untouched for V1–V6.
- [x] 1.4 **Dry / Wet Riser — DONE, committed `a1cb7bf`.** Dry/Wet toggle, Riser Outlet table,
      four-state checklist/measurement/row-scoped V7 evidence (web module was already built from
      earlier work); this pass added the missing `dry-wet-riser-v7-offline.html/.spec.ts`
      offline-round-trip browser proof (Save Draft → reload → offline Submit → reconnect Sync →
      Accepted → Accepted Detail, 3 distinct findings across checklist/measurement/row scopes,
      each with its own remark + photo). Two Sol review passes, both **SAFE TO COMMIT: Y**.
      Historical V1–V6 riser (`dryWetRiserAccepted.test.ts`) unaffected. See also G4 (closed).
- [x] 1.5 **Portable Fire Extinguisher — DONE, committed `7cba8fb`.** No V7 evidence at all (owner
      decision C4): `docs/paper-forms/portable-fire-extinguisher.md` has no result ovals for this
      section (count fields only — Total / 9KG Dry Powder / 2KG CO2 / free-text Others +
      Comments), so there is no Poor-capable field to hang a photo/remark on and none was
      invented. **Investigation found the hypothesis true: zero code changes needed.** Portable's
      definition has been byte-identical since `masterServiceReportV5.ts` (V6/V7 both fall
      through unchanged), both contract-version maps
      (`apps/web/src/referenceData/systemContractCompatibility.ts`,
      `apps/api/src/inspections/templates/systemContractCompatibility.ts`) compare a job's system
      definition against the V5 contract structurally rather than gating on an exact template
      version, and every call site (`serviceVisits.ts`, `portableFireExtinguisherSync.ts`,
      `managerCustomers.ts`, the web sync engine's dedicated `isPortableOutboxItem` path) already
      calls `isCompatibleSystemContract` without a `frozenMasterTemplate` filter — so a V7 job's
      Portable Fire Extinguisher system already resolves, opens, saves a Draft, submits, and syncs
      end to end with no version gate anywhere in the chain. Proved (not just inspected) with
      `apps/web/tests/portable-fire-extinguisher-v7-offline.html/.spec.ts` (Draft → reload →
      offline Submit → reconnect Sync → Accepted → Accepted Detail, zero evidence/photo steps, on
      a V7-templated job fixture) and `apps/api/src/sync/portableFireExtinguisherV7.integration.test.ts`
      (real Postgres: a V7-templated job accepts through the unmodified
      `syncPortableFireExtinguishers` path, plus an exact-retry duplicate check). Existing
      historical coverage (`portableFireExtinguisherDefinition.test.ts`,
      `portable-fire-extinguisher-sync-race.html`) re-run and confirmed still green, untouched.
      No new Good/Poor/evidence field, no evidence-contract adapter, V1–V6 untouched.

### STEP 2 — New services (need a fresh definition from the paper master + client input)
- [ ] 2.1 **FM200 — BLOCKED, client-input gate NOT satisfied (investigated 2026-09-05).**
      The "client says 'same structure as CO2 for now'" line below was written into this roadmap
      by the very commit that first created the roadmap skeleton (`be9ad11`, 2026-09-03 14:12);
      `git log -S` finds no other source for it, and there is **no dated §7 change-log entry**
      recording it the way C1/C2/C4 and the "client answers" entry each got one. It is also
      contradicted by two later, more careful artefacts: the fm200 stub's own
      `confirmationNotes` in `masterServiceReportV1.ts:639` ("Do not enable this system or infer
      fields from CO2 or Wet Chemical definitions") and `docs/paper-forms/fm200.md` (committed
      `7635cb3`, ~8 h *after* the roadmap line), which records that FM200 has **no page at all**
      in any source PDF and that "it is not known whether MFE uses the CO2 page as a stand-in".
      **To unblock, one of:** (a) a dated, attributed change-log entry confirming the client was
      actually asked *after* the paper-form research and said "reuse the CO2 checklist"; or
      (b) an explicit owner override of the stub's own prohibition, with reasoning. Do not
      resolve by inference. *(original note, unverified: clone the CO2 V7 adapter with FM200
      labels; flip `requires_confirmation` → `confirmed`. ~2 d)*
- [x] 2.2 **Smoke Ventilation — DONE, committed `ade85f6`, Slices 1–3.** First system with **no V1–V6
      lineage at all**: composed fresh in `masterServiceReportV7.ts` (sortOrder 10, four-state
      natively, no `upgradeV7*`/`fourState` rewrite because there is no legacy shape to
      preserve). That required one real, small extension in both `systemContractCompatibility.ts`
      files — a system whose "legacy" contract version *is* 7, giving it a single contract
      variant instead of the legacy+V7 pair every STEP 1 system has. Source
      `docs/paper-forms/smoke-ventilation.md`; follows the **blank master (Revision A)** — one
      Control Panel No. / Location / Date Tested, a single Fan Schedule table (No. / Auto /
      Manual / Remarks), Power Supply (AC + DC), Charger & Batteries, Main Function Key (4),
      Comments. **Two interpretive calls are recorded in the definition's own
      `confirmationNotes`** (same convention as Dry/Wet Riser's and Hose Reel's): (i) Auto/Manual
      are modeled as two independent four-state results under the page's general Good/Poor
      legend — confirm with the client if they instead denote a fixed operating-mode selection;
      (ii) the Hokuden revision's 3 zone panels (8 rows each) and its free-text (not oval) AC/DC
      fields are not modeled. Also: "Date Tested" is a `text` control, not a new `date` control —
      the paper form is a write-in line and no per-system date control exists anywhere in the
      web layer, so none was invented. Fan Schedule rows reuse the existing
      `repeatable_table` + `customer_system_locations` machinery with `supportsZones: false`
      (`zone_id` is already nullable) rather than a new "fixed rows, no location" mechanism.
      Migration `025` widens the two evidence CHECK constraints only — the system row itself is
      brand new, so the ordinary seed `INSERT … ON CONFLICT DO NOTHING` inserts it. Proofs:
      `smokeVentilationV7.integration.test.ts` (9 adversarial cases: stale evidence, reused
      photo naming, stored-hash collision, cross-Job byte reuse, concurrent race, closed/hidden/
      unknown/forbidden collapse, closed-Job idempotent retry, clean zero-finding draft),
      `smoke-ventilation-v7-offline.html/.spec.ts` (12 checks, Draft → reload → offline Submit →
      reconnect Sync → Accepted → Accepted Detail with 3 photos across both evidence scopes),
      `smokeVentilationV7SubmissionIssues.test.ts` (10 client-gate tests incl. the 0.4b
      client/server path-drift guard, proven to fail against a deliberately perturbed path).
- [x] 2.3 **Fire Intercom — DONE, end to end.** The **second** system with no
      V1–V6 lineage, composed fresh in `masterServiceReportV7.ts` (`fire_intercom`, sortOrder 11,
      four-state natively, no `upgradeV7*`/`fourState` rewrite). Built by mirroring Smoke
      Ventilation (2.2, `ade85f6`) and **trimming** — Fire Intercom is a strict subset of it, not
      a new mechanism: one `station_schedule` section → one `repeatable_table`
      (`station_schedule_rows`: `asset_reference` labelled "Station" / `condition` / `remarks`)
      plus one section-level comments block, and that is the whole page. Its "legacy" contract
      version is 7 itself (same self-reference 2.2 introduced), so it gets a single contract
      variant in both `systemContractCompatibility.ts` files. Source
      `docs/paper-forms/fire-intercom.md`. **Spec was fixed by the 2026-09-04 owner decision, not
      by client input:** the paper's `Condition Yes` / `Condition No` × unlabelled `1`/`2` box
      grid is collapsed into ONE V7 four-state result (`good`/`not_good`/`complete_repair`/`na`)
      plus that row's own remark; the original four-box structure is **not modelled**. Three
      interpretive calls are recorded in the definition's own `confirmationNotes`: (i) the box
      collapse and the fact that page 10 carries no legend at all; (ii) the pre-printed station
      labels (`9`…`1`, `Grd Floor`, `Basement`, `Genset`, `Pump Room`, + one blank write-in row)
      are preset configured rows and therefore a Manager-configuration concern (STEP 3.1 /
      Phase 8H) — the definition guarantees no particular rows, a customer with none starts with
      an empty table, and technician write-in rows are always allowed; (iii) the page has **no
      header fields whatsoever** (no Date Tested, no panel/control number, no location line) and
      none were invented, and the single `Comments :` area spans the whole grid so it is one
      section-level block, not a per-row note. Migration `026` widens the two evidence CHECK
      constraints only — the system row itself is brand new, so the ordinary seed
      `INSERT … ON CONFLICT DO NOTHING` inserts it; 017/018 untouched. Row evidence uses the C3
      shape `station_schedule.station_schedule_rows.rows.<rowUuid>.condition`, and the per-row
      `condition` result is the **only** Poor-capable field on the page. Proofs:
      `fireIntercomV7.integration.test.ts` (12 cases — the Smoke Ventilation adversarial set plus
      the **G10 reverse-fieldPath retry from day one**: unsorted-but-identical retry is duplicate
      success, again after Job closure, while a dropped entry and a changed `sourceSha256` are
      still `IDEMPOTENCY_CONFLICT`), `acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6),
      `fireIntercomV7SubmissionIssues.test.ts` (12 client-gate tests — both the 0.4b
      client/server path-drift guard and the duplicate-photo-across-two-findings gate proven to
      fail against deliberately perturbed / pre-fix code), and
      `fire-intercom-v7-offline.html/.spec.ts` (Draft → reload → offline Submit → reconnect Sync
      → Accepted → Accepted Detail, 2 findings on distinct station rows each loading its own
      accepted photo). Browser-verified: the form shows exactly two fieldsets (Station Schedule +
      Comments), a four-state control per station row, a working write-in row, and no Date
      Tested / panel / location field.
- [ ] 2.4 **Fire Rated Roller Shutter** — NOT in the paper master; only in real Hokuden reports
      (No. / Location / Auto Alarm Mode / Manual Mode, 45+ rows). **Needs a client-confirmed spec
      first.** + definition + V7 adapter. (~1 w incl. client input)

### RELEASE BLOCKER — P0-M1 migration replay  ← DO FIRST
- [ ] **Stop `runMigrations` replaying migration 018's narrowing CHECK constraints.** See §4
      P0-M1. The deployed API cannot start. Pre-existing since `81db211`; needs an owner decision
      between (a) a migration ledger so applied migrations are skipped, (b) a deliberate one-time
      correction of the frozen `018` file, or (c) moving the two constraint statements out of the
      replay path. Whichever is chosen, the proof must include a replay against a database that
      already holds a `fire_intercom` / `hydrant` reservation — no V7 integration test catches
      this today because they all start from `DROP SCHEMA public CASCADE`.

### STEP 3 — Manager administration  (Phase 8H)
- [ ] 3.1 Manager UI to edit `customer_enabled_systems.system_configuration` per customer (the
      "minor modification per customer" capability) + evidence-policy assignment + service tick-list.
- [ ] 3.2 Manager review of completed reports / service history (partly exists).

### STEP 4 — Production / real-device readiness  (Phase 9)
- [ ] 4.1 HTTPS on LAN/phone with a trusted cert; production credentials; security checklist.
- [ ] 4.2 Backup + restore drill; on-prem Windows deployment runbook validation.

**Rough total to "all client services on V7 + Manager mods" ≈ 6–9 weeks** of the Codex loop +
owner reviews, gated on client input for C1/C2/2.3/2.4.

---

## 6. Handover package (what the next owner gets)

- This file (`HANDOVER.md`) — live status + run/test/rebuild instructions.
- Git history with per-phase `*-final-accepted` safety-pointer branches.
- `.agents/skills/` — architecture knowledge transfer (V7 evidence/acceptance, sync, IndexedDB, API security, deployment).
- `docs/architecture/` + `docs/testing/` — design decisions and test procedures.
- `AGENTS.md` — repo conventions and the git-ownership rule.

**To hand over cleanly:** finish Tier 1, commit, ensure `HANDOVER.md` §1/§3/§4/§5 reflect reality,
then the repo is self-describing.

---

## 6a. Service status (target: all on V7 evidence model)

| Service | Base template | V7 evidence workflow | Left to do |
|---|---|---|---|
| Fire Alarm / Detector | ✅ confirmed | ✅ **done** (4-state, NTI multi-select, browser-proven) | deploy `d7ecc0d` + re-check 4-state |
| CO2 Fire Extinguisher | ✅ confirmed | ✅ **done** (4-state, browser-proven) | ″ |
| Wet Chemical | ✅ confirmed | ✅ **done** (4-state, browser-proven) | ″ |
| Hydrant | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `81db211`) | — (first C3 consumer) |
| Hose Reel | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `efef275`) | — |
| Automatic Sprinkler | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `7e2a7e6`) | — (V7 drops legacy PSI lifecycle, owner decision) |
| Dry / Wet Riser | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `a1cb7bf`) | — |
| Portable Fire Extinguisher | ✅ confirmed | ✅ **n/a by design (C4)** — confirmed working on V7 with zero code changes, browser + integration proven | — |
| FM200 | ⚠️ requires_confirmation | ❌ | STEP 2.1 — **BLOCKED on a real client answer**, see roadmap |
| Smoke Ventilation | ✅ confirmed (V7-only) | ✅ **done** (4-state, browser + 9-case DB proven, committed `ade85f6`) | — |
| Fire Intercom | ✅ confirmed (V7-only) | ✅ **done** (4-state, browser + 12-case DB proven) | Sol pass |
| Fire Rated Roller Shutter | ❌ none | ❌ | STEP 2.4 — `docs/paper-forms/fire-rated-roller-shutter.md`; 2 failed one-shot attempts, split into 3 slices |

Done: **10 / 12 on V7** — 9 with a full V7 evidence workflow (Fire Alarm, CO2, Wet Chemical,
Hydrant, Hose Reel, Automatic Sprinkler, Dry/Wet Riser, Smoke Ventilation, Fire Intercom; the last
two are the only ones with no V1–V6 lineage), plus Portable Fire Extinguisher — registration-only
by design (C4), no evidence workflow. Base template ready: 10 / 12. Remaining: **FM200** (stub,
`requires_confirmation`, blocked on a real client answer) and **Fire Rated Roller Shutter** (no
template, needs a client-confirmed spec).
All 10 implemented services share the 4-state result model, per-field `allowedValues` and the C3
repeatable-row model; the 9 with an evidence workflow share the V7 staged-evidence authority
(Portable FE has no Poor-capable field by C4, so it has nothing to hang evidence on). FM200 and
Roller Shutter have no implementation yet.

## 7. Change log

- 2026-09-06 — **STEP 2.3 Sol remediation: 2 of 3 P1s and both P2s closed; the P0 is logged as
  P0-M1 and NOT fixed here.** Sol returned `SAFE TO COMMIT: N` (1 P0, 3 P1).
  - **P0-M1 — NOT fixed, own task (see §4).** Verified independently: `runMigrations` replays
    migration 018, whose `ADD CONSTRAINT … CHECK (system_key IN (3 keys))` validates existing
    rows, so any database holding a later-V7 reservation aborts startup with `23514` before
    021–026 re-widen. Confirmed live (`inspection_pwa-api-1` = `Restarting (1)`). **Pre-existing
    since `81db211`**, not introduced by STEP 2.3. Deliberately left alone: every viable fix
    touches either the frozen `018` file (which the standing rules forbid rewriting once applied)
    or the runner's execution semantics, and choosing between them is an owner decision, not a
    remediation-pass side effect.
  - **P1 (closed) — client submit gate was a strict subset of the server predicate.** Sol's probe
    (`clientIssues=[]; serverMatch=false`) was reproduced and is now fixed:
    `fireIntercomRepository.ts` gained `expectedConfiguredRows()`, mirroring
    `expectedConfiguredFireIntercomRows` exactly, and `structuralSubmitIssues` now enforces the
    authoritative `location.sortOrder` ordering, configured-before-technician, exact configured
    `assetReference`, exact `locationSnapshot`, the 250-row cap, and `rowUuid` shape/uniqueness.
    **`configuredRows()` itself was also wrong** — it built a Draft in `system.locations` array
    order rather than frozen `sortOrder` order, so an out-of-order snapshot produced a Draft that
    could never be submitted. Six regression tests added (18 total in the file); a direct probe
    now reports `AGREE=true` for both the reversed-order and frozen-order payloads, and the 251st
    row is refused client-side.
  - **P1 (closed by documentation, flagged for owner override) — the per-row `remarks` column.**
    Sol is right that this page prints no Remarks column, so it has no source in
    `docs/paper-forms/fire-intercom.md`. It is not an invention of this task: it was specified in
    the task brief, and `remarks` is part of the frozen shared repeatable-row envelope every C3
    service carries. A fourth `confirmationNote` now records exactly that, distinguishes it from
    the field-owned per-finding remark, and states that dropping the column is safe while Fire
    Intercom has no accepted data — at the cost of making Fire Intercom the only C3 service that
    deviates from the shared envelope. **Owner call; the column is retained pending that.**
  - **P1 (closed) — the standing cold command block.** Corrected, and my earlier claim was wrong:
    the V6 fixture *does* read `SEED_INTEGRATION_DATABASE_URL`, but an ordinary invocation also
    needs a reachable `DATABASE_URL` unless `NODE_ENV=test` makes the pool use the SEED URL. The
    block now starts the container first and sets `NODE_ENV=test` plus both variables before
    `test:v6-integration`, which then passes (1 test, 0 skipped) rather than skipping.
  - **P2 (both closed)** — §1 still said "3 of 12 services on the V7 evidence model" and §6a still
    claimed all 12 share the V7 evidence authority. Both corrected (10 / 12; 9 evidence workflows,
    Portable FE has no Poor-capable field by C4, FM200 and Roller Shutter unimplemented).
  - Re-verified after the changes: API typecheck/build, historical matrix 20, V6 evidence 9, Wet
    Chemical definition 2, adapters+env+compat+accepted-detail 22, V6 integration 1 (0 skipped),
    **full V7 integration set 76 / 0 skipped from cold with a hostile `DATABASE_URL`**, web
    typecheck/build, stale-evidence 1, Fire Intercom submit 18, Playwright 1.

- 2026-09-06 — **STEP 2.3 Fire Intercom added as a V7-only system, end to end** (on top of
  `f5ed7e3` and the separately-committed G10). Second system with no V1–V6 lineage, built
  by mirroring Smoke Ventilation (`ade85f6`) and trimming rather than inventing anything: one
  `station_schedule` section → one `repeatable_table` (`asset_reference` "Station" / `condition` /
  `remarks`) + one section-level comments block; no checklist sections, no header fields. Spec
  fixed by the **2026-09-04 owner decision** (collapse the paper's `Condition Yes`/`Condition No`
  × unlabelled `1`/`2` box grid into one four-state result + own remark per station row); the
  original four-box structure is deliberately **not** modelled and the reasoning is recorded in
  the definition's `confirmationNotes`, together with the preset-station-label note (a Manager
  configuration concern for STEP 3.1) and the explicit "this page has no header fields, none were
  invented" note. Changes: `masterServiceReportV7.ts` (`fireIntercom`, sortOrder 11, appended to
  `systems`, not routed through any `upgradeV7*` mapper); `v7EvidenceContracts.ts`
  (`fire_intercom` key + `fireIntercomAdapter` — the per-row `condition` result is the only
  Poor-capable field, with row-UUID `fieldPath`s); `v7StagedEvidence.ts`; migration
  `026_v7_fire_intercom_evidence.sql` (widens the two evidence CHECK constraints only — 017/018
  untouched, no data backfill, the system row is inserted by the ordinary seed) + its
  `migrations.ts` registration; `systemContractCompatibility.ts` (API + web) with
  `fire_intercom: 7` — the same deliberate "legacy version is 7" self-reference Smoke Ventilation
  introduced; new `fireIntercomV7Acceptance.ts` (carrying G10's order-independent
  `sameManifest()` from day one, never the positional comparison) and
  `fireIntercomInspectionSync.ts`; `sync.ts` / `stagedEvidence.ts` / `jobCompletion.ts` wiring;
  `acceptedMasterSystemDetail.ts` schema-2 reader + `masterSystemInspections.ts` route branch;
  `finalServiceReport.ts` (all four registration points) so the PDF embeds the accepted photo
  bytes; and a new `apps/web/src/fireIntercom/` module (form, evidence field, repository,
  resolution, server API, Accepted Detail view) plus registrations in `App.tsx`,
  `localDatabase.ts`, `TechnicianHome.tsx`, `attachmentApi/Types.ts`, `syncEngine.ts`,
  `serverMasterSystemInspectionApi.ts`. Proofs: `fireIntercomV7.integration.test.ts` (12 cases —
  the Smoke Ventilation adversarial set plus the G10 reverse-order retry case from day one),
  `acceptedMasterSystemDetail.fireIntercomV7.test.ts` (6),
  `fireIntercomV7SubmissionIssues.test.ts` (12 — the 0.4b path-drift guard proven to fail against
  a client path perturbed to `…station_schedule_rows.row.…`, and the duplicate-photo gate proven
  to fail with the gate removed), `fire-intercom-v7-offline.html/.spec.ts`. Full V7 integration
  set green from a cold disposable Postgres with a hostile `DATABASE_URL`: **76 tests, 0 skipped**
  (was 62). DO-NOT-MODIFY list clean; the ten G10 files are untouched by this task.
- 2026-09-06 — **Status-doc correction (same change as STEP 2.3).** §1, §3, §5 and §6a still
  labelled STEP 0.2 (`0e04a64`), Hydrant 1.1 (`81db211`), Hose Reel 1.2 (`efef275`), Automatic
  Sprinkler 1.3 (`7e2a7e6`) and Smoke Ventilation 2.2 (`ade85f6`) as "complete but uncommitted"
  long after each was committed, and §6a's table still showed Hydrant / Hose Reel / Automatic
  Sprinkler with **no** V7 evidence workflow while their V7 acceptance handlers, schema-2 Accepted
  Detail readers, Final Report branches and offline browser proofs were all committed and green in
  the standing V7 integration set. Every label now carries its commit hash, and the §6a count is
  corrected from "6 / 12" to **10 / 12** (9 full evidence workflows + Portable FE by C4). No code
  changed for this correction — it is a doc-accuracy fix only, found while verifying this task's
  own claims against `git log`.

- 2026-09-06 — **G10 closed: order-independent manifest comparison in the five remaining V7
  acceptance handlers** (committed on its own, ahead of STEP 2.3). `parseV7EvidenceManifest` returns the
  manifest fieldPath-sorted and acceptance persists that sorted copy into the accepted snapshot,
  but the accepted-authority pre-check in `fireAlarmV7Acceptance.ts`, `hydrantV7Acceptance.ts`,
  `hoseReelV7Acceptance.ts`, `automaticSprinklerV7Acceptance.ts` and `dryWetRiserV7Acceptance.ts`
  compared it **positionally** (`canonical(storedManifest) === canonical(payload.evidenceManifest)`)
  against the raw retry payload — which the API accepts in any order — so a valid *unsorted* retry
  returned `IDEMPOTENCY_CONFLICT` instead of duplicate success, unrecoverable once the Job closes
  (`syncEngine.ts:193` re-attempts a Failed outbox item forever). Fixed by mirroring Smoke
  Ventilation's `sameManifest()` (length check + order-independent fingerprint: each entry
  `canonical`-ised, the strings sorted and joined) into each handler and swapping the one
  comparison. **Comparison side only** — `parseV7EvidenceManifest`'s sort is the stored authority
  and is deliberately left alone (changing it would alter already-accepted snapshots).
  **Permutation equality is the only behaviour change**: a manifest with different entries, a
  different length, or duplicate entries still returns `IDEMPOTENCY_CONFLICT`. One regression case
  per handler in its existing integration test file (reverse-fieldPath manifest → accept →
  identical envelope retried is duplicate success, then again after the Job is closed; plus a
  dropped-entry retry and a changed-`sourceSha256` retry that both still return
  `IDEMPOTENCY_CONFLICT`). Each proven to fail against the old comparison: reverting the one-line
  `sameManifest` swap in all five handlers and running the five new cases makes every "unsorted
  retry must be duplicate success" assertion fail with `IDEMPOTENCY_CONFLICT` (0 pass / 5 fail);
  restoring the swap returns them to green. **CO2 / Wet Chemical (`co2FormInstanceSync.ts`) was
  checked and is NOT affected** — the same raw-vs-sorted shape does not exist there. It computes
  `requestFingerprint` over `v7Manifest(payload.evidenceManifest)` (which sorts by fieldPath) on
  the retry pre-check, and the stored `request_fingerprint` was likewise computed over the
  `parseV7EvidenceManifest`-sorted manifest at first acceptance, so an unsorted retry normalizes to
  the identical fingerprint and is duplicate success; the manifest-vs-staged check is keyed by
  `field_path` via a `Map`, not positional. The `grep` for `canonical(payload.evidenceManifest)`
  correctly did not match it. `hydrantV7.integration.test.ts` still `.sort()`s its happy-path
  manifest under a comment claiming "acceptance compares the retry manifest positionally" — now
  stale but harmless; left untouched (pre-existing test, out of this task's scope). A trivial
  follow-up can delete that `.sort()` and comment. Full V7 integration set green from a cold
  disposable Postgres: **62 tests** (was 57). Additive only — no V1–V6 template, migration, Fire
  Alarm V6 file, `parseV7EvidenceManifest`, frozen manifest, outbox or web client touched;
  DO-NOT-MODIFY list clean.

- 2026-09-06 — **STEP 2.2 Sol re-review remediation (uncommitted, on top of `ade85f6`).** Sol
  returned `SAFE TO COMMIT: N` with 2 P1s. Both investigated; one confirmed, one reclassified.
  **(1) Manifest ordering vs idempotent retry — CONFIRMED, fixed.** `parseV7EvidenceManifest`
  returns the manifest fieldPath-sorted and acceptance stores that sorted copy, but the
  accepted-authority pre-check compared it positionally against the raw retry payload, so a
  valid *unsorted* retry returned `IDEMPOTENCY_CONFLICT` instead of duplicate success — after Job
  closure that is unrecoverable for the technician. Fixed in `smokeVentilationV7Acceptance.ts`
  with an order-independent `sameManifest()` comparison, plus a regression case proven to fail
  against the old comparison before being restored. **Sol classified this as a NEW defect; it is
  not** — the identical raw-vs-sorted comparison exists in all six V7 acceptance handlers
  (`fireAlarmV7Acceptance.ts:102`, `hydrantV7Acceptance.ts:131`, hose reel, sprinkler, riser),
  and `hydrantV7.integration.test.ts` even documents the workaround in a comment ("Submit what
  the client submits") rather than fixing it. Smoke Ventilation mirrored the proven path, as the
  skill instructs. **The other five are still wrong and are NOT fixed here** (no scope widening) —
  this needs a separate cross-cutting task; it is a latent P1 for every V7 system.
  **(2) Configured Fan Schedule rows — RECLASSIFIED, but Terra's stated reasoning was WRONG and
  is corrected here (Sol re-review, 2026-09-06).** The outcome stands — no guard is added, because
  a customer with zero configured locations is intentionally supported — but the argument Terra
  gave for it in the remediation commit message is factually wrong and must not be trusted by a
  future reader. Terra claimed adding smoke_ventilation to `initialStructureRequiredSystemKeys`
  would make the system "unassignable" and that "Hydrant / Hose Reel / Riser are all deliberately
  ungated". Both are false. The truth: `initialStructureRequiredSystemKeys`
  (`managerCustomers.ts:16`) is `{co2_fire_extinguisher, wet_chemical, dry_wet_riser}` — **Dry/Wet
  Riser IS in it** — and its ONLY use is `managerCustomers.ts:286`, filtering the
  `/customers/service-format-options` list used by technician-led quick customer creation. Manager
  assignability is a different set, `locationDependentSystemKeys` (`managerCustomers.ts:12`),
  which holds only CO2 / Wet Chemical (for those the location *is* the instance key). So the guard
  would only have removed Smoke Ventilation from the technician initial-format picker; Manager
  configuration revisions (`managerCustomers.ts:360`) could still assign it either way. Terra
  conflated the two sets. The real defects Sol surfaced were (a) a doc comment in
  `masterServiceReportV7.ts` claiming "every customer … is configured with the same 10 preset
  rows", which nothing enforced — corrected to state the real behaviour and that pre-seeding ten
  rows is a Phase 8H Manager concern, not a template guarantee; and (b) **zero test coverage of
  the configured-row path** — every case used `locations: []`. Now covered on both sides: a new DB
  case seeds real configured locations and proves retained rows accept while a dropped row, a
  re-labelled `locationSnapshot.displayName`, a rewritten `assetReference` and a forged configured
  provenance are each rejected (four rejection assertions plus a persistence assertion proving
  only the clean submission was stored); three new client-gate cases prove the web refuses the
  same. Every one passed on first run, so the authentication logic itself was already correct — it
  was simply unproven.
  **P2s:** the `systemContractCompatibility.test.ts` filter no longer derives its exclusion from
  the production mapping it tests (an explicit `v7OnlySystemKeys` set plus a positive assertion
  that every other system's contract version really is ≤ 5). `originalCreatorSnapshot` being
  neither shape-validated nor fingerprinted is inherited from every other V7 handler and is left
  alone. The missing `locationText` column is deliberate — the paper Fan Schedule has no Location
  column — and Sol confirmed it does not weaken configured-row authentication. Sol also corrected
  a claim of mine: `finalServiceReport.ts` has **five** smoke_ventilation registrations, not four
  (lines 42, 147, 204, 350, 495); all five are present.

- 2026-09-05 — **STEP 2.1 FM200 investigated and STOPPED at its client-input gate; no code
  written.** The roadmap's "client says 'same structure as CO2 for now'" instruction could not be
  substantiated. `git log -S "same structure as CO2" -- HANDOVER.md` returns exactly one commit:
  `be9ad11`, the commit that first created this roadmap skeleton — not a commit recording a
  client conversation — and the line has never been touched since. There is **no dated §7 entry**
  for it, unlike every other client/owner decision in this project (C1, C2, C4, and the
  2026-09-04 "client answers" entry each have one). Two later artefacts contradict it: the fm200
  stub's own `confirmationNotes` (`masterServiceReportV1.ts:639` — "the authoritative detailed
  form is unavailable… Do not enable this system or infer fields from CO2 or Wet Chemical
  definitions") and `docs/paper-forms/fm200.md`, transcribed in `7635cb3` roughly eight hours
  *after* the roadmap line, which records that FM200 appears **only as a cover-page checkbox**
  with no data page in the blank master or in any of the four filled reports examined, and states
  outright that "it is not known whether MFE uses the CO2 page as a stand-in for FM 200".
  Per the project's standing rule against inferring unconfirmed fields (same spirit as C4), this
  is an owner/client question, not something to resolve by inference. **Unblock with either** a
  dated entry confirming the client was asked *after* the paper-form research and answered, **or**
  an explicit owner override of the stub's own prohibition. V1–V7's fm200 stub was left
  byte-identical.

- 2026-09-05 — **STEP 2.2 Smoke Ventilation complete (uncommitted), Slices 1–3.** The first
  system in this codebase with **no V1–V6 presence at all**, which is why it is not a
  "mirror the pattern" task: every STEP 1 system was *upgraded* from an existing confirmed
  definition, so `masterServiceReportV7.ts` could `.map()` over `masterServiceReportV6.systems`.
  Smoke Ventilation has nothing to map, so it is composed fresh and appended (sortOrder 10),
  carrying the four-state model natively with no `fourState`/`upgradeV7*` rewrite. That exposed
  the one genuinely new bit of architecture: `systemContractCompatibility.ts` (API **and** web)
  assumed every implemented system has a pre-V7 "legacy" contract version plus a V7 one. Smoke
  Ventilation's legacy version is **7 itself** — a deliberate self-reference giving it exactly one
  contract variant — and `systemContractCompatibility.test.ts`'s blanket "every implemented system
  exists in V5" loop was narrowed to systems whose contract version is ≤ 5, with a new positive
  assertion that smoke_ventilation must *not* exist before V7. Definition follows the blank
  master (Revision A) per `docs/paper-forms/smoke-ventilation.md`; the two unresolved paper
  ambiguities (Auto/Manual semantics; the Hokuden 3-zone / free-text-AC-DC revision) are recorded
  in the definition's own `confirmationNotes` rather than guessed silently, matching how Dry/Wet
  Riser and Hose Reel flagged theirs. "Date Tested" is a `text` control, not a new `date` control:
  the paper form is a write-in line and no per-system date control exists in the web layer, so
  none was invented. The Fan Schedule reuses the existing `repeatable_table` +
  `customer_system_locations` machinery with `supportsZones: false` (the column is already
  nullable) rather than inventing a "fixed rows, no location" mechanism. Migration `025` widens
  only the two evidence CHECK constraints — unlike every prior STEP 1.x migration there is no
  existing row to rewrite, because the ordinary seed `INSERT … ON CONFLICT DO NOTHING` inserts
  the brand-new system key itself. ~15 registration points wired (acceptance, Accepted Detail,
  Final Report + PDF evidence, staged-evidence routes and allow-lists, job completion, sync
  dispatch, web catalog/attachment/sync/local-DB unions, routing). **Proofs:** 9 adversarial
  real-Postgres cases mirroring `hydrantV7.integration.test.ts` (stale evidence never accepted,
  reused photo named rather than masked as JOB_ACCESS_DENIED per G7, two sources normalizing to
  one stored image, same bytes allowed in a different Job, concurrent race → exactly one Accepted
  + one retryable EVIDENCE_CONFLICT, closed/hidden/unknown/forbidden collapsed to one
  JOB_ACCESS_DENIED, exact retry after Job closure → same authority not JOB_CLOSED, clean
  zero-finding draft); a 12-check offline browser harness (`smoke-ventilation-v7-offline`) run
  end to end — Draft → reload → offline Submit → reconnect Sync → Accepted → Accepted Detail with
  one photo per finding across **both** evidence scopes; and 10 client submit-gate tests whose
  client/server path-drift guard was **proven to fail** against a deliberately perturbed client
  prefix before being reverted (the 0.4b failure mode). All 46 pre-existing V7 integration tests
  and every other web submit-gate suite re-run green; V1–V6, migration 017 and the Fire Alarm V6
  files untouched. **Known unrelated red, confirmed pre-existing by `git stash` against clean
  HEAD:** `co2-v7-offline.spec.ts` fails with "Complete the required suppression-system fields and
  evidence before local submission" (`co2Repository.ts:275`), and
  `seedMasterServiceReport.integration.test.ts` fails on a dry_wet_riser sortOrder mismatch during
  migration replay. Both reproduce with zero changes applied. Also spotted, not fixed (out of
  scope): `finalServiceReport.ts`'s evidence ternary omits `dry_wet_riser`, so accepted riser
  photos may not reach the Final Report PDF even though riser has a V7 branch in
  `validHistoricalUnit`.

- 2026-09-05 — **STEP 1.5 closed (uncommitted): Portable Fire Extinguisher already works on V7,
  zero code changes.** Investigated the "does it already work" hypothesis rather than assuming a
  registration task was needed: Portable's definition has been byte-identical since
  `masterServiceReportV5.ts` (V6/V7 fall through unchanged via the `: system` default case in
  `masterServiceReportV7.ts`'s `systems.map`), and both contract-version maps
  (`apps/web/src/referenceData/systemContractCompatibility.ts:10`,
  `apps/api/src/inspections/templates/systemContractCompatibility.ts:31`) compare a job's system
  definition against the frozen V5 contract structurally (canonicalized deep-equal), not by exact
  template-version match. Every call site that resolves Portable Fire Extinguisher
  (`compatibleCatalogSystem` on the web; `serviceVisits.ts`, `portableFireExtinguisherSync.ts`,
  `managerCustomers.ts` on the API) calls `isCompatibleSystemContract` without a
  `frozenMasterTemplate` filter, so there is no version gate anywhere in the chain — unlike Fire
  Alarm, which explicitly branches on template version 6/7 vs. earlier. Confirmed with two real
  tests, not by inspection alone: a new offline round-trip browser harness
  (`apps/web/tests/portable-fire-extinguisher-v7-offline.html/.spec.ts`, mirroring Dry/Wet Riser's
  STEP 1.4 harness shape but with the evidence/photo steps removed per C4 — Draft → reload →
  offline Submit → reconnect Sync → Accepted → Accepted Detail, on a V7-templated job fixture) and
  a real-Postgres integration test (`apps/api/src/sync/portableFireExtinguisherV7.integration.test.ts`,
  seeded by the real `runMigrations()`/`seedMasterServiceReport()` path — a V7 job's Portable Fire
  Extinguisher accepts through the unmodified `syncPortableFireExtinguishers`, plus an
  exact-retry-returns-duplicate check). Both pass. Existing historical coverage
  (`portableFireExtinguisherDefinition.test.ts`, `portable-fire-extinguisher-sync-race.html`)
  re-run and confirmed still green, unmodified. Zero production files touched — only 3 new test
  files added, plus this HANDOVER.md update.

- 2026-09-05 — **STEP 1.5 scope decided (owner): Portable Fire Extinguisher gets no V7 evidence.**
  Its paper form (`docs/paper-forms/portable-fire-extinguisher.md`) has no result ovals for this
  section — count fields only (Total / 9KG Dry Powder / 2KG CO2 / Others + Comments), confirmed
  against the existing V1–V5 module (`apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts`),
  which has no result control today. Owner chose "no V7 evidence at all — count fields only" over
  inventing a synthetic Overall Condition field, consistent with the project's standing rule
  against inventing fields the paper source doesn't specify (same spirit as C2's remarks
  pick-list). Logged as new cross-cutting precedent **C4** for any future service in the same
  situation. STEP 1.5 is now registration-only: carry the same fields onto the V7 template/contract,
  no evidence-contract adapter needed.

- 2026-09-05 — **STEP 1.4 Dry/Wet Riser closed, committed `a1cb7bf`.** Added
  `apps/web/tests/dry-wet-riser-v7-offline.html/.spec.ts`, mirroring Automatic Sprinkler's Slice 3
  harness: Save Draft → reload → offline Submit → reconnect Sync → Accepted → Accepted Detail,
  proving 3 distinct findings (checklist `saj_main_water_supply`, measurement `jockey_psi`, riser-
  outlet row `canvasHoseAt2Result`) each own their own remark + photo end to end. No production
  code touched — the V7 web module, evidence adapter, and Accepted Detail view already existed.
  Two independent Sol review passes: first found the harness's synthetic fixture definition used
  the wrong system-level `sortOrder` (1 vs the real 2, from `masterServiceReportV3.ts`) and a
  UUID id-prefix (`76000000-…`) that collided with `fire-alarm-v6-offline.html`; both fixed and
  re-verified, second pass returned SAFE TO COMMIT: Y with zero P0/P1. Historical Dry/Wet Riser
  V1–V6 (`dryWetRiserAccepted.test.ts`) confirmed unaffected. Also closed **G4** while updating
  this doc: the Manager-config 500-on-empty-riser-config bug was already fixed server-side in
  `ba1fb2a` (write-time `RISER_MODE_REQUIRED` guard in `managerCustomers.ts` + a read-time filter
  in `inspectionReference.ts` that excludes an invalid stored riser row instead of 500ing the
  whole customer) — it just was never marked closed here. Next: STEP 1.5 Portable Fire
  Extinguisher (last STEP 1 service). Unlike 1.1–1.4, this one is NOT a mirror-the-pattern task:
  the paper form (`docs/paper-forms/portable-fire-extinguisher.md`) has no result ovals for this
  section at all — count fields only — so "add V7 evidence" has no natural Poor-capable field to
  hang a photo/remark on. Needs an owner decision on scope before Terra writes any code.

- 2026-09-04 (G7) — **Fire Alarm V7 "Sync Failed" root-caused: one photo on two findings.**
  Browser repro on `SV-20260904-38` reproduced the owner's failure exactly and captured the
  outbox `lastError`; the runtime rows for the owner's own `8b4cc663` show the same duplicate
  `source_sha256`/`stored_sha256` pair. The 4-state model was never at fault — `d7ecc0d` and the
  stored V7 definition are consistent (`fire_alarm_detector` contract
  `3dafe01f42efd7d9ca8adfdfd288356d212406c38e82ad33c21bcd327a29e3b0`, `allowedValues` =
  4-state). Both forms already render `record.lastSyncError`; the message itself
  ("This V7 inspection is unavailable") was the problem, not its absence.
  `fireAlarmV7.integration.test.ts` did submit `not_good` + `na` + evidence, so it was green —
  its real gaps were `complete_repair`, secondary alarm-device rows (it sent `[]`), and any
  duplicate-photo case. All three now covered. API + web typecheck/build, all 4 V7 integration
  suites, historical matrix (20), V6 evidence (8) and every web unit gate re-run green.
  **Not yet done: the 4-state browser sanity pass** — the in-app browser profile's IndexedDB
  wedged (`inspection-pwa` v90, `deleteDatabase` permanently blocked) and its technician session
  is gone; agents must not enter passwords. Owner: sign in as `technician-demo` in a clean
  profile and run §4 G7's checklist. Runtime already rebuilt and recreated on the fix
  (`build-20260903T174358Z`, API booted clean).

- 2026-09-03 (owner UI fix) — Fire Alarm primary device rows lost their visible column labels in
  the multi-select change: `MultiResultSelector` exposes `label` only as `aria-label`, and Fire
  Alarm's old `Select` had rendered a visible `<label>`. Four unlabelled Normal/Test/Isolation
  clusters resulted. Fixed by wrapping each selector in `<div><strong>…</strong>` exactly as
  `Co2InspectionForm` already does (`FireAlarmInspectionForm.tsx`). CO2 / Wet Chemical were never
  affected. Verified on release `sha256-32ba5613c511dfc5` (`build-20260903T122716Z`).
- 2026-09-03 (owner verification) — Multi-select change independently re-verified. All API + web
  gates re-run green (historical matrix 20, V6 evidence 8, V6 + 4 V7 integrations, migration-019
  upgrade path, seed, manager, all web suites). V7 Fire Alarm contract SHA recomputed from source
  and confirmed to equal the hardcoded web constant `0fb524f9…`; V6 still `deec720d…`.
  **Deployed to the live runtime**: `docker compose build api proxy` + recreate — API booted clean
  (`inspection-api listening on 3000`), stored V7 control upgraded `normal_test_isolation` →
  `normal_test_isolation_multi`, V6 unchanged. Browser-confirmed on `SV-20260903-36`: Normal/Test/
  Isolation tick independently and all three can be on at once; clearing a detector blocks submit
  with "Detector row 1: select at least one Normal/Test/Isolation for Heat Detector".
  Caveat: Codex's repro block shipped a racy `pg_isready` for the fourth time — a single success
  passes against postgres:16-alpine's temporary bootstrap server, so the owner's run failed with
  "Connection terminated unexpectedly". Wait for THREE consecutive successes.
- 2026-09-03 — Migration 019 upgrades only the three persisted V7 detector-state definitions from the prior single-value control to the V7 multi-select contract before the startup seed assertion. It leaves V1–V6 untouched and is covered by a disposable database upgrade-path test seeded from commit `5bc968d`.
- 2026-09-03 — V7 detector-state controls are now multi-select only for Fire Alarm, CO2, and Wet Chemical. New V7 records store canonical non-empty arrays in Normal/Test/Isolation definition order; V1–V6 remain frozen single strings. The Fire Alarm V7 contract SHA is `0fb524f92033b523128743b6b6dfe3646880a34846b3b1c4a79498573f8c0f59`. Existing accepted V7 demo records for `SV-20260903-34` must be cleaned by the owner before a rebuilt runtime serves the new contract.
- 2026-09-03 (late) — STEP 0.3 completed in-browser end to end (see roadmap 0.3). Second client
  defect found and fixed (0.4b): the Fire Alarm V7 submit gate had lost every structural check,
  so the form queued work the server rejected non-retryably — offline that is unrecoverable field
  data loss. Both browser-found defects were client-side and invisible to the server-side
  integration suite; both now carry regression tests that were proven to fail against the old code.
- 2026-09-03 (evening) — First real browser pass on V7. Found and fixed two blockers:
  (a) a Manager-created customer carried `dry_wet_riser` with `system_configuration={}`, 500ing
  `GET /customers/:id/configuration` — stray rows deleted from the runtime; logged as G4;
  (b) **`compatibleCatalogSystem` resolved V7 CO2/Wet Chemical against the V1/V4 contract**, so
  both forms were unreachable ("Cached template version is unavailable"). Fixed + regression
  suite added (0.4a). Verified in-browser on release `sha256-e9891d4f08618b8b`
  (`build-20260903T092509Z`): Fire Alarm / CO2 / Wet Chemical V7 all open with Good/Poor/Not
  Relevant, Poor reveals its own remark + photo controls, Normal/Test/Isolation unchanged; and
  historical CO2 (V1) + Wet Chemical (V4) still render 2-state with zero "Not Relevant".
  Note: a duplicate hand-made "DEMO-V7-SHARED-EVIDENCE" customer (`81955194-…`) exists alongside
  the seeded `…0900`; the real job `SV-20260903-34` belongs to the seeded one.
- 2026-09-03 (pm) — STEP 0.1 committed (`5bc968d`, branch `phase-8f2b2a-final-accepted`); docs
  commit `be9ad11`. STEP 0.2 (V7 front door) reviewed + re-verified: `managerCustomers.integration.test.ts`
  re-run green after fixing Codex's repro block (`createdb`/`pg_isready` must use `-h 127.0.0.1`,
  not the racy unix socket). 0.2 accepted, still uncommitted (6 files). Reordered roadmap: STEP 0.4
  seed now precedes STEP 0.3 browser sanity (Manager quick-create cannot enable CO2 / Wet Chemical).
  STEP 0.4: Terra seeded `demoV7Customer` (customer + V7 revision + 3 systems + CO2/WC zones/locations,
  no job). Owner added the PRIMARY site inside the same guard (Terra's brief had omitted it) and
  re-ran seed + manager integration + typecheck green — twice Codex handed back a repro block still
  using the racy `createdb`/`pg_isready` unix socket; the two DB tests only failed on that, not on code.
- 2026-09-03 — Phase 8F.2B.2A server-side complete + 4 Sol passes + hermetic test-DB config.
  Runtime rebuilt (build `20260903T051655Z`); migration 018 + V7 seed confirmed live. Found G1
  (no V7 UI front door). Handover doc + full roadmap created. Owner confirmed target: all 12
  services on the V7 evidence model. Added `.agents/skills/codex-task-brief` (reusable task
  scaffold). STEP 0.1 commit commands + STEP 0.2 (V7 front door) brief prepared.
  G1 change is contained to `managerCustomers.ts` (catalog version pin) + `inspectionReference.ts`
  (lines 91-99 length/version guard, 146 control resolver, 181 `version IN (1..6)`).
