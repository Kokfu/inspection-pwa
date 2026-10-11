# CR-07 Phase 1 — Technician section remarks (Automatic Sprinkler pilot)

Date: 2026-10-10 · Branch `phase-8e-client-demo-polish` · Level 2 (new synced, shared, stored data) · No git mutation, no Docker Compose.

**Result:** built and green on every test this task owns, and on the web + API typecheck at the last re-check (22:05).
Earlier in the session the API typecheck/build was red because of an untracked file from another in-progress task
(see "Gate status"); it cleared later without any change from this task.
**P0 open: 0 · P1 open: 0 · P2: 4 (below).**

## What a technician now gets

In the Automatic Sprinkler form, every Remark picker (18 checklist rows, 5 measurement rows) and the Comments box has a full-width
**Add new remark** button. It opens a small editor: a labelled text box with a 300-character counter, the line
"Adds to *<section name>* for this customer. This cannot be undone here.", **Save & use** and **Cancel**.
Saving writes to the phone first (works offline), appends the text to that field, and offers it in **that section's** list only
(grouped as "Added for this customer"). It syncs later and every technician of the same customer sees it after their next refresh.
Add-only: no edit/delete.

## Design decisions

1. **Scope key = (customerId, systemKey, sectionKey).** `sectionKey` is a template slot, never a row UUID:
   `checklist.<section>.<rowKey>` and `measurements.<rowKey>` (the label-override canonical paths) plus the fixed `comments`.
   Allowlist lives in `apps/web/src/inspectionControls/remarkSections.ts` and a **byte-identical** copy
   `apps/api/src/inspections/remarkSections.ts`. A test proves the allowlist equals the paths derived from the real resolved
   V1 and V7 Sprinkler controls, so a template change cannot leave a row without a section.
   The per-field Poor remark in this form *is* the row's Remark picker, so no extra `.fieldRemark` key was needed (not added).
2. **Nothing enters the inspection payload.** The remark text is appended to the existing field string
   (`appendCommonRemark`). No id in drafts, responses, templates, evidence contracts, reports or PDFs.
3. **Idempotency.** Client id = `crypto.randomUUID()`. Same id + same content → `200 {duplicate:true}`; same id + different
   content/scope → `409 IDEMPOTENCY_CONFLICT`; different id + same text in the same scope → `200 {merged:true}` returning the
   canonical row (never 409). Every success echoes `requestedId`; the browser marks an item Completed **only** when that exact
   uuid is echoed and the canonical row is valid and in the same scope (HTTP 200 alone never completes anything).
   After a merged reply the cache swaps the local id for the canonical one in the same transaction as Completed.
4. **Concurrency.** One `pg_advisory_xact_lock` per (customer, system, section) serialises replay check, merge, the 50-row cap
   and the insert; a partial unique index is the backstop. Verified with 8 parallel posts → 1 row.
5. **Text rules (web = API, byte-identical module + parity test).** Reject control chars (incl. newline/tab), U+200B–200F,
   U+202A–202E, U+2066–2069 (plus U+2060–2064, U+FEFF, unpaired surrogates). Then NFC, collapse whitespace, trim; 3..300 **code points**.
   Rejection happens *before* whitespace collapse so a newline can never silently become a space.
6. **Auth.** Any signed-in role; `requireExpectedActor` (identity mismatch → 409). An inspector must own a non-sample job for the
   customer that contains the system (same predicate as `locationProposals.ts`); admin/supervisor allowed. Demo/inactive customers
   are out of scope for everyone. Every "not allowed" answer is one identical 404 body.
7. **Device store.** Cache in the existing `referenceData` store (`service-section-remarks:<customerId>`) + `syncOutbox` item
   (`entityType "sectionRemark"`, `entityId` = remark uuid), written in **one Dexie transaction** (rollback proven). **No Dexie
   `version()`/`stores()` change** — `localDatabase.ts` differs from HEAD by one type-union word. Refresh merges server rows with this
   device's pending items (de-duplicated by text) and **fails closed**: a malformed/foreign/duplicate-id reply or HTTP error keeps
   the previous cache untouched.
