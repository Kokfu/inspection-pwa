# Local rebuild and location verification — 8 October 2026

Completed on the development PC and USB-connected CPH2375 phone, not the client production host.
Deployed build: **`build-20261008T150537Z`**, release **`sha256-e66944cf3f89e348`**.
The current HTML references `index-DAva4PH5.js`; that bundle contains the build ID, and the phone
shows the same ID after **Update now**. The service worker controls the phone and shows Offline ready.
There is no separate build-version file; the visible build constant comes from the deployed bundle.

**Safe to hand to client: NOT YET.** L-1/L-2/L-3 pass on the rebuilt physical phone and the chosen
L-4 warning is implemented. The full API regression gate remains red on pre-existing fixtures;
I-31 is a newly discovered, pre-existing P2 navigation crash. Production HTTPS/install, client-PC
operations and the owner policy confirmations remain open. No relevant new P0/P1 was identified;
this is not certification that every historical project finding is closed.

## Gates and exact counts

| Requirement | Result | Evidence / limits |
|---|---|---|
| Web typecheck and host production build | PASS | Final source typechecked; final host build and Docker production build pass. Initial sandbox build EPERM disappeared outside the sandbox. Existing large-bundle warning remains. |
| API typecheck and build | PASS | Host `npm run typecheck`, `npm run build`; no API product source changed. |
| Full configured Playwright | PASS — **188/188**, 0 skipped | Run before L-4 and again on final source. 168 and 179 in the status file are older baselines; the latest baseline was **185**, so this is +3 (two form specs, one rejected-list spec). Initial sandbox Vite stall and resulting port conflict were infrastructure attempts, not assertion failures. |
| Web Node suites | PASS — **371/371**, 0 skipped | All `tests/*.test.ts`; initial source 368, then +3 warning tests. |
| API/Node suites | **FAIL — 507 passed / 12 failed / 519 total**, 0 skipped | All 101 `src/**/*.test.ts` files, one process/file, sequentially against fresh disposable PostgreSQL on :55432. 97 files passed; four failed. Includes historical matrix, V6 evidence, V7 contracts/config, all system integrations and evidence race. |
| Isolated failure rerun | FAIL, same results | Four files reproduced on another cold disposable DB: corrections 0/1, service visits 6/14, report approval 0/1, ownership 44/46. Ownership's failed parent adds one reported failure; 12 is the Node-reported count. |
| Live accepted-detail Playwright gates | PASS — **2/2**, 0 skipped/flaky | `Test-V7LiveBrowser.ps1`: CO2 and Wet Chemical; the default Playwright config excludes these two. Seed preparation also passes (3 CO2 Node tests, 1 Wet Chemical). These repeats are not added to the 519 unique API total. |
| New rejection script tests | PASS — **5/5**, 0 skipped | `node --test scripts/reject-legacy-location-proposal.test.mjs`; no repeat of `--apply`. |
| L-4 fail-before/pass-after | PASS | Two existing form harnesses extended: both fail solely on missing duplicate warnings before implementation, with L-1/L-2/L-3 checks green. After: 4 focused browser specs and 3 Node warning tests pass. No test weakened. |
| Historical baseline exception | **Exception still requires owner reconciliation** | `git diff e30c649 -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts` exactly matches commit `10f3bbb`: uploader type `number` → `string`, and comparison `actorUserId` → `String(actorUserId)`. No other change in that file. Other task-brief protected historical paths have no baseline diff and clean working-tree status. Byte equality for this V6 file is not claimed. |
| Local deployment / health / headers | PASS | `docker compose build proxy`, `docker compose up -d --no-deps proxy`; Health-Check and security-header script pass. First immediate health probe hit startup TLS error; repeat after startup passed. PostgreSQL healthy; API/proxy/worker running (no healthchecks configured for those three). |
| API not unexpectedly restarted | PASS | API ID `0096278eb872…`, start `2026-10-08T14:24:33.500256412Z`, restart count 0 unchanged. Deployed server/location-route/customer-route hashes match host build. API and worker not rebuilt. |
| PostgreSQL persistence through this deployment | PASS | DB ID `c3dcdd6d5798…`, start `2026-10-07T10:45:56.555776561Z`, restart count 0 unchanged. Before/after web deployment: customers 20, jobs 89, proposals 7, decisions 6. **No PG restart/recreation test this pass.** |
| Phone vs browser distinction | PASS | Phone tests below use actual installed WebAPK in standalone mode; desktop layout/harness results explicitly separate. Phone origin is dev `http://localhost:8081` over USB proxy, not production HTTPS. |
| `git diff --check` / protected scope | PASS | CRLF notices only. No schema, migration, Dexie version/index, lockfile, Compose, Caddy or `.env` change. No staging or Git mutation. |

