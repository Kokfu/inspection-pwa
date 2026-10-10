# CR-09 — Complete Repair disabled for new entry

Date: 2026-10-10 (Asia/Kuala_Lumpur).

Complete Repair is hidden in all inspection result-entry controls and manager correction choices. The original option definitions and rendering code remain recoverable. One UI-only switch in `apps/web/src/inspectionControls/resultEntryPolicy.ts` controls restoration: comment out false and uncomment the retained true declaration. No API/server behavior, validator, type, evidence policy, frozen template, migration, Dexie schema, sync engine, dependency or lockfile was changed.

## Inspection and existing data

Audited **66 matching lines in 50 source files**. The complete per-hit classification is in [CR09_REPAIR_DISABLED_HITS.md](CR09_REPAIR_DISABLED_HITS.md). Definitions used for both rendering and validation retain all four states; filtering happens only at the UI boundary. Ten systems share ResultSelector (including Wet Chemical through the CO2 form); Fire Alarm has native selects. Portable Fire Extinguisher has quantity inputs and never had this result option. The sample form also applies the policy.

Existing Drafts retain their exact saved `complete_repair` value, displayed as **Complete Repair (no longer selectable)**. Loading does not rewrite it. Selecting Good, Not Good or N.A. uses the normal change/save flow. Browser tests opened a stored draft and changed it offline in every one of the 11 result-bearing systems; IndexedDB confirmed the chosen replacement. Read-only records keep **Complete Repair**, without the retired-entry suffix. The actual ServerFireIntercomView and shared FinalReportPresentation were rendered with existing Complete Repair data. Saved contract/evidence node tests remain active.

No complete-repair-only submission path was found. Other choices remain available; the existing clean-draft submission gates and finding/evidence tests passed. Normal/Test/Isolation remains untouched.

## Definition of Done — Level 2-lite

| Gate | Result | Evidence |
|---|---|---|
| Web typecheck | PASS | npm run typecheck, exit 0 |
| Web production build | PASS | npm run build, exit 0; existing large-bundle warning |
| New-entry forms for all systems | PASS | 12 browser cases; no Repair button/option |
| Existing drafts open and change offline | PASS | 11 browser cases; stored value preserved then explicitly changed |
| Accepted record and final report label | PASS | real accepted component and shared report component |
| Affected manager/browser regressions | PASS | 46 passing CR-09/manager cases across original run and focused rerun |
| Affected result-tap scroll regressions | PASS | 12 pass, 12 retired-option skips; remaining result taps do not move scroll |
| Focused node tests | PASS | 151 pass, 0 fail, 0 skip |
| API unchanged by this task | PASS | SHA-256 before/after: all 300 API files match (excluding dependencies/generated dist) |
| No migrations/Dexie/server contract changes | PASS | controlled edit list; API hashes match; definitions/types/evidence rules retained |
| git status for apps/api | NOT RUN | explicit user no-git rule; hashes prove task did not change API, not that pre-existing tree is clean |
| git diff --check | NOT RUN | explicit user no-git rule; equivalent added-line whitespace/conflict-marker scan found 0 issues |
| Historical immutability | PASS for task delta | API files unchanged during task; historical draft regression tests pass. Comparison with e30c649 was not run (no git). |

Standard broad API/disposable-DB release gates were not run for this explicitly requested UI-only Level 2-lite task. No deployment, phone/PWA force-close, live API or production-data test is claimed.

The first affected browser run had 45 passes, 1 retired-option skip, and 1 failed Portable test fixture. That fixture omitted the required frozen V5 catalog row; adding it fixed the case on focused rerun (1 pass, 1 retained preview skip). No production logic was changed to accommodate the fixture. The first scroll run timed out on a pre-existing zero-select index bug (it tried index 0 even when selectCount was 0); that run was interrupted, the affected test index was bounded, and the suite was rerun successfully (12 pass, 12 explicit retired-option skips). A test-server port conflict delayed that rerun; a temporary config reused the task server without changing the repository config.

Total final unique results: **58 passing browser cases, 151 passing node tests, 14 explicit browser skips**. The initial failed runs above are documented and are not counted as passes.

## Skips — not passes

14 retired-option scenarios are explicitly retained as skips:

- `manager-corrections.spec.ts`: original Complete Repair conflict case. The same conflict assertions pass for Not Good.
- `manager-service-editor.spec.ts`: original four-option preview assertion. The active preview test asserts the exact three visible choices.
- `result-tap-scroll.spec.ts`: one Complete Repair tap skip for each of automatic_sprinkler, hose_reel, hydrant, dry_wet_riser, fire_alarm_detector, fire_intercom, co2_fire_extinguisher, fm200_fire_suppression, smoke_ventilation, fire_rated_roller_shutter, wet_chemical and portable_fire_extinguisher. Original button/select tap loops retain the retired option and marked skips; the remaining tap checks are active.

No contract, evidence-policy, accepted-data or historical tests were skipped. Restore the shared switch, remove the marked skip/continue lines, and restore the commented preview assertion when the owner restores the option.

## Files changed