8. **Sync outcomes.** Timeout (30 s abort), dropped connection, 5xx, 408, 429 → the same outbox item goes back to **Pending**
   ("will be sent again") — unknown result, never Failed, never a second item. 4xx validation/scope → **Failed** with the server's
   reason. 401/403 → Failed via the existing refusal wording. `"sectionRemark"` is on the generic loop's exclusion list.
9. **Other systems unchanged.** `RemarksField` uses the new behaviour only when both `customerId` and `sectionKey` are set; only the
   Sprinkler form sets them (a test scans every other form). The global common-remarks screen and `/service-common-remarks` are untouched.

### Interpretation to confirm (owner)
The brief says the old "Others → Add to common remarks" is **replaced**. I removed the **Add to common remarks** button in the Sprinkler
form (a technician can no longer add a system-wide remark there) but **kept the "Others" option** for one-off typed text that is not
stored anywhere. If you want Others gone too, it is a one-line change. Other systems still show both, unchanged.

## Migration `apps/api/migrations/049_service_section_remarks.sql` (additive; new table only; no seed; no backfill)

```sql
CREATE TABLE IF NOT EXISTS service_section_remarks (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  system_key text NOT NULL CHECK (length(system_key) BETWEEN 1 AND 80),
  section_key text NOT NULL CHECK (length(section_key) BETWEEN 1 AND 160),
  wording text NOT NULL CHECK (length(wording) BETWEEN 3 AND 300 AND wording = btrim(wording)),
  created_by_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  job_id uuid,                                   -- audit only, no FK (as 048)
  create_fingerprint text NOT NULL CHECK (length(create_fingerprint) = 64),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_section_remarks_active_wording
  ON service_section_remarks (customer_id, system_key, section_key, lower(wording)) WHERE active;
CREATE INDEX IF NOT EXISTS service_section_remarks_customer
  ON service_section_remarks (customer_id, created_at, id) WHERE active;
```
Registered in `apps/api/src/db/migrations.ts` with `to_regclass('public.service_section_remarks')` as the replay marker.
Proven: cold install, re-run twice keeps data, drop-the-table-then-run (a database at 048) recreates it empty.
`service_common_remarks` and every other table are unchanged (column list asserted).

## API

* `GET  /api/customers/:customerId/section-remarks` → `{remarks:[{id,customerId,systemKey,sectionKey,wording}]}` (active rows of that customer only; same scope rule as POST; `Cache-Control: private, no-store`).
* `POST /api/technician/customers/:customerId/systems/:systemKey/section-remarks` body `{id, sectionKey, wording, jobId?}` →
  `{requestedId, duplicate, merged, remark}`. Unknown keys / systemKey / sectionKey / malformed uuid → 400 `INVALID_SECTION_REMARK`.
  Cap 50 active per (customer, system, section) → 409 `SECTION_REMARK_LIMIT_REACHED` (replays and merges still succeed at the cap).
* Audit: one `service_section_remark_created` row per stored remark (none for replays/merges); identity mismatch leaves a failure row.

## Files changed

**API**
* `apps/api/migrations/049_service_section_remarks.sql` — new table (above).
* `apps/api/src/db/migrations.ts` — +10 lines: register 049 with its replay marker.
* `apps/api/src/inspections/remarkSections.ts` — section-key allowlist (server authority).
* `apps/api/src/inspections/sectionRemarkText.ts` — normalise/validate rules (server authority).
* `apps/api/src/routes/sectionRemarks.ts` — the two routes.
* `apps/api/src/server.ts` — +2 lines: import and mount.
* `apps/api/package.json` — +1 line: `test:section-remarks-integration`.
* `apps/api/src/routes/sectionRemarks.integration.test.ts` — 12 route/migration scenarios on the disposable DB.
* `apps/api/src/routes/sectionRemarksWebContract.integration.test.ts` — the web's strict parsers accept the real API replies.