## API failures: pre-existing, unchanged, not caused by the location changes

| File / line | Cause | Severity / next owner |
|---|---|---|
| `apps/api/src/routes/managerCorrections.integration.test.ts:208` | Expects supervisor report 200 without creating a technician–supervisor assignment. Current `managerServiceVisits.ts` requires that assignment and returns 404. Earlier correction assertions pass. | P2 regression-gate debt; next source/test checkpoint. |
| `apps/api/src/routes/managerServiceVisits.test.ts:91` and fake DBs | Eight failures: fakes do not implement report-approval queries, including `SELECT status FROM inspection_jobs WHERE id=$1 AND is_sample=false`; route tests consequently see 500. | P2 regression-gate debt; update fixtures without removing authorization or approval coverage. |
| `apps/api/src/routes/reportApprovals.integration.test.ts:69` | Direct SQL closes a job without the report number required by migration 034; trigger refuses it. | P2 regression-gate debt; next source/test checkpoint. |
| `apps/api/src/routes/technicianOwnership.integration.test.ts:234` | T14 direct SQL close likewise lacks report number; failed child plus failed inventory parent. Other 44 checks pass. | P2 regression-gate debt; next source/test checkpoint. |

All these test files and their product code are unchanged in the working tree. Fresh sequential
reruns reproduce the same failures. No runtime SQL was used for integration tests. No validator,
trigger or assertion was weakened. The gate must be repaired and rerun before client acceptance.

## Physical phone evidence — build 150537Z

| Check | Actual result |
|---|---|
| L-1, existing zone | Test visit SV-78: type only `ReleasePhoneDraftOct8`; Submit enabled, zone `z1`/Ground Floor. Authoritative server row saved that zone. |
| L-1, no zones | Existing demo SV-17, Dry/Wet Riser: zone-name field offered; location name alone leaves Submit disabled; naming zone enables it. Not submitted. [Phone](release-location-phone-zoneless.png). |
| L-2 draft | Save Draft, reload, leave/re-enter, force-stop Chrome + installed WebAPK and launch its actual activity: same named draft returns. Standalone mode true. |
| L-2 statuses | Pending returns after offline reload and offline force-close/relaunch. Synced returns after leaving/re-entering. Second proposal receives controlled proxy 503, returns Failed after reload, then retry confirms Synced. Failed/Synced were not separately force-closed in this pass. |
| L-1 offline round trip | Wi-Fi **and mobile data** disabled; USB proxy stopped; `navigator.onLine=false`, API fetch fails. Submit → Pending; reload offline and force-close/relaunch offline succeed. Reconnect → exact UUID `f4740e3a-4184-4fba-9c0b-0c131fea6cf9`, **one** server row, default zone `z1`. [Phone](release-location-phone-offline.png). |
| L-3 local validation | Blank location, blank zone, missing zone: specific messages above Save; no PUT. Blank location and missing zone messages visible; blank-location gap above Save ≈22 px. |
| L-3 server refusal | New unsaved test row count 501 → actual API 400, message visible ≈22 px above Save. Nothing persisted. [Phone](release-location-phone-admin-error.png). |
| Manager proposals | Legacy `678f1e17` absent from Pending, retained under Rejected; unreadable notice stays on Rejected. One readable test proposal approved and another rejected through phone UI, then authoritative rereads. [Phone](release-location-phone-rejected.png). |
| Quick smoke | Demo login, technician home, open CO2 Main Lobby draft on SV-78. Real adb keystrokes `ReleaseSmokeOct8 ` autosaved into IndexedDB; header Online / All submitted changes synced / Offline ready / build ID observed. Synthetic events initially did not autosave because hook requires trusted interaction; no autosave defect claimed. |
| L-4 / layout | Existing duplicate Server Room warning observed on phone. Browser-only checks of both changed screens at 360×800, 768×1024 and 1280×800: scrollWidth equals viewport width; screenshots saved and representative phone/desktop images visually inspected. |

