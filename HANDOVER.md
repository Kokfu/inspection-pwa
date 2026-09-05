# Project Handover & Live Status

> Single source of truth for current state. Update the "Last updated" line and the
> relevant section on every change. Keep it short — link to code, don't duplicate it.

**Last updated:** 2026-09-05 — STEP 1.5 Portable Fire Extinguisher closed (uncommitted): hypothesis
confirmed — a V7-templated job's Portable Fire Extinguisher system already resolved, opened,
saved a Draft, submitted, and synced correctly with **zero code changes**, purely via the
structural (non-version-gated) match in `isCompatibleSystemContract`. Proved with a real browser
round trip and a real-Postgres integration test; no production file touched. Dry/Wet Riser STEP
1.4 offline-round-trip browser proof committed (`a1cb7bf`), two independent Sol review passes both
SAFE TO COMMIT: Y; G4 closed (was already fixed in `ba1fb2a`, just never marked done here).
Hydrant STEP 1.1 + Hose Reel STEP 1.2 Slices 1–3 complete (uncommitted); Automatic Sprinkler STEP
1.3 Slice 3 complete (uncommitted)
**Repo:** `C:\PWA_OfflineRecordWebApp`  ·  **Branch:** `phase-8e-client-demo-polish`  ·  **HEAD:** `a1cb7bf`
**Local runtime:** https://localhost/  ·  **Demo accounts:** Manager `mobiletest` / Technician `technician-demo` (passwords held by owner, never committed — created manually via `create-admin`, not seeded)

---

## 1. One-line status

**3 of 12 services on the V7 evidence model** (Fire Alarm, CO2, Wet Chemical), all committed and
browser-proven through the full offline→sync→Accepted→PDF workflow. Result model is now
**4-state** (Hokuden legend: `good` / `not_good` / `complete_repair` / `na`); validators are
per-field `allowedValues`-driven so a 2-state page can declare its own set. Detector
Normal/Test/Isolation is multi-select. Shared repeatable-row model (C3) extracted, unconsumed.

**Hydrant STEP 1.1:** Slices 1–3 are complete but uncommitted. Its seven deployed row result
columns—including both Canvas Hose results—now use the four-state V7 definition with row+column
evidence paths, additive migration 021, field-owned accepted photos, and Final Report/PDF output.
The isolated browser proof covers IndexedDB reload, offline queueing, reconnect sync, and Accepted Detail.

**Automatic Sprinkler STEP 1.3:** Slices 1–2 (server + web) committed (`ba1fb2a`, `eea9c5d`).
Slice 3 (read paths + browser proof) is complete but uncommitted. **Owner decision:** V7
Automatic Sprinkler **drops** the legacy Cut-In/Cut-Out PSI photo lifecycle — V7 carries V7
finding evidence only; the legacy PSI lifecycle stays exactly as-is for V1–V6. The V7 input
form no longer shows the legacy `PhotoEvidenceField` (gated on `!isV7`, proven by
`automaticSprinklerV7PsiControl.test.tsx`). Slice 3 adds `validateAcceptedAutomaticSprinklerV7Detail`
(separate schema-2 reader), the `automatic_sprinkler` + schema-2 branches in
`masterSystemInspections.ts` / `finalServiceReport.ts` (`validHistoricalUnit`,
`validatedV7SuppressionEvidence`, evidence dispatch), a schema-2 branch + V7 accepted-evidence
fetch in the web `ServerAutomaticSprinklerView` / `serverAutomaticSprinklerApi`, and a full
offline-round-trip browser proof (`automatic-sprinkler-v7-offline.html/.spec.ts`) that exercises
Save Draft → reload → offline Submit → reconnect Sync → Accepted → Accepted Detail with the
accepted photo actually loading. `stagedEvidence.ts` `/v7-evidence/accepted[/…/content]` now
serve all six V7 systems (owner fix — Hydrant/Hose Reel accepted photos returned empty before).

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

**Deployed:** runtime rebuilt + recreated 2026-09-04 on the uncommitted G7 fix
(`build-20260903T174358Z`); migration 020 applied, API booted clean, stored V7 defs are 4-state.
`SV-20260903-36` is already `technician_visible=false`. **Still owed: the 4-state browser sanity
pass** (checklist in §4) — it is the only thing between here and "3/12 fully proven".

**Next:** STEP 1 (Hydrant / Hose Reel / Sprinkler / Riser / Portable → V7) or STEP 2 new services
(Roller Shutter, Smoke Vent, Fire Intercom, FM200). All STEP 1/2 services now inherit 4-state +
C3. Gated on client answers for C2 (remarks pick-list) and Fire Intercom's Yes/No `1`/`2` columns.

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

