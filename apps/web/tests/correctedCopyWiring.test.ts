import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assertPhotoReplaceable, submittedPhotoIssues, submittedPhotoMessage } from "../src/attachments/correctedCopy.js";

/**
 * I-21 roll-out: every evidence system must (1) refuse to replace a photo that already left Draft, (2) flag a
 * submitted photo the findings no longer need, (3) expose a corrected-copy repository function, (4) show the action
 * in its form and (5) wire it in App. The behaviour is proven on real IndexedDB in corrected-copy-all-systems.spec.ts;
 * this file pins the wiring so a new or edited system cannot silently drop the guard.
 */
const src = (relative: string) => readFileSync(join(import.meta.dirname, "../src", relative), "utf8").replace(/\r\n/g, "\n");

const systems = [
  { name: "Hydrant", evidence: "hydrant/hydrantV7Evidence.ts", issuesFn: "v7HydrantSubmissionIssues", repo: "hydrant/hydrantRepository.ts", copyFn: "startCorrectedHydrantCopy", form: "hydrant/HydrantInspectionForm.tsx", handler: "handleStartCorrectedHydrantCopy" },
  { name: "Hose Reel", evidence: "hoseReel/hoseReelV7Evidence.ts", issuesFn: "v7HoseReelSubmissionIssues", repo: "hoseReel/hoseReelRepository.ts", copyFn: "startCorrectedHoseReelCopy", form: "hoseReel/HoseReelInspectionForm.tsx", handler: "handleStartCorrectedHoseReelCopy" },
  { name: "Automatic Sprinkler", evidence: "automaticSprinkler/automaticSprinklerV7Evidence.ts", issuesFn: "v7AutomaticSprinklerSubmissionIssues", repo: "automaticSprinkler/automaticSprinklerRepository.ts", copyFn: "startCorrectedAutomaticSprinklerCopy", form: "automaticSprinkler/AutomaticSprinklerInspectionForm.tsx", handler: "handleStartCorrectedAutomaticSprinklerCopy" },
  { name: "Dry/Wet Riser", evidence: "dryWetRiser/dryWetRiserV7Evidence.ts", issuesFn: "v7DryWetRiserSubmissionIssues", repo: "dryWetRiser/dryWetRiserRepository.ts", copyFn: "startCorrectedDryWetRiserCopy", form: "dryWetRiser/DryWetRiserInspectionForm.tsx", handler: "handleStartCorrectedDryWetRiserCopy" },
  { name: "Smoke Ventilation", evidence: "smokeVentilation/smokeVentilationV7Evidence.ts", issuesFn: "v7SmokeVentilationSubmissionIssues", repo: "smokeVentilation/smokeVentilationRepository.ts", copyFn: "startCorrectedSmokeVentilationCopy", form: "smokeVentilation/SmokeVentilationInspectionForm.tsx", handler: "handleStartCorrectedSmokeVentilationCopy" },
  { name: "Fire Rated Roller Shutter", evidence: "fireRatedRollerShutter/fireRatedRollerShutterV7Evidence.ts", issuesFn: "v7FireRatedRollerShutterSubmissionIssues", repo: "fireRatedRollerShutter/fireRatedRollerShutterRepository.ts", copyFn: "startCorrectedFireRatedRollerShutterCopy", form: "fireRatedRollerShutter/FireRatedRollerShutterInspectionForm.tsx", handler: "handleStartCorrectedFireRatedRollerShutterCopy" },
  { name: "Fire Alarm V7", evidence: "fireAlarm/fireAlarmV7Evidence.ts", issuesFn: "v7FireAlarmSubmissionIssues", repo: "fireAlarm/fireAlarmRepository.ts", copyFn: "startCorrectedFireAlarmCopy", form: "fireAlarm/FireAlarmInspectionForm.tsx", handler: "handleStartCorrectedFireAlarmCopy" },
  { name: "Fire Alarm V6", evidence: "fireAlarm/fireAlarmV6Evidence.ts", issuesFn: "v6SubmissionIssues", repo: "fireAlarm/fireAlarmRepository.ts", copyFn: "startCorrectedFireAlarmCopy", form: "fireAlarm/FireAlarmInspectionForm.tsx", handler: "handleStartCorrectedFireAlarmCopy" },
  { name: "CO2 / Wet Chemical", evidence: "co2/v7Evidence.ts", issuesFn: "v7SubmissionIssues", repo: "co2/co2Repository.ts", copyFn: "startCorrectedCo2Copy", form: "co2/Co2InspectionForm.tsx", handler: "handleStartCorrectedCo2Copy" },
  { name: "FM200", evidence: "fm200/fm200Evidence.ts", issuesFn: "v7SubmissionIssues", repo: "fm200/fm200Repository.ts", copyFn: "startCorrectedFm200Copy", form: "fm200/Fm200InspectionForm.tsx", handler: "handleStartCorrectedFm200Copy" },
  { name: "Fire Intercom", evidence: "fireIntercom/fireIntercomV7Evidence.ts", issuesFn: "v7FireIntercomSubmissionIssues", repo: "fireIntercom/fireIntercomRepository.ts", copyFn: "startCorrectedFireIntercomCopy", form: "fireIntercom/FireIntercomInspectionForm.tsx", handler: "handleStartCorrectedFireIntercomCopy" }
];
const app = src("App.tsx");

