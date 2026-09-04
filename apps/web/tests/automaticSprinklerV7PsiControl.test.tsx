import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { masterServiceReportV1 } from "../../api/src/inspections/templates/masterServiceReportV1";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { AutomaticSprinklerInspectionForm } from "../src/automaticSprinkler/AutomaticSprinklerInspectionForm";
import { resolvePublishedAutomaticSprinklerControls } from "../src/automaticSprinkler/automaticSprinklerDefinition";
import type { AutomaticSprinklerInspectionRecord } from "../src/automaticSprinkler/automaticSprinklerTypes";

const psiPaths = [
  "measurements.jockey_pump_pressure.cut_in", "measurements.jockey_pump_pressure.cut_out",
  "measurements.duty_pump_cut_in.value", "measurements.standby_pump_cut_in.value",
  "measurements.water_supply_gauge.value", "measurements.installation_gauge.value"
] as const;
const evidencePolicy = {
  id: "00000000-0000-4000-8000-000000000710", code: "automatic-sprinkler-psi-evidence", version: 1, schemaVersion: 1,
  definition: { schemaVersion: 1, code: "automatic-sprinkler-psi-evidence", version: 1, systemKey: "automatic_sprinkler", points: Object.fromEntries(psiPaths.map((path) => [path, { allowed: true, required: false, maxCount: 1 }])) },
  definitionSha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"
};
// `resolvePublishedAutomaticSprinklerControls` treats the published system object
// itself as the "definition" (it reads `.key` / `.configuration` / `.sections`).
const v1Definition = masterServiceReportV1.systems.find((system) => system.key === "automatic_sprinkler")!;
const v7Definition = masterServiceReportV7.systems.find((system) => system.key === "automatic_sprinkler")!;

function record(version: 1 | 7): AutomaticSprinklerInspectionRecord {
  const controls = resolvePublishedAutomaticSprinklerControls(version === 7 ? v7Definition : v1Definition, "MFE-FSSR", version);
  const measurements = Object.fromEntries(controls.measurements.map((item) => [item.key, {
    values: Object.fromEntries(item.values.map((value) => [value.key, 1])), unit: "PSI", result: "good" as const, remarks: ""
  }]));
  const responses = version === 7
    ? { schemaVersion: 2 as const, checklist: Object.fromEntries([...controls.checklist.waterTank, ...controls.checklist.pumpHouse, ...controls.checklist.mainAlarmValve, ...controls.checklist.testRunFirePump].map((item) => [item.key, { result: "good", remarks: "" }])), measurements, comments: "" }
    : { schemaVersion: 1 as const, waterTank: Object.fromEntries(controls.checklist.waterTank.map((item) => [item.key, { result: "good", remarks: "" }])), pumpHouse: Object.fromEntries(controls.checklist.pumpHouse.map((item) => [item.key, { result: "good", remarks: "" }])), mainAlarmValve: Object.fromEntries(controls.checklist.mainAlarmValve.map((item) => [item.key, { result: "good", remarks: "" }])), measurements, comments: "" };
  return {
    schemaVersion: 1, clientUuid: "00000000-0000-4000-8000-000000000123", jobSystemKey: "job:automatic_sprinkler", jobId: "00000000-0000-4000-8000-000000000001",
    systemKey: "automatic_sprinkler", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1, originalCreatorSnapshot: null,
    masterTemplate: { id: version === 7 ? "00000000-0000-4000-8000-000000000807" : "00000000-0000-4000-8000-000000000801", code: "MFE-FSSR", version },
    configuration: { revisionId: "00000000-0000-4000-8000-000000000003", revisionNumber: 1 },
    inspectionSnapshot: { schemaVersion: 1, capturedAt: "2026-09-04T00:00:00.000Z", job: { id: "j", reference: "r", title: "t" }, customer: { id: "c", code: "C", displayName: "C" }, configuration: { revisionId: "00000000-0000-4000-8000-000000000003", revisionNumber: 1 }, template: { id: "x", code: "MFE-FSSR", name: "MFE", version }, system: { enabledSystemId: "s", systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [], definition: version === 7 ? v7Definition : v1Definition, resolvedControls: controls, repetitionMode: "single", evidencePolicy }, instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null } },
    responses, performedAt: "2026-09-04T00:00:00.000Z", localCreatedAt: "2026-09-04T00:00:00.000Z", localUpdatedAt: "2026-09-04T00:00:00.000Z", syncStatus: "Draft"
  } as unknown as AutomaticSprinklerInspectionRecord;
}

const noop = async () => undefined;
const render = (version: 1 | 7) => renderToStaticMarkup(React.createElement(AutomaticSprinklerInspectionForm, {
  record: record(version), onBack: () => undefined, onSaveDraft: noop, onSubmitLocal: noop, onEditFailed: noop, onAttachmentsChange: noop
}));

test("a V1 Automatic Sprinkler Draft still renders the legacy PSI photo control", () => {
  const html = render(1);
  assert.ok(html.includes('aria-label="PSI photo evidence"'), "V1 form keeps the legacy Cut-In/Cut-Out PSI photo control");
});

test("a V7 Automatic Sprinkler Draft never renders the legacy PSI photo control", () => {
  const html = render(7);
  assert.equal(html.includes('aria-label="PSI photo evidence"'), false, "V7 drops the legacy PSI photo control entirely");
  assert.equal(html.includes("sprinkler-legacy-psi-evidence") && html.match(/photo-evidence-field/g) !== null && /sprinkler-legacy-psi-evidence[^]*?photo-evidence-field/.test(html), false, "no PhotoEvidenceField inside the V7 legacy-PSI wrapper");
});
