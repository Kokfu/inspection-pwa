# Project Handover & Live Status

> Single source of truth for current state. Update the "Last updated" line and the
> relevant section on every change. Keep it short — link to code, don't duplicate it.

**Last updated:** 2026-09-04 — C1-REWORK V7 four-state result model working tree
**Repo:** `C:\PWA_OfflineRecordWebApp`  ·  **Branch:** `phase-8e-client-demo-polish`  ·  **HEAD:** `5bc968d`
**Local runtime:** https://localhost/  ·  **Demo accounts:** Manager `mobiletest` / Technician `technician-demo` (passwords held by owner, never committed — created manually via `create-admin`, not seeded)

---

## 1. One-line status

Phase 8F.2B.2A (V7 shared-evidence foundation + Fire Alarm / CO2 / Wet Chemical V7) is
**committed** (`5bc968d`, safety branch `phase-8f2b2a-final-accepted`). STEP 0.2 (V7 front door)
is **code-complete and re-verified** (all standard gates + `managerCustomers.integration.test.ts`
green on owner re-run) and **uncommitted** (6 modified files). The catalog front door defaults new
customer configurations and explicit Manager configuration revisions to V7; existing V1–V6
revisions remain frozen. Next: STEP 0.4 (seed a v7 demo customer) then STEP 0.3 (browser sanity).

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
| G3 | STEP 0.2 (6 files) + 0.4 (seed) + 0.4a (web catalog fix) uncommitted. | No checkpoint. | working tree |
| G4 | Manager config flow accepts `dry_wet_riser` with `system_configuration = {}` (no `riserMode`), which 500s `GET /customers/:id/configuration` for that whole customer. | Any customer given a riser through the Manager UI becomes unusable for **all** its systems. Same class as the CO2/Wet Chemical location-authority guard. | `apps/api/src/routes/managerCustomers.ts`, throw at `apps/api/src/routes/inspectionReference.ts:389` |

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
- [x] **C1 DECIDED 2026-09-03 — 4-state everywhere.** Owner chose the Hokuden cover legend as the
      house standard: `good` (√ Good/Baik) · `not_good` (X Not Good/Tidak Memuaskan) ·
      `complete_repair` (◯ Complete Repair/Siap Baik Pulih) · `na` (/ No Need Checking/N.A.).
      Note: the MFE **system pages** are only 2-state (`( / )` Good / `( X )` Poor); the 4th and
      3rd states come from the Hokuden cover sheet, which conflicts with the page footers on
      `( / )`. Recommend the client confirm "Complete Repair / N.A." is the standard for *all*
      customers before the rework starts. This supersedes the shipped 3-state
      (Good / Poor / Not Relevant) — CO2 / Fire Alarm / Wet Chemical V7 must be reworked.
      → new cross-cutting task **C1-REWORK** below.
- [x] **C1-REWORK (Phase 8F.2C):** V7 result model 3-state → 4-state. `masterServiceReportV7.ts`
      `upgradeV7EvidenceSystem` emits the 4 values; every V7 validator
      (`fireAlarmV7Acceptance.ts`, `co2FormInstanceSync.ts`, …) honors **per-field
      `allowedValues`** instead of hardcoding the set (so a 2-state page like Roller Shutter can
      declare `["good","not_good"]`); accepted detail + PDF render 4 states; migration rewrites
      stored V7 definitions (FK-safe: `INSERT … ON CONFLICT DO UPDATE`, restart-proof — see the
      reverted 020 FK failure); V7 Fire Alarm contract SHA recomputed + web constant updated;
      the 3 accepted V7 demo records on `SV-20260903-36` must be owner-cleaned/re-seeded. The
      FK-safe 020 upsert and disposable T1-definition restart proof are green; V1–V6 untouched.
- [ ] C2 **Remarks pick-list:** client to supply the hardcoded choice list. Do not invent one.
- [ ] C3 **Repeatable row model** — skill written (`.agents/skills/repeatable-row-model/SKILL.md`,
      committed `7635cb3`). Extraction task **T1** in flight (web helpers + 4-invariant tests,
      result-model agnostic). Roller Shutter is its first consumer (after C1-REWORK).

### STEP 1 — Upgrade existing base templates to V7 evidence  (est. ~4–5 weeks total)
Each: add a V7 evidence-contract adapter (mirror `co2Adapter`), wire the web form to the V7
field, add integration coverage, re-verify, Sol pass.
- [ ] 1.1 **Hydrant** — hydrant-set table (Canvas hose@2 / Diffuser Nozzle / Landing Valve /
      Landing V.Handle / Hose Cabinet / Key Lock), per-column Good/Poor/NR + per-Poor photo. (~1–2 d)
- [ ] 1.2 **Hose Reel** — Water Tank + Pump House + Hose Reel Drum table (Drum/Hose/Nozzle/Valve/
      Box). **Add "TEST RUN FIRE PUMP 30 MINUTES"** sub-section (Jockey/Duty/Standby). (~2–3 d)
- [ ] 1.3 **Automatic Sprinkler** — Water Tank / Pump House / Main Alarm Valve / 30-min pump test.
      **Must preserve the legacy PSI photo lifecycle** (Cut-In/Cut-Out PSI + its evidence) side by
      side with new V7 Poor evidence. (~3–4 d)
- [ ] 1.4 **Dry / Wet Riser** — Dry/Wet toggle, Riser Outlet table. **Resolve the
      measurement-definition vs deployed-response discrepancy** inside its own V7 contract. (~3–4 d)
- [ ] 1.5 **Portable Fire Extinguisher** — summary counts + expiry; decide how little V7 it needs
      (likely an overall condition + the count fields, no per-unit checklist). (~1–2 d)

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
| Fire Alarm / Detector | ✅ confirmed | ✅ done | reachable after STEP 0.2 |
| CO2 Fire Extinguisher | ✅ confirmed | ✅ done | reachable after STEP 0.2 |
| Wet Chemical | ✅ confirmed | ✅ done | reachable after STEP 0.2 |
| Hydrant | ✅ confirmed | ❌ | STEP 1.1 |
| Hose Reel | ✅ confirmed | ❌ | STEP 1.2 (+ 30-min pump test) |
| Automatic Sprinkler | ✅ confirmed | ❌ | STEP 1.3 (preserve PSI photo lifecycle) |
| Dry / Wet Riser | ✅ confirmed | ❌ | STEP 1.4 (resolve measurement/response) |
| Portable Fire Extinguisher | ✅ confirmed | ❌ | STEP 1.5 |
| FM200 | ⚠️ requires_confirmation | ❌ | STEP 2.1 |
| Smoke Ventilation | ❌ none | ❌ | STEP 2.2 |
| Fire Intercom | ❌ none | ❌ | STEP 2.3 |
| Fire Rated Roller Shutter | ❌ none | ❌ | STEP 2.4 (needs client spec) |

Done: 3 / 12 on V7.  Base template ready: 8 / 12.  Not started: 3 (Smoke Vent, Fire Intercom, Roller Shutter) + FM200 stub.

## 7. Change log

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
