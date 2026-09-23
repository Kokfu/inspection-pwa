import assert from "node:assert/strict";
import test from "node:test";
import {
  collectV7SiblingEvidence,
  crossInstanceV7PhotoClash,
  v7RequiredFieldPaths,
  v7SubmissionIssues,
  type V7EvidenceSource
} from "../src/fm200/fm200Evidence";
import type { Fm200MasterSystemFormInstanceRecord, Fm200Responses } from "../src/fm200/fm200Types";
import type { InspectionAttachmentRecord } from "../src/attachments/attachmentTypes";

// G9.  One FM200 Job holds several location-instances of the same system,
// each its own masterSystemFormInstances row.  Server evidence uniqueness is
// jobId+systemKey, so the same photo on Location A and Location B is refused
// at acceptance with a *retryable* EVIDENCE_CONFLICT — and the outbox
// re-attempts Failed items forever, so the technician's work strands.  The
// submit gate and the capture guard therefore have to see the siblings.
// Mirrors ../src/co2/v7Evidence's coverage (co2V7CrossInstanceEvidence.test.ts)
// against the FM200 module - FM200 is a fully independent system, not a
// relabeled CO2, so it needs its own test surface.

const MAIN_SUPPLY = "charger_batteries.charger_battery_checks.main_supply";
const CYLINDER = "physical_outlook.physical_outlook_checks.co2_cylinder";

function responses(overrides: Partial<Fm200Responses> = {}): Fm200Responses {
  return {
    controlPanelLocation: "Room A",
    detectorRows: [],
    chargerAndBatteries: {
      main_supply: { result: "not_good", remarks: "Supply low" },
      battery: { result: "good", remarks: "" },
      charger: { result: "na", remarks: "" }
    },
    physicalOutlook: { co2_cylinder: { result: "good", remarks: "" } },
    mainFunctionKeys: { lamp_test: { result: "good", remarks: "" } },
    comments: "",
    ...overrides
  };
}

function record(values: {
  clientUuid: string;
  groupKey: string;
  displaySequence: number;
  locationName: string;
  responses?: Fm200Responses;
}): Fm200MasterSystemFormInstanceRecord {
  return {
    clientUuid: values.clientUuid,
    groupKey: values.groupKey,
    displaySequence: values.displaySequence,
    masterTemplate: { id: "template", code: "MFE-FSSR", version: 7 },
    responses: values.responses ?? responses(),
    inspectionSnapshot: { instance: { location: { displayName: values.locationName } } }
  } as unknown as Fm200MasterSystemFormInstanceRecord;
}

const attachment = (inspectionClientUuid: string, fieldPath: string, sha256: string) => ({
  photoUuid: `${inspectionClientUuid}:${fieldPath}`,
  inspectionClientUuid,
  fieldPath,
  sha256,
  protocolVersion: 7
}) as unknown as InspectionAttachmentRecord;

/** Minimal stand-in for the two indexed Dexie tables the join walks:
 * masterSystemFormInstances by `groupKey`, inspectionAttachments by
 * `inspectionClientUuid`.  Both indexes are declared in localDatabase v9. */
function source(instances: Fm200MasterSystemFormInstanceRecord[], attachments: InspectionAttachmentRecord[]): V7EvidenceSource {
  const reader = <T>(rows: T[]) => ({
    where: (index: string) => ({
      equals: (value: string) => ({
        toArray: async () => rows.filter((row) => (row as unknown as Record<string, unknown>)[index] === value)
      })
    })
  });
  return { masterSystemFormInstances: reader(instances), inspectionAttachments: reader(attachments) };
}

const JOB = "job-1";
const FM200_GROUP = `${JOB}:fm200_fire_suppression`;
const OTHER_SYSTEM_GROUP = `${JOB}:co2_fire_extinguisher`;
const OTHER_JOB_GROUP = "job-2:fm200_fire_suppression";

const locationA = record({ clientUuid: "a", groupKey: FM200_GROUP, displaySequence: 1, locationName: "FM200 Room A" });
const locationB = record({ clientUuid: "b", groupKey: FM200_GROUP, displaySequence: 2, locationName: "FM200 Room B" });