**STEP 0.2 — uncommitted (6 modified files), re-verified 2026-09-03:**

- `INSPECTION_CUSTOMER_CATALOG_VERSION` config key (`env.ts`, default 7); `managerCustomers.ts`
  consumes it for every customer/config-revision/service-visit insert; `inspectionReference.ts`
  lists + resolves v7 (Fire Alarm v7 → `resolveFireAlarmV6Controls(def, 7)`).
- New coverage: `env.test.ts` (unset→7, `"6"`→6); `managerCustomers.integration.test.ts`
  (catalog `[1..7]`, v7 Fire Alarm `templateVersion:7`, new customer + visit freeze v7).
- All standard gates + both new tests green on owner re-run. DO-NOT-MODIFY list clean.

---

## 4. Known gaps / blockers

| # | Gap | Impact | Where |
|---|-----|--------|-------|
| ~~G2~~ | **CLOSED 2026-09-03.** Full browser workflow proven for Fire Alarm + CO2 + Wet Chemical V7 on `SV-20260903-34`: 3-state, Poor+own remark+own photo, Save Draft → reload → offline Submit → reconnect → Sync → Accepted → Accepted Detail → photo → Complete Service → Final Report → PDF with 3 embedded images. Stale Poor→Good evidence correctly excluded. Historical CO2 V1 / Wet Chemical V4 unchanged (2-state). | — | — |
| ~~G3~~ | **CLOSED.** All V7 work through C1-REWORK committed (`d7ecc0d`). | — | — |
| ~~G4~~ | **CLOSED** (fixed in `ba1fb2a`, confirmed 2026-09-05 — never marked done here until now). `managerCustomers.ts`'s `assertDryWetRiserAssignments` rejects an unconfigured/invalid `dry_wet_riser` assignment at write time (`RISER_MODE_REQUIRED`, no valid `riserMode`); `inspectionReference.ts`'s `usableEnabledSystems` filter additionally excludes any stored riser row that fails `parseDryWetRiserSystemConfiguration` from `GET /customers/:id/configuration`, so a bad row degrades that one system instead of 500ing the whole customer. | — | — |
| G5 | Manager "Create Service Visit" silently reset the form without creating anything and no error (hit during 0.3 browser sanity, 2026-09-03). | Primary action fails silently. | `apps/web` new-service-visit flow |
| ~~G6~~ | **PARTLY CLOSED 2026-09-04.** `d7ecc0d` deployed; 4-state options render in all 3 forms. Bug found + fixed (`3065539`): CO2/Wet Chemical `V7EvidenceField` was gated on `result === "poor"` (unreachable) so no photo could be attached on a finding — now `not_good \|\| complete_repair`. Deployed `sha256-188fbb1857f422d5`. |
| ~~G7~~ | **ROOT-CAUSED + FIXED 2026-09-04, awaiting browser re-verification.** Not a 4-state defect at all: the technician **attached the same photo to two findings**. Reproduced in-browser on `SV-20260904-38` (instance `10433777`), outbox `lastError` captured = `"This V7 inspection is unavailable"` (`JOB_ACCESS_DENIED`). Both staged rows carried identical `source_sha256` **and** `stored_sha256`, so `parseV7EvidenceManifest` refused the manifest, and `fireAlarmV7Acceptance.ts` folded `!manifest` into the collapsed job-access guard — reporting a payload problem as a Job problem. Confirmed the same duplicate pair in the owner's original `8b4cc663` rows. Fixes: (a) capture-time guard in `saveFireAlarmV7Photo` / `saveV7SuppressionPhoto` refuses a photo already attached to another field, naming it; (b) submit gate `duplicateV7PhotoIssues` in both `fireAlarmV7Evidence.ts` and `co2/v7Evidence.ts` — the offline-safety layer, same precedent as 0.4b; (c) server splits the manifest failure out of the collapsed guard (after it, so no job-existence leak) and names the reused image; CO2/WC get the same treatment plus a separate `EVIDENCE_NOT_STAGED` for two sources that normalize to the same stored bytes. Coverage: new `fireAlarmV7.integration.test.ts` case (first ever to submit `complete_repair`, a secondary alarm-device row finding with row-scoped evidence, and a reused photo); 3 new web submit-gate tests, the duplicate one **proven to fail against the pre-fix code**. | — | — |
| G9 | **Duplicate photo across two *instances* of one system in the same Job** (CO2/Wet Chemical multi-location) is still only caught at acceptance, by the `acceptedHashes` pre-check (backed by the `staged_inspection_evidence_v7_accepted_*_per_job_system` indexes) → `EVIDENCE_CONFLICT`. The message is truthful, but the outbox re-attempts `Failed` items on every sync (`syncEngine.ts:193`), so it can never succeed. The G7 client guards are scoped to one `inspectionClientUuid`; attachments carry no `jobId`, so widening needs a join through `masterSystemFormInstances`. | A technician reusing one photo across two CO2 locations retries forever. | `apps/web/src/co2/v7Evidence.ts`, `apps/api/src/sync/co2FormInstanceSync.ts` |
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
- [ ] 1.1 **Hydrant** — Slices 1–3 complete (uncommitted): 7-column row-scoped V7 evidence,
      web wiring, Accepted Detail/Final Report/PDF, and integration/browser proof.