**Web**
* `apps/web/src/inspectionControls/remarkSections.ts` — byte-identical allowlist copy + key helpers.
* `apps/web/src/inspectionControls/sectionRemarkText.ts` — byte-identical text-rule copy.
* `apps/web/src/inspectionControls/sectionRemarks.ts` — cache + outbox store, merge, canonical swap, strict parsers, exact-id confirmation.
* `apps/web/src/inspectionControls/RemarksField.tsx` — optional `customerId`/`sectionKey`/`sectionLabel`/`jobId`; Add new remark editor; section choices.
* `apps/web/src/automaticSprinkler/AutomaticSprinklerInspectionForm.tsx` — passes customer (frozen job snapshot) + section key at the 3 remark sites.
* `apps/web/src/sync/syncEngine.ts` — `syncPendingSectionRemarks`, called after common remarks; `"sectionRemark"` added to the generic-loop exclusion; summary message. (The file also carries the older I-51 3-line change from the phone-fix batch; untouched.)
* `apps/web/src/db/localDatabase.ts` — type-only: `"sectionRemark"` in the outbox `entityType` union. No `stores()`/`version()`.
* `apps/web/src/styles/app.css` — one `/* CR-07 ... */` block appended at the end (tokens only, canonical 521 px breakpoint). Nothing else in the file touched.
* `apps/web/package.json` — +1 line: `test:section-remarks`.
* Tests: `tests/remarkSectionsParity.test.ts`, `tests/sectionRemarkTextParity.test.ts`, `tests/sectionRemarks.test.ts`, `tests/section-remarks-store.{html,spec.ts}`, `tests/section-remarks-form.{html,spec.ts}`.

**Docs:** this file; `HANDOVER.md` ("Last updated" block).

## Tests run and results

Disposable Postgres `cr07-section-remarks-verify` on `127.0.0.1:55432` (host TCP readiness checked). Never the runtime database.