- apps/web/src/inspectionControls/resultEntryPolicy.ts — one recoverable UI switch; contract values remain intact
- apps/web/src/inspectionControls/ResultSelector.tsx — hide retired choice; display saved value and allow another selection
- apps/web/src/fireAlarm/FireAlarmInspectionForm.tsx — same policy for Fire Alarm native result selects
- apps/web/src/inspections/InspectionForm.tsx — same policy for sample status selects
- apps/web/src/manager/ManagerCorrectionEditor.tsx — hide new correction choice; preserve original/current labels
- apps/web/tests/result-tap-scroll.spec.ts — retain retired tap paths and record 12 explicit skips; bound native-select indices when a form has no selects
- apps/web/tests/manager-corrections.spec.ts — retain retired conflict case; add equivalent Not Good conflict coverage
- apps/web/tests/manager-service-editor.spec.ts — assert current preview choices; retain retired assertion with explicit skip
- apps/web/tests/result-tap-scroll.html — seed retired drafts; include Portable frozen V5 catalog row
- apps/web/tests/fire-rated-roller-shutter-form.html — seed a configured retired draft for recovery coverage
- apps/web/tests/repair-disabled.spec.ts — all-system entry, offline draft changes, accepted display and final report
- apps/web/tests/repair-disabled-display.html — render real accepted and final-report components with saved Repair data
- apps/web/tests/repairDisabled.test.ts — prove policy does not mutate frozen options or detector states
- HANDOVER.md — record this checkpoint while preserving prior entries.
- docs/testing/CR09_REPAIR_DISABLED.md and CR09_REPAIR_DISABLED_HITS.md — checkpoint evidence and exhaustive hit audit.

## Restore checklist — actual grep output

Command: `grep -rn "REPAIR-DISABLED" apps/web/src apps/web/tests` (installed standalone grep executable; no Git command).

```text
apps/web/src/fireAlarm/FireAlarmInspectionForm.tsx:37:  // REPAIR-DISABLED (CR-09): original unfiltered choices: options.map(([key, text]) => <option key={key} value={key}>{text}</option>)
apps/web/src/inspectionControls/resultEntryPolicy.ts:1:// REPAIR-DISABLED (CR-09): restore Complete Repair choices by uncommenting true below and removing false.
apps/web/src/inspectionControls/ResultSelector.tsx:21:      {/* // REPAIR-DISABLED (CR-09): original unfiltered option rendering: definition.options.map((option) => { */}
apps/web/src/inspections/InspectionForm.tsx:106:                  {/* // REPAIR-DISABLED (CR-09): original unfiltered choices: item.options.map((option) => */}
apps/web/src/manager/ManagerCorrectionEditor.tsx:160:        {/* // REPAIR-DISABLED (CR-09): original unfiltered choices: (field.options ?? []).map((option) => <button */}
apps/web/tests/manager-corrections.spec.ts:189:// REPAIR-DISABLED (CR-09): retained Complete Repair conflict case; owner retired new selection.
apps/web/tests/manager-service-editor.spec.ts:57:  // REPAIR-DISABLED (CR-09): retained former option assertion for restoration.
apps/web/tests/manager-service-editor.spec.ts:412:// REPAIR-DISABLED (CR-09): retained four-option preview assertion; owner retired Complete Repair entry.
apps/web/tests/result-tap-scroll.spec.ts:47:      // REPAIR-DISABLED (CR-09): retired option tap is skipped; separate test.skip below records it.
apps/web/tests/result-tap-scroll.spec.ts:75:      // REPAIR-DISABLED (CR-09): retired native-select tap is skipped; separate test.skip below records it.
apps/web/tests/result-tap-scroll.spec.ts:98:// REPAIR-DISABLED (CR-09): owner retired this option; original tap paths remain above for restoration.
```

## Reproducible focused commands

```powershell
cd C:\PWA_OfflineRecordWebApp
cd apps/web
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Web typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
$tests = @('tests/repairDisabled.test.ts', 'tests/v7EvidenceStaleManifest.test.ts', 'tests/historicalDraftCompatibility.test.ts', 'tests/v7CatalogContractResolution.test.ts', 'tests/fireAlarmV7SubmissionIssues.test.ts', 'tests/hydrantV7SubmissionIssues.test.ts', 'tests/hoseReelV7SubmissionIssues.test.ts', 'tests/automaticSprinklerV7SubmissionIssues.test.ts', 'tests/dryWetRiserV7SubmissionIssues.test.ts', 'tests/smokeVentilationV7SubmissionIssues.test.ts', 'tests/fireIntercomV7SubmissionIssues.test.ts', 'tests/fireRatedRollerShutterV7SubmissionIssues.test.ts', 'tests/fireRatedRollerShutterSetup.test.ts', 'tests/wetChemicalAcceptedDetailParser.test.ts', 'tests/fireAlarmAcceptedDetailTuple.test.ts')
& ..\api\node_modules\.bin\tsx.cmd --test @tests
if ($LASTEXITCODE -ne 0) { throw 'Focused node tests failed' }
# Port 4175 must be free for the repository's strict test-server config.
npx playwright test tests/repair-disabled.spec.ts tests/manager-corrections.spec.ts tests/manager-service-editor.spec.ts tests/result-tap-scroll.spec.ts --workers=1 --reporter=line
if ($LASTEXITCODE -ne 0) { throw 'Affected browser tests failed' }
& 'C:\Program Files\Git\usr\bin\grep.exe' -rn REPAIR-DISABLED apps/web/src apps/web/tests
```

P0 remaining: 0. P1 remaining: 0 known in this scope. P2: requested Git evidence remains unavailable under the no-git instruction. **DoD is not fully closed until the owner supplies git status and git diff --check. SAFE FOR SOL RE-REVIEW: Y for implementation review; no staging or release verdict.**
