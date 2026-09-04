import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256 } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { submitIssues } from "../src/hydrant/hydrantRepository";
import type { HydrantInspectionRecord, HydrantResponses } from "../src/hydrant/hydrantTypes";
import { hydrantResultColumns } from "../src/hydrant/hydrantTypes";
import { historicalHydrantResultDefinition, resolveHydrantV7ResultDefinitions, v7HydrantSubmissionIssues, v7RequiredHydrantFieldPaths } from "../src/hydrant/hydrantV7Evidence";

const uuid = "00000000-0000-4000-8000-000000000099";
const hash = (char: string) => char.repeat(64);
const definition = masterServiceReportV7.systems.find((system) => system.key === "hydrant")!;
const v7Record = { masterTemplate: { version: 7 }, inspectionSnapshot: { system: { definition } } } as HydrantInspectionRecord;
const historicalRecord = { masterTemplate: { version: 6 }, inspectionSnapshot: { system: { locations: [] } } } as unknown as HydrantInspectionRecord;

function responses(overrides: Record<string, unknown> = {}): HydrantResponses {
  return {
    schemaVersion: 1,
    hydrantType: "pressurize",
    rows: [{
      rowUuid: uuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null,
      assetReference: "H-1", locationText: "Hydrant Bank", sortOrder: 1, remarks: "", fieldRemarks: {},
      canvasHose1Result: "good", canvasHose2Result: "good", diffuserNozzleResult: "good", landingValveResult: "good", landingValveHandleResult: "good", hoseCabinetResult: "good", keyLockResult: "good"
    }], comments: "", ...overrides
  };
}

const fieldPath = (wire: typeof hydrantResultColumns[number][1]) => `hydrant_set.hydrant_rows.rows.${uuid}.${wire}`;
const attachment = (path: string, sha256: string) => ({ photoUuid: crypto.randomUUID(), inspectionClientUuid: uuid, systemKey: "hydrant", fieldPath: path, sha256, protocolVersion: 7 }) as unknown as Parameters<typeof v7HydrantSubmissionIssues>[2][number];
const withFindings = () => responses({ rows: [{ ...responses().rows[0], canvasHose1Result: "not_good", landingValveResult: "complete_repair", fieldRemarks: { canvasHose1Result: "Canvas damaged", landingValveResult: "Valve rebuilt" } }] });

test("a complete V7 Hydrant draft raises no evidence issues", () => {
  assert.deepEqual(v7HydrantSubmissionIssues(v7Record, responses(), []), []);
});

test("a V7 finding without its own remark is refused", () => {
  const draft = withFindings(); draft.rows[0]!.fieldRemarks = { landingValveResult: "Valve rebuilt" };
  const issues = v7HydrantSubmissionIssues(v7Record, draft, [attachment(fieldPath("canvas_hose_1"), hash("a")), attachment(fieldPath("landing_valve"), hash("b"))]);
  assert.ok(issues.some((issue) => /Canvas Hose 1 requires its own Remark/.test(issue)), JSON.stringify(issues));
});

test("a V7 finding without its own photo is refused", () => {
  const issues = v7HydrantSubmissionIssues(v7Record, withFindings(), [attachment(fieldPath("canvas_hose_1"), hash("a"))]);
  assert.ok(issues.some((issue) => new RegExp(`${fieldPath("landing_valve")} requires its own Photo`).test(issue)), JSON.stringify(issues));
});

test("one photo reused across two Hydrant findings is refused before it can be queued", () => {
  const issues = v7HydrantSubmissionIssues(v7Record, withFindings(), [
    attachment(fieldPath("canvas_hose_1"), hash("a")), attachment(fieldPath("landing_valve"), hash("a"))
  ]);
  assert.ok(issues.some((issue) => /use the same photo; each finding needs its own photo/.test(issue)), `expected duplicate-photo issue, got ${JSON.stringify(issues)}`);
});

test("a stale Hydrant V7 finding reverted to good or na is excluded", () => {
  for (const value of ["good", "na"] as const) {
    const draft = withFindings(); draft.rows[0]!.canvasHose1Result = value;
    const issues = v7HydrantSubmissionIssues(v7Record, draft, [
      attachment(fieldPath("canvas_hose_1"), hash("a")), attachment(fieldPath("landing_valve"), hash("a"))
    ]);
    assert.deepEqual(issues, [], `${value} must exclude stale Canvas Hose evidence`);
  }
});

test("web Hydrant field paths exactly equal the server adapter's canonical paths", () => {
  const adapter = resolveV7EvidenceContract({ systemKey: "hydrant", templateId: masterServiceReportV7.id, templateVersion: 7, definition, contractSha256: v7EvidenceContractSha256(definition) });
  assert.ok(adapter, "Hydrant V7 server adapter must resolve");
  const draft = withFindings();
  assert.deepEqual(v7RequiredHydrantFieldPaths(draft), adapter.derivePoorFieldPaths(draft));
  for (const path of v7RequiredHydrantFieldPaths(draft)) assert.equal(adapter.isCanonicalFieldPath(path), true, path);
});

test("a V1-V6 Hydrant record remains two-state and submits", () => {
  const historical = responses({ rows: [{ ...responses().rows[0], fieldRemarks: undefined, canvasHose1Result: "poor" }] });
  assert.deepEqual(historicalHydrantResultDefinition.options.map((option) => option.value), ["good", "poor"]);
  assert.deepEqual(resolveHydrantV7ResultDefinitions(definition)?.canvasHose1Result.options.map((option) => option.value), ["good", "not_good", "complete_repair", "na"]);
  assert.deepEqual(submitIssues(historicalRecord, historical), []);
});