| Check | Result |
|---|---|
| API integration `sectionRemarks.integration.test.ts` | **12/12 PASS**, 0 skipped |
| API↔web contract `sectionRemarksWebContract.integration.test.ts` | **1/1 PASS**, 0 skipped |
| Create 201 / replay 200 duplicate / same id different content 409 / same text different id → merged canonical (3 spellings) | PASS |
| 8 concurrent POSTs of one text → 1 row, one 201 + seven 200; 5 concurrent replays of one id → 1 row | PASS |
| Sections and customers independent | PASS |
| Validation: newline, CR, tab, NUL, C1, ZWSP, ZWJ, LRM, RLM, LRE, RLO, bidi isolate, BOM, word joiner, lone surrogate, 2 chars, 301 chars, non-string, extra key, bad ids, null jobId, unknown/injection-looking section, unsupported/unknown system, array body (31 cases) → all 400; 3, 300, NFC+collapse, 3 emoji accepted, 2 emoji refused | PASS |
| Cap 50: 50 created, 51st 409, replay and merge still 200, other section unaffected | PASS |
| Auth: 401; 11 out-of-scope probes (no job, job lacks system, sample job, other tech's job, other customer's job, unknown/demo/inactive customer, admin with foreign job) → one identical 404 body; admin + supervisor allowed; identity mismatch 409, nothing stored | PASS |
| GET: own customer only, shared across its technicians, another customer's rows never returned, inactive rows hidden, 404/400 scope errors | PASS |
| Audit rows: exactly one per stored remark; identity-mismatch failure row | PASS |
| Cold migration, re-run ×2 keeps data, recreate from 048 state, CHECK constraint, unique-index definition | PASS |
| `/service-common-remarks` unchanged (shape, no section wording, `service_common_remarks` columns) | PASS |
| Web node: `remarkSectionsParity` (8), `sectionRemarkTextParity` (3), `sectionRemarks` (8) | **19/19 PASS** |
| Whole web node suite (`tests/*.test.ts(x)`) | **488/488 PASS** (before the final one-line throttle edit; re-run of the 19 new ones after it: PASS) |
| Browser `section-remarks-store` (real IndexedDB, more than 50 checks, the spec asserts that and that none fail: atomic add + rollback when the 2nd write fails, duplicates, cap, merge keeps pending, 10 malformed-refresh cases fail closed, 200-without-echo NOT Completed, wrong uuid NOT Completed, timeout/5xx/429/408 → Pending, 4xx → Failed with reason, retry completes the same single item, merged swap, generic loop excluded, restart survival) | **PASS** |
| Browser `section-remarks-form` (6): offline add on "S.A.J Main Water Supply" → appears there only, not on 6 other rows/Comments; draft payload holds text, no id; offline sync stays Pending; reload; reconnect → exactly 1 server row, 2nd run adds none; duplicates/catalogue/invalid refused; 2nd technician sees it after refresh, other customer's row never; local text typed on two phones merges; 375 px (button ≥44 px full width, Save/Cancel ≥44 px, text 16 px, no horizontal scroll); 24 sites editable, 0 read-only | **6/6 PASS** |
| Existing: `common-remarks.spec`, `manager-common-remarks-mobile.spec` (Admin wording intact), `technician-offline-regression`, `label-override-sprinkler`, `automatic-sprinkler-v7-offline`, `header-proposal-sync-summary`, `technician-location-proposal-sync`, `draft-autosave-submit`, `form-stays-mounted-on-autosave`, `header-compact`, `manager-tap-targets-and-focus`, `label-override-technician-form` | **24/24 PASS** |
| `commonRemarkFormatting`, `autoSync`, `offlineStartRule`, `headerStatus`, `headerSyncSummary`, `syncRefusal`, `queuedWriteRefusal`, `mobileCssRules`, sprinkler label/submit tests | PASS (inside the 488) |
| Web `npm run typecheck` | PASS · Web `npm run build` | PASS |
| API `test:historical-matrix` 20, `test:v6-evidence` 11, `test:wet-chemical-definition` 2, `test:automatic-sprinkler-definition` 7, V7 contract + config 38, `serviceCommonRemarks` 1, label-overrides 8 | PASS |
| API integration: `v6-integration`, `co2V7`, `wetChemicalV7`, `fireAlarmV7`, `v7EvidenceRace` | PASS (re-run with `REPORT_CHROMIUM_PATH` set; the first run failed only because that variable was unset) |
| `git diff --check` | clean (CRLF warnings only) |
| DO-NOT-MODIFY list (`masterServiceReportV1–V6`, `017*`, `fireAlarmV6*`, Compose, Caddy, `.env`, lock files) | `git status` clean for all |

**"Fails before / passes after" evidence** (no stash used):
* The generic-loop exclusion test **fails when the exclusion is removed** (3 checks red) and passes with it — mutation run, then restored (`grep` confirms the exclusion is present).
* On `HEAD`: `RemarksField.tsx` has 0 occurrences of "Add new remark", `syncEngine.ts` 0 of `sectionRemark`, `server.ts` 0 of `sectionRemarks`, `migrations.ts` 0 of `049` (`git show HEAD:<file>`). Every new test targets code that does not exist at `HEAD`, so none can pass there.

