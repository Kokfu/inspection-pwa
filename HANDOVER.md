# Project Handover & Live Status

> Single source of truth for current state. Update the "Last updated" line and the
> relevant section on every change. Keep it short — link to code, don't duplicate it.

**Last updated:** 2026-09-03 13:40 MPST
**Repo:** `C:\PWA_OfflineRecordWebApp`  ·  **Branch:** `phase-8e-client-demo-polish`  ·  **HEAD:** `e30c649`
**Local runtime:** https://localhost/  ·  **Demo accounts:** Manager `mobiletest` / Technician `technician-demo`

---

## 1. One-line status

Phase 8F.2B.2A (V7 shared-evidence foundation + Fire Alarm / CO2 / Wet Chemical V7) is
**code-complete and verified server-side (4 independent review passes, SAFE TO COMMIT)** but
**still uncommitted**, and V7 has **no UI front door** yet — no customer can be placed on V7, so
a technician cannot start a V7 inspection in the app.

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
# wait for pg_isready, then:
cd apps/api
$env:NODE_ENV='test'; $env:DATABASE_URL='postgres://bogus:bogus@10.255.255.1:9999/nope'
$env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/inspection'
node --import tsx --test --test-concurrency=1 src/sync/co2V7.integration.test.ts src/sync/wetChemicalV7.integration.test.ts src/sync/fireAlarmV7.integration.test.ts src/sync/v7EvidenceRace.integration.test.ts
cd ../.. ; docker rm -f phase8f-v7-verify
Remove-Item Env:DATABASE_URL,Env:NODE_ENV,Env:SEED_INTEGRATION_DATABASE_URL -ErrorAction SilentlyContinue

# Fast gates
cd apps/api ; npm run typecheck ; npm run build ; npm run test:historical-matrix ; npm run test:v6-evidence
cd apps/web ; npm run typecheck ; npm run build
```

Rules: never `docker compose down -v` / `volume rm` / `system prune`. Never point tests at the
runtime Postgres. Git is done manually by the owner (agents never stage/commit/push).

---

## 3. What is DONE and verified (uncommitted, 39 modified + 25 new files)

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

---

## 4. Known gaps / blockers

| # | Gap | Impact | Where |
|---|-----|--------|-------|
| G1 | **No UI front door to V7.** `customerCatalogVersion = 6` hardcoded; catalog API filters `version IN (1..6)`. | No customer/visit can be on V7 → technician cannot start a V7 inspection → **browser demo of the new Good/Poor/Not Relevant + evidence flow is impossible today**. | `apps/api/src/routes/managerCustomers.ts:9`, `apps/api/src/routes/inspectionReference.ts:181` |
| G2 | Manual browser sanity (offline → reload → sync → Accepted → PDF) not yet done for V7. | Blocked by G1. | — |
| G3 | Phase work uncommitted (39M + 25 new). | No checkpoint; 8+ remediation rounds of unbacked work. | working tree |

---

## 5. Roadmap

**Goal (owner-confirmed):** every service gets the V7 evidence model (Good / Poor / Not Relevant
+ per-Poor own remark + own photo) on a fixed base template, with future per-customer *minor*
modification done by the Manager via `customer_enabled_systems.system_configuration` (jsonb hook
already exists; editing UI is Phase 8H). Customers subscribe to many services; technician or
manager picks them (`customer_enabled_systems` rows).

### STEP 0 — Workflow demo: Fire Alarm + CO2 + Wet Chemical  ← DO FIRST  (~2–3 working days)
- [ ] 0.1 Commit the finished V7 work + create `phase-8f2b2a-final-accepted`. (ready now — owner review, then `git commit`)
- [ ] 0.2 **G1 — V7 front door:** `customerCatalogVersion` config-driven (default 7);
      `inspectionReference.ts` catalog includes v7; Manager customer setup can choose v7.
      Re-verify gates + short Sol spot-check.
- [ ] 0.3 **G2 — browser sanity** for each of Fire Alarm / CO2 / Wet Chemical V7: Good/Poor/Not
      Relevant; Poor w/ own remark+photo; Save Draft → refresh → offline Submit → reconnect →
      Sync → Accepted → Accepted Detail → photo → Final Report → PDF. Plus Poor→Good stale case.
      Plus a V6 Fire Alarm job still works (additive check).
- [ ] 0.4 Seed one clean demo customer on v7 with the 3 systems + a site.
- [ ] 0.5 Commit checkpoint. **→ Demo-ready.**

### CROSS-CUTTING — decide before building more services
- [ ] C1 **Result model:** Hokuden's real reports use 4 states (Good / Not Good / Complete Repair
      / N.A.). Decide 3-state vs 4-state now — it changes every adapter. (Phase 8F.2C)
- [ ] C2 **Remarks pick-list:** client to supply the hardcoded choice list. Do not invent one.
- [ ] C3 **Repeated-equipment / reusable structural config** pattern (Phase 8F.3) — Hydrant, Hose
      Reel, Sprinkler, Roller Shutter all have long "No. / Location / per-column result" tables.
      Design the shared row model once.

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

- 2026-09-03 — Phase 8F.2B.2A server-side complete + 4 Sol passes + hermetic test-DB config.
  Runtime rebuilt (build `20260903T051655Z`); migration 018 + V7 seed confirmed live. Found G1
  (no V7 UI front door). Handover doc + full roadmap created. Owner confirmed target: all 12
  services on the V7 evidence model. Added `.agents/skills/codex-task-brief` (reusable task
  scaffold). STEP 0.1 commit commands + STEP 0.2 (V7 front door) brief prepared.
  G1 change is contained to `managerCustomers.ts` (catalog version pin) + `inspectionReference.ts`
  (lines 91-99 length/version guard, 146 control resolver, 181 `version IN (1..6)`).