**New pre-existing P2 — I-31:** direct navigation between two proposal routes with disjoint
systems can leave the old selected system in component state. From CO2 SV-78 directly to zoneless
Dry/Wet Riser SV-17, the phone went blank; runtime error:
`TypeError: Cannot read properties of undefined (reading 'zones')` in `index-DAva4PH5.js`.
The component's selected-system state and `selectedSystem!.zones` dereference already exist in
committed HEAD; this is source provenance, not a claim of a separate baseline runtime retest.
Normal navigation via My Jobs unmounts the component and the zoneless test passes. No fix made;
next remediation checkpoint must cover switching jobs without remounting.

L-5 is reproduced: header says all synced while the proposal is Pending/Failed. L-6 recovery
without a tap was not separately timed (Reconnect was used); L-7 stretched radios remain visible;
L-8 N+1 is source-only and not load-tested. E-1/E-2/E-3 are carried from the earlier email check;
no email was sent in this pass.

## Owner decision and behavior changed

Owner selected **L-4(b): non-blocking warning** on 8 October 2026. Implemented on the admin
zone/location editor and technician proposal form. Names compare case-insensitively after trimming:
zone names within one system, location names within one zone. Same location name in different
zones is allowed. Blank-name validation stays separate. Keys, API validation and save/submit
permissions stay unchanged. Warnings render as text beside actions using existing styling.
Technician comparison uses the visit's frozen locations and says so; it cannot detect later server
configuration changes. A reviewer must still check current configuration before approval.

This pass changes: `TechnicianLocationProposal.tsx`, `ManagerCustomerConfiguration.tsx`, new
`referenceData/locationNameWarnings.ts`; extends the two new form HTML harnesses and adds
`tests/locationNameWarnings.test.ts`; updates this report, PHONE_TESTING_STATUS, LEVEL3_CHECKLIST
and HANDOVER; adds 4 phone and 6 browser screenshots. Earlier chats' source/tests/scripts/client
docs remain present and are not attributed to this pass. **No `docs/client/*` edit.**

## Cleanup and remaining data

- Approved: `f4740e3a-4184-4fba-9c0b-0c131fea6cf9`, location key `5d3b29175873`.
- Rejected: `d8cfa0d3-fe81-4888-a9bd-463179ee85c2`, location key `4b3a7adca446`.
- Removed the approved test location through admin PUT only after comparing all remaining content
  with the pre-test snapshot; authoritative reread confirms the original five locations. Config
  version/audit history remains append-only. An initial cleanup request included disallowed location
  `sortOrder` and was refused 400; the corrected strict shape succeeded 200 without weakening validation.
- Removed exactly 3 own proposal draft rows (two Synced, one unsubmitted zoneless Draft), 2 own
  Completed outbox items, the own unsubmitted smoke form `7a1496f9-f65b-46b5-830c-9a544202d6bb`
  and its empty group. Checked identities/statuses before atomic cleanup. No inspection/photo uploaded.
- Server proposals and terminal decisions remain as immutable test audit evidence; none deleted.
  Customers remain 20 and jobs 89. Proposals now 9, decisions 8. Older pending special-character
  proposal `8d4a8b31-51de-4c16-b85f-8c6fb48e5722` was already present and remains untouched.
- Wi-Fi/mobile data restored, proxy fault mode empty, disposable test containers removed.
  Dev phone remains signed in as demo admin. The existing phone proxy remains running.

## Git handover

Recommended commit set (owner performs Git): the three existing changed product files, new
warning helper, changed `apps/web/package.json` test scripts, the new form harness/spec pairs,
warning Node test, changed unreadable-list spec, added legacy route test, guarded rejection script
and its test, HANDOVER, status/checklist, this report, earlier final-check/Prompt-B reports,
`docs/client/`, and reviewed `LEGACY_PROPOSAL_REJECTION.json` evidence. Review
`docs/release/FINAL_CHECKS_PROMPTS.md` as the pre-existing owner prompt document before including.

PNG screenshots are optional evidence (10 new, 2 from Prompt B); include intentionally or keep
outside the commit. **Ignore `scripts/phone-testing/mode.txt`** (generated state). Build outputs,
test-results, browser reports, temporary layout/console scripts and `*.log` are already ignored.
No credentials were saved in scripts/docs. No staging performed.

Exact modified/untracked review inventory (includes earlier chats, not just this pass):