### Gate status
* **API `npm run typecheck` / `npm run build`: was RED mid-session, not caused by this task; GREEN at the final re-check (`typecheck` exit 0).**
  The error seen earlier was
  `src/reports/rollerShutterReport.test.ts(59,46): TS18046 'entry' is of type 'unknown'` — an **untracked** file created
  today at 21:30 by a different in-progress task (it was not in the starting `git status`; neither were `rollerShutterDisplay.ts`,
  `optionalGoodPhoto*`, `OptionalPhotoSlot.tsx`, `playwright.cr01.config.ts`, and edits in `co2/*`, `finalServiceReport.ts`, `reportViewModel.ts`, …).
  `tsc` reports **no** error in any file this task touched. I did not edit that file. Because `npm run build` runs `clean` first, `apps/api/dist`
  (git-ignored) was rebuilt; I re-ran its two asset-copy steps so it is complete.
* **The working tree is being edited by another session at the same time** (it also holds the Playwright dev-server port 4175 while it runs;
  my browser run waited for it to free instead of stopping it). Expect `git status` to show files this report does not list.
* The two API integration files run **one after the other** (`&&` in `test:section-remarks-integration`): both reset the disposable schema, so running them in parallel makes them fight (found and fixed while running the block below).
* The block at the end was **executed verbatim** (with a bogus `DATABASE_URL` pre-set) on a fresh disposable DB: all API integration stages passed, the container was removed, then the web tests, web typecheck/build and API typecheck passed.

## P0 / P1 / P2

* **P0: 0 · P1: 0.**
* **P2-1 Failed remark stays offered.** A remark the server definitively rejects (e.g. visit deleted, demo customer) stays in this phone's list and
  its text is already in the inspection; the header shows it under "need attention". Nothing is lost, but it is never withdrawn from the picker. Owner: Phase 2 (edit/delete).
* **P2-2 Replay after the visit was deleted.** Scope is checked before the replay lookup, so a lost-response retry for a remark whose
  visit was deleted in the meantime gets 404 → Failed even though the server stored it. Rare; harmless data-wise.
* **P2-3 Non-ASCII case folding.** The phone de-duplicates with JS lower-casing, the server with PostgreSQL `lower()`. For exotic
  characters they can disagree; the server is authoritative and the merged reply handles it, but a strict wording check could mark such an item Failed.
* **P2-4 Other systems.** Hose Reel, Hydrant, Fire Alarm, FM200, CO2, Dry/Wet Riser, Smoke Ventilation, Fire Intercom, Roller Shutter still use the global list (by design, Phase 1 = pilot).

## Limitations

* **Offline first-use gap:** a phone that has never fetched this customer's remarks online sees only the standard catalogue plus its own additions until it next opens a form online.
* Add-only: no edit or delete anywhere (UI or API). Mistakes stay until a later phase or a database fix.
* Demo and inactive customers are refused by the server (owner decision); on a demo customer the remark works locally but sync shows Failed "Customer or service visit was not found.".
* The form test saves a **Draft** and checks the stored payload; it does not drive "Submit Inspection" (that path is unchanged and covered by the existing sprinkler suites).
* The dev browser harness has no service worker, so "reload while offline" re-fetches the page while the link is up and then cuts the network before reading (the data still comes from IndexedDB). Real offline reload, PWA force-close and the physical phone are **not performed** — see owner steps.
* No real-device, HTTPS, Docker Compose or runtime-database test was run (Level 3 not in scope).

## Owner phone-test steps (use a **non-demo** customer that has an Automatic Sprinkler visit you created)

1. Open the visit online, open **Automatic Sprinkler**. Each row and Comments show a full-width **Add new remark** under the Remark picker.
2. Go to **S.A.J Main Water Supply**, tap **Add new remark**, read "Adds to S.A.J Main Water Supply for this customer. This cannot be undone here.", type a remark, tap **Save & use**. It appears in that row's list of selected remarks.
3. Open the Remark picker on **Water Level** and on **Comments**: the new remark is **not** there. Open the picker on S.A.J Main Water Supply: it is, under "Added for this customer".
4. Turn on flight mode. Add another remark on another row; it still saves and uses. Close the app completely and reopen it offline: both remarks are still offered in their own rows.
5. Turn the network back on. Within a minute the header settles with no "need attention". On a second phone/technician for the same customer, open the same visit: the remarks appear in the same rows only.
6. Type the same remark again in the same row: you get "already in this section's list". Type a very short one ("ab"): refused with a reason.
7. Submit the inspection and open the report: the remark text is part of the remarks, nothing else changed.
8. As Admin open **Common remarks**: the global list is unchanged.
9. Report: anything that looks clipped at phone width, any control smaller than a thumb, and whether you still want the "Others" option in this form.