for (const system of systems) {
  test(`${system.name}: photo guard, stale-submitted check, copy export, form action and App wiring are all present`, () => {
    const evidence = src(system.evidence);
    const put = /(?:await localDatabase\.inspectionAttachments\.put\(\{ photoUuid: existing\?\.photoUuid|const attachment: InspectionAttachmentRecord = \{ photoUuid: existing\?\.photoUuid)/.exec(evidence);
    assert.ok(put, "photo save with an existing photoUuid not found");
    const before = evidence.slice(Math.max(0, put.index - 160), put.index);
    assert.match(before, /assertPhotoReplaceable\(existing\);/, "the guard must sit right before the photo write (no other function in between)");
    const start = evidence.indexOf(`export function ${system.issuesFn}`);
    assert.ok(start >= 0, "issues function not found");
    const end = evidence.indexOf("return issues;", start);
    assert.match(evidence.slice(start, end), /submittedPhotoIssues\(attachments/, "stale submitted photo check missing from the issues function");

    assert.match(src(system.repo), new RegExp(`export const ${system.copyFn} = `), "corrected-copy export missing");
    assert.match(src(system.form), /<CorrectedCopyAction[^>]*onStart=\{onStartCorrectedCopy\}/, "form action missing");
    assert.match(src(system.form), /onStartCorrectedCopy: \(\) => Promise<void>/, "form prop missing");
    assert.match(app, new RegExp(`async function ${system.handler}\\(`), "App handler missing");
    assert.match(app, new RegExp(`onStartCorrectedCopy=\\{${system.handler}\\}`), "App prop wiring missing");
  });
}

test("shared guard: only a Draft photo (or no photo yet) may be replaced; the message points to the corrected copy", () => {
  assertPhotoReplaceable(undefined);
  assertPhotoReplaceable({ syncStatus: "Draft" });
  for (const syncStatus of ["Pending", "Uploading", "Synced", "Failed", "Conflict"] as const) {
    assert.throws(() => assertPhotoReplaceable({ syncStatus }), (error: Error) => error.message === submittedPhotoMessage && /Start corrected copy/.test(error.message), syncStatus);
  }
});

test("shared stale-photo rule: only non-Draft photos the findings no longer need are flagged", () => {
  const photos = [
    { fieldPath: "a", syncStatus: "Synced" as const }, { fieldPath: "b", syncStatus: "Synced" as const },
    { fieldPath: "c", syncStatus: "Draft" as const }, { fieldPath: "d", syncStatus: "Pending" as const }
  ];
  const issues = submittedPhotoIssues(photos, ["a"]);
  assert.equal(issues.length, 2);
  assert.ok(issues.some((issue) => issue.startsWith("b ")) && issues.some((issue) => issue.startsWith("d ")));
  assert.ok(!issues.some((issue) => issue.startsWith("c ")), "a never-submitted Draft photo is not blocked");
  assert.deepEqual(submittedPhotoIssues(photos, ["a", "b", "c", "d"]), []);
  assert.deepEqual(submittedPhotoIssues([], []), []);
});