test("the same photo on a finding in two locations of one Job is refused before it can be queued", async () => {
  const attachments = [attachment("a", MAIN_SUPPLY, "same-bytes"), attachment("b", MAIN_SUPPLY, "same-bytes")];
  const siblings = await collectV7SiblingEvidence(locationB, source([locationA, locationB], attachments));
  const issues = v7SubmissionIssues(locationB, locationB.responses, [attachments[1]], siblings);
  assert.ok(
    issues.some((issue) => /use the same photo; each finding needs its own photo/.test(issue)),
    `expected a cross-instance duplicate issue, got ${JSON.stringify(issues)}`
  );
  assert.ok(
    issues.some((issue) => issue.includes("FM200 Room A")),
    `the other location must be named so the technician can act, got ${JSON.stringify(issues)}`
  );
});

test("the capture-time guard refuses the same bytes and names the other location", async () => {
  const siblings = await collectV7SiblingEvidence(locationB, source([locationA, locationB], [attachment("a", MAIN_SUPPLY, "same-bytes")]));
  assert.deepEqual(crossInstanceV7PhotoClash("same-bytes", siblings), {
    locationLabel: "FM200 Room A", fieldPath: MAIN_SUPPLY, sha256: "same-bytes"
  });
  assert.equal(crossInstanceV7PhotoClash("other-bytes", siblings), undefined);
});

test("a sibling photo left on a field that is no longer a finding does not block", async () => {
  // Location A's cylinder was reverted to good: the photo is stale, is excluded
  // from A's manifest by v7EvidenceManifest and is never staged for acceptance.
  const staleA = record({ clientUuid: "a", groupKey: FM200_GROUP, displaySequence: 1, locationName: "FM200 Room A" });
  assert.deepEqual(v7RequiredFieldPaths(staleA.responses), [MAIN_SUPPLY]);
  const attachments = [attachment("a", CYLINDER, "same-bytes"), attachment("b", MAIN_SUPPLY, "same-bytes")];
  const siblings = await collectV7SiblingEvidence(locationB, source([staleA, locationB], attachments));
  assert.deepEqual(v7SubmissionIssues(locationB, locationB.responses, [attachments[1]], siblings), []);
});

test("a different system key in the same Job may reuse the same bytes", async () => {
  const other = record({ clientUuid: "w", groupKey: OTHER_SYSTEM_GROUP, displaySequence: 1, locationName: "Kitchen" });
  const attachments = [attachment("w", MAIN_SUPPLY, "same-bytes"), attachment("b", MAIN_SUPPLY, "same-bytes")];
  const siblings = await collectV7SiblingEvidence(locationB, source([other, locationB], attachments));
  assert.deepEqual(siblings, []);
  assert.deepEqual(v7SubmissionIssues(locationB, locationB.responses, [attachments[1]], siblings), []);
});

test("the same bytes in a different Job may still be used", async () => {
  const other = record({ clientUuid: "o", groupKey: OTHER_JOB_GROUP, displaySequence: 1, locationName: "Other Job Room" });
  const attachments = [attachment("o", MAIN_SUPPLY, "same-bytes"), attachment("b", MAIN_SUPPLY, "same-bytes")];
  const siblings = await collectV7SiblingEvidence(locationB, source([other, locationB], attachments));
  assert.deepEqual(siblings, []);
  assert.deepEqual(v7SubmissionIssues(locationB, locationB.responses, [attachments[1]], siblings), []);
});

test("this instance's own row is not reported twice", async () => {
  const attachments = [attachment("b", MAIN_SUPPLY, "same-bytes")];
  const siblings = await collectV7SiblingEvidence(locationB, source([locationA, locationB], attachments));
  assert.deepEqual(siblings.map((sibling) => sibling.clientUuid), ["a"]);
  assert.deepEqual(v7SubmissionIssues(locationB, locationB.responses, attachments, siblings), []);
});

test("distinct photos across two locations raise no issue", async () => {
  const attachments = [attachment("a", MAIN_SUPPLY, "bytes-a"), attachment("b", MAIN_SUPPLY, "bytes-b")];
  const siblings = await collectV7SiblingEvidence(locationB, source([locationA, locationB], attachments));
  assert.deepEqual(v7SubmissionIssues(locationB, locationB.responses, [attachments[1]], siblings), []);
});