## Reproducible PowerShell block (starts its own disposable DB; works even if `DATABASE_URL` is already set)

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps\web
$env:REPORT_CHROMIUM_PATH=(node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
if (!(Test-Path -LiteralPath $env:REPORT_CHROMIUM_PATH)) { throw 'Playwright Chromium is unavailable' }
cd C:\PWA_OfflineRecordWebApp
docker rm -f cr07-section-remarks-verify 2>$null
docker run -d --rm --name cr07-section-remarks-verify -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app `
  -e POSTGRES_PASSWORD=replace-with-a-real-secret-outside-git -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL did not start' }
try {
  $ready = $false
  for ($i=0; $i -lt 60; $i++) {
    docker exec cr07-section-remarks-verify pg_isready -U inspection_app -d phase6_seed_integration | Out-Null
    if ($LASTEXITCODE -eq 0 -and (Test-NetConnection -ComputerName 127.0.0.1 -Port 55432 -WarningAction SilentlyContinue).TcpTestSucceeded) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Disposable PostgreSQL did not become reachable on 127.0.0.1:55432' }
  $env:NODE_ENV='test'
  $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:replace-with-a-real-secret-outside-git@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
  cd C:\PWA_OfflineRecordWebApp\apps\api
  npm run test:section-remarks-integration; if ($LASTEXITCODE -ne 0) { throw 'Section remarks integration failed' }   # runs its two files one after the other
  npm run test:v6-integration; if ($LASTEXITCODE -ne 0) { throw 'V6 integration failed' }
  foreach ($file in @('src/sync/co2V7.integration.test.ts', 'src/sync/wetChemicalV7.integration.test.ts',
    'src/sync/fireAlarmV7.integration.test.ts', 'src/sync/v7EvidenceRace.integration.test.ts')) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file
    if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
  }
} finally {
  cd C:\PWA_OfflineRecordWebApp
  docker rm -f cr07-section-remarks-verify
}
cd C:\PWA_OfflineRecordWebApp\apps\web
npm run test:section-remarks; if ($LASTEXITCODE -ne 0) { throw 'Section remarks web tests failed' }
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build; if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
cd C:\PWA_OfflineRecordWebApp\apps\api
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'API typecheck failed' }
cd C:\PWA_OfflineRecordWebApp
git diff --check
```

## Definition of Done

| Item | Status |
|---|---|
| Section-scoped remark stored per customer + system + section; offered only in its section | PASS |
| Offline add, survives reload, syncs once, shared with second technician | PASS (browser harness; phone not done) |
| Server auth, idempotency, merge, validation, cap, audit | PASS |
| No Dexie `version()`/`stores()` change; no change to `service_common_remarks`, templates, evidence, reports | PASS |
| Existing common-remarks tests still pass (no assertion changed; the old "Add to common remarks" label test still covers the non-section path) | PASS |
| Web typecheck + build | PASS |
| API typecheck | PASS at the final re-check (was red mid-session for an unrelated file; see Gate status). `npm run build` was not re-run after that. |
| `git diff --check` | PASS |
| DO-NOT-MODIFY list clean; V1–V6 / Fire Alarm V6 / CO2 V1 / Wet Chemical V4 unchanged | PASS |
| P0 remaining / P1 remaining | 0 / 0 |
| SAFE FOR SOL RE-REVIEW | **Y** |

Not staged. Not committed.