| Recommendation | Files |
|---|---|
| Commit product and test changes together | `apps/web/package.json`; `apps/web/src/jobs/TechnicianLocationProposal.tsx`; `apps/web/src/jobs/technicianLocationProposalDraft.ts`; `apps/web/src/manager/ManagerCustomerConfiguration.tsx`; `apps/web/src/referenceData/locationNameWarnings.ts`; `apps/web/tests/locationNameWarnings.test.ts`; `apps/web/tests/location-proposals-unreadable.spec.ts`; `apps/web/tests/manager-locations-save-feedback.html` and `.spec.ts`; `apps/web/tests/technician-location-proposal-form.html` and `.spec.ts`; `apps/api/src/routes/legacyLocationProposalRejection.test.ts`; `scripts/reject-legacy-location-proposal.mjs`; `scripts/reject-legacy-location-proposal.test.mjs`. |
| Commit reviewed records | `HANDOVER.md`; `docs/release/LEVEL3_CHECKLIST.md`; `docs/testing/PHONE_TESTING_STATUS.md`; `docs/testing/RELEASE_LOCATION_VERIFICATION.md`; `docs/testing/FINAL_CHECK_EMAIL_AND_LOCATIONS.md`; `docs/testing/PROMPT_B_REPORT.md`; existing untracked `docs/client/`; reviewed `docs/testing/LEGACY_PROPOSAL_REJECTION.json`. |
| Owner review before including | `docs/release/FINAL_CHECKS_PROMPTS.md` (pre-existing prompts); optional `docs/testing/legacy-proposal-pending.png`, `legacy-proposal-rejected.png`, four `release-location-phone-*.png`, six `release-location-browser-*.png`. |
| Ignore generated state/output | `scripts/phone-testing/mode.txt`; ignored build/test-results/reports/logs and temporary scripts. |

Final read-only PostgreSQL count check confirmed **20 / 89 / 9 / 8** for customers/jobs/proposals/
decisions. Final `git diff --check` after updating all four records passed. Protected paths remain
unchanged. The V6 baseline diff was displayed again and still contains only the two documented lines.

## Reproduction (source regression only; no runtime data writes)

Run from a normal PowerShell terminal with installed dependencies/Docker/Chromium. This starts a
new disposable DB and overrides any pre-existing DATABASE_URL; port 55432 must be free.

```powershell
cd C:\PWA_OfflineRecordWebApp
node --test scripts/reject-legacy-location-proposal.test.mjs
cd apps\web
npm run typecheck
npm run build
$env:REPORT_CHROMIUM_PATH=(node -e "import('@playwright/test').then(m=>console.log(m.chromium.executablePath()))").Trim()
$webTests=@(rg --files tests | Where-Object { $_ -match '\.test\.ts$' })
& ..\api\node_modules\.bin\tsx.cmd --test @webTests
npx playwright test --workers=1
cd C:\PWA_OfflineRecordWebApp
$testContainer='release-verify-'+[guid]::NewGuid().ToString('N').Substring(0,8)
docker run -d --rm --name $testContainer -e POSTGRES_DB=phase6_seed_integration -e POSTGRES_USER=inspection_app -e POSTGRES_PASSWORD=disposable-test-only -p 127.0.0.1:55432:5432 postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw 'Disposable DB failed to start' }
try {
  for ($i=0; $i -lt 30; $i++) {
    docker exec $testContainer pg_isready -U inspection_app -d phase6_seed_integration
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Disposable DB not ready' }
  $env:NODE_ENV='test'
  $env:SEED_INTEGRATION_DATABASE_URL='postgres://inspection_app:disposable-test-only@127.0.0.1:55432/phase6_seed_integration'
  $env:DATABASE_URL=$env:SEED_INTEGRATION_DATABASE_URL
  cd C:\PWA_OfflineRecordWebApp\apps\api
  npm run typecheck
  npm run build
  foreach ($file in (rg --files src | Where-Object { $_ -match '\.test\.ts$' } | Sort-Object)) {
    node --import tsx --import ./src/reports/pdf/testLifecycle.ts --test $file
    # Continue to investigate every failure; the four known fixtures remain red.
  }
} finally {
  cd C:\PWA_OfflineRecordWebApp
  docker rm -f $testContainer
}
.\scripts\Test-V7LiveBrowser.ps1
git diff e30c649 -- apps/api/src/inspections/evidence/fireAlarmV6Evidence.ts
git diff --check
```