- [ ] 1.2 **Hose Reel** — Slices 1–3 complete (uncommitted): V7 combined checklist +
      repeatable-drum evidence adapter, forward-only migration 022, and atomic single-instance
      acceptance; V7-only 4-state web wiring, per-finding photos/remarks, evidence-first outbox,
      and the V7 catalog front-door resolver. Slice 3 adds a separate schema-2 Accepted Detail reader,
      accepted evidence rendering, Final Report/PDF embedding, adversarial eight-case integration coverage,
      and browser reload/sync/detail proof. The paper form supports only Duty / Standby in the new 30-minute test block;
      it explicitly omits Jockey, so no Jockey row was invented.
- [ ] 1.3 **Automatic Sprinkler** — Slices 1–3 complete (Slice 3 uncommitted): Water Tank /
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
- [x] 1.5 **Portable Fire Extinguisher — DONE, uncommitted.** No V7 evidence at all (owner
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
- [ ] 2.1 **FM200** — client says "same structure as CO2 for now": clone the CO2 V7 adapter with
      FM200 labels; flip `requires_confirmation` → `confirmed`. (~2 d)
- [ ] 2.2 **Smoke Ventilation** — new definition from paper master (Control Panel No./Location,
      per-zone Auto/Manual rows, Main Power AC, Secondary DC, Charger & Batteries, Main Function
      Key, Signal Alarm to MFAP) + V7 adapter. (~2–3 d)
- [ ] 2.3 **Fire Intercom** — new definition; paper form is a Yes/No matrix per handset location —
      confirm the exact control model with the client. + V7 adapter. (~2–3 d)
- [ ] 2.4 **Fire Rated Roller Shutter** — NOT in the paper master; only in real Hokuden reports
      (No. / Location / Auto Alarm Mode / Manual Mode, 45+ rows). **Needs a client-confirmed spec
      first.** + definition + V7 adapter. (~1 w incl. client input)

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
| Hydrant | ✅ confirmed | ❌ | STEP 1.1 — first C3 consumer |
| Hose Reel | ✅ confirmed | ❌ | STEP 1.2 (+ 30-min pump test) |
| Automatic Sprinkler | ✅ confirmed | ⚠️ slices 1–3 done, Slice 3 uncommitted | STEP 1.3 — V7 drops legacy PSI lifecycle (owner decision); commit + Sol pass |
| Dry / Wet Riser | ✅ confirmed | ✅ **done** (4-state, browser-proven, committed `a1cb7bf`) | — |
| Portable Fire Extinguisher | ✅ confirmed | ✅ **n/a by design (C4)** — confirmed working on V7 with zero code changes, browser + integration proven | — |
| FM200 | ⚠️ requires_confirmation | ❌ | STEP 2.1 — clone CO2 V7 adapter |
| Smoke Ventilation | ❌ none | ❌ | STEP 2.2 — `docs/paper-forms/smoke-ventilation.md` |
| Fire Intercom | ❌ none | ❌ | STEP 2.3 — needs client answer on Yes/No `1`/`2` columns |
| Fire Rated Roller Shutter | ❌ none | ❌ | STEP 2.4 — `docs/paper-forms/fire-rated-roller-shutter.md`; 2 failed one-shot attempts, split into 3 slices |

Done: **5 / 12 on V7** (4 with a full V7 evidence workflow, 1 — Portable Fire Extinguisher —
registration-only by design, C4, no evidence workflow).  Base template ready: 8 / 12.  New
services (no template): Smoke Vent, Fire Intercom, Roller Shutter + FM200 stub.
All 12 now share: 4-state result model, per-field `allowedValues`, C3 repeatable-row model, shared V7 evidence authority.

## 7. Change log

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
