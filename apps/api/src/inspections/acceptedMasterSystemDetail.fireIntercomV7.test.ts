import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "./templates/masterServiceReportV7.js";
import { v7EvidenceContractSha256 } from "./evidence/v7EvidenceContracts.js";
import { validateAcceptedFireIntercomV7Detail } from "./acceptedMasterSystemDetail.js";

const templateId = masterServiceReportV7.id;
const definition = masterServiceReportV7.systems.find((system) => system.key === "fire_intercom")!;
const contractSha256 = v7EvidenceContractSha256(definition);
const jobId = "11111111-1111-4111-8111-111111111131";
const clientUuid = "22222222-2222-4222-8222-222222222231";
const revisionId = "33333333-3333-4333-8333-333333333331";
const customerId = "44444444-4444-4444-8444-444444444431";
const formInstanceId = "55555555-5555-4555-8555-555555555531";
const locationId = "66666666-6666-4666-8666-666666666631";
const configuredRowUuid = "77777777-7777-4777-8777-777777777731";
const technicianRowUuid = "88888888-8888-4888-8888-888888888831";
const photo = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const sha = (c: string) => c.repeat(64);
const rowPath = (rowUuid: string) => `station_schedule.station_schedule_rows.rows.${rowUuid}.condition`;

function responses() {
  return {
    schemaVersion: 1,
    rows: [
      {
        rowUuid: configuredRowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1,
        zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "Grd Floor" },
        assetReference: "Grd Floor", conditionResult: "not_good", remarks: "",
        fieldRemarks: { conditionResult: "Grd Floor station is silent" }, sortOrder: 1
      },
      {
        rowUuid: technicianRowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null,
        zoneSnapshot: null, locationSnapshot: null,
        assetReference: "Roof", conditionResult: "good", remarks: "Write-in station",
        fieldRemarks: {}, sortOrder: 2
      }
    ],
    comments: "Accepted V7 Fire Intercom"
  };
}

function snapshot() {
  return {
    schemaVersion: 2, acceptedAt: "2026-09-06T00:00:00.000Z",
    job: { id: jobId, reference: "SV-20260906-1", title: "Primary Service Site" },
    customer: { id: customerId, code: "FI", displayName: "Intercom Customer" },
    configuration: { revisionId, revisionNumber: 1 },
    template: { id: templateId, code: "MFE-FSSR", version: 7 },
    system: { enabledSystemId: "e", key: "fire_intercom", systemKey: "fire_intercom", displayName: "Fire Intercom System", sortOrder: 11, definitionStatus: "confirmed", zones: [], locations: [{ id: locationId, zoneId: null, displayName: "Grd Floor", presetRowCount: 1, rowPreset: { assetReference: "Grd Floor" }, sortOrder: 1 }], definition, repetitionMode: "single_with_repeatable_rows" },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    contractSha256,
    evidenceManifest: [
      { photoUuid: photo(1), fieldPath: rowPath(configuredRowUuid), sourceSha256: sha("a") }
    ]
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    clientUuid, serverFormInstanceId: formInstanceId, jobId, jobReference: "SV-20260906-1", jobTitle: "Primary Service Site",
    customerName: "Intercom Customer", systemKey: "fire_intercom", instanceKey: "primary", zoneId: null, locationId: null,
    displaySequence: 1, status: "submitted", performedAt: "2026-09-06T00:00:00.000000Z", receivedAt: "2026-09-06T00:00:00.000000Z",
    templateId, configurationRevisionId: revisionId, inspectionSnapshot: snapshot(), responses: responses(),
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "browser-tech",
    ...overrides
  };
}

test("validateAcceptedFireIntercomV7Detail accepts a schema-2 record with a configured and a technician station row", () => {
  const result = validateAcceptedFireIntercomV7Detail(row());
  assert.ok(result, "the V7 reader accepts the stored authority");
  assert.equal(result!.adapter.systemKey, "fire_intercom");
  assert.deepEqual(result!.adapter.derivePoorFieldPaths(row().responses), [rowPath(configuredRowUuid)]);
  assert.equal(result!.adapter.acceptedEvidenceCaption(rowPath(configuredRowUuid)), "Station Schedule - Condition");
});

test("validateAcceptedFireIntercomV7Detail rejects a manifest that omits a current finding", () => {
  const snap = snapshot();
  snap.evidenceManifest = [];
  assert.equal(validateAcceptedFireIntercomV7Detail(row({ inspectionSnapshot: snap })), undefined);
});

test("validateAcceptedFireIntercomV7Detail rejects a response carrying header fields the paper page does not have", () => {
  const body = responses() as Record<string, unknown>;
  body.dateTested = "2026-09-06";
  assert.equal(validateAcceptedFireIntercomV7Detail(row({ responses: body })), undefined);
});

test("validateAcceptedFireIntercomV7Detail rejects a configured row whose locationSnapshot disagrees with its provenance", () => {
  const body = responses();
  body.rows[0]!.locationSnapshot = { id: technicianRowUuid, displayName: "Grd Floor" };
  assert.equal(validateAcceptedFireIntercomV7Detail(row({ responses: body })), undefined);
});

test("validateAcceptedFireIntercomV7Detail rejects a V1-V6 result token", () => {
  const body = responses();
  (body.rows[0] as Record<string, unknown>).conditionResult = "poor";
  assert.equal(validateAcceptedFireIntercomV7Detail(row({ responses: body })), undefined);
});

test("validateAcceptedFireIntercomV7Detail rejects a schema-1 snapshot, which Fire Intercom can never authentically have", () => {
  const snap = snapshot() as Record<string, unknown>;
  snap.schemaVersion = 1;
  assert.equal(validateAcceptedFireIntercomV7Detail(row({ inspectionSnapshot: snap })), undefined);
});
