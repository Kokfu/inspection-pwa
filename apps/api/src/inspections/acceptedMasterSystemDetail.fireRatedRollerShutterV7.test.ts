import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "./templates/masterServiceReportV7.js";
import { v7EvidenceContractSha256 } from "./evidence/v7EvidenceContracts.js";
import { validateAcceptedFireRatedRollerShutterV7Detail } from "./acceptedMasterSystemDetail.js";

const templateId = masterServiceReportV7.id;
const definition = masterServiceReportV7.systems.find((system) => system.key === "fire_rated_roller_shutter")!;
const contractSha256 = v7EvidenceContractSha256(definition);
const jobId = "11111111-1111-4111-8111-111111111141";
const clientUuid = "22222222-2222-4222-8222-222222222241";
const revisionId = "33333333-3333-4333-8333-333333333341";
const customerId = "44444444-4444-4444-8444-444444444441";
const formInstanceId = "55555555-5555-4555-8555-555555555541";
const locationId = "66666666-6666-4666-8666-666666666641";
const configuredRowUuid = "77777777-7777-4777-8777-777777777741";
const technicianRowUuid = "88888888-8888-4888-8888-888888888841";

function responses(schemaVersion: 1 | 2) {
  const zone = (zoneText: string) => (schemaVersion === 2 ? { zoneText } : {});
  return {
    schemaVersion, dateTested: "2026-10-09", zone: "", inspectedBy: "Inspector A",
    rows: [
      {
        rowUuid: configuredRowUuid, source: "configured", configuredLocationId: locationId, configuredRowOrdinal: 1,
        zoneSnapshot: null, locationSnapshot: { id: locationId, displayName: "General" },
        assetReference: "RS-01", locationText: "Lobby", ...zone("Zone 1"),
        autoAlarmModeResult: "good", manualModeResult: "good", remarks: "", fieldRemarks: {}, sortOrder: 1
      },
      {
        rowUuid: technicianRowUuid, source: "technician", configuredLocationId: null, configuredRowOrdinal: null,
        zoneSnapshot: null, locationSnapshot: null,
        assetReference: "", locationText: "Roof", ...zone("Zone 2"),
        autoAlarmModeResult: "good", manualModeResult: "na", remarks: "", fieldRemarks: {}, sortOrder: 2
      }
    ],
    comments: "Accepted roller shutter"
  };
}

function snapshot() {
  return {
    schemaVersion: 2, acceptedAt: "2026-10-09T00:00:00.000Z",
    job: { id: jobId, reference: "SV-20261009-1", title: "Primary Service Site" },
    customer: { id: customerId, code: "RS", displayName: "Roller Customer" },
    configuration: { revisionId, revisionNumber: 1 },
    template: { id: templateId, code: "MFE-FSSR", version: 7 },
    system: { enabledSystemId: "e", key: "fire_rated_roller_shutter", systemKey: "fire_rated_roller_shutter", displayName: "Fire Rated Roller Shutter", sortOrder: 13, definitionStatus: "confirmed", zones: [], locations: [], definition, repetitionMode: "single_with_repeatable_rows" },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    contractSha256,
    evidenceManifest: []
  };
}

function row(schemaVersion: 1 | 2, overrides: Record<string, unknown> = {}) {
  return {
    clientUuid, serverFormInstanceId: formInstanceId, jobId, jobReference: "SV-20261009-1", jobTitle: "Primary Service Site",
    customerName: "Roller Customer", systemKey: "fire_rated_roller_shutter", instanceKey: "primary", zoneId: null, locationId: null,
    displaySequence: 1, status: "submitted", performedAt: "2026-10-09T00:00:00.000000Z", receivedAt: "2026-10-09T00:00:00.000000Z",
    templateId, configurationRevisionId: revisionId, inspectionSnapshot: snapshot(), responses: responses(schemaVersion),
    deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "browser-tech",
    ...overrides
  };
}

test("accepted Roller Shutter detail reads both a schema-1 record and a schema-2 record with zone headings", () => {
  assert.ok(validateAcceptedFireRatedRollerShutterV7Detail(row(1)), "historical schema 1 stays readable");
  assert.ok(validateAcceptedFireRatedRollerShutterV7Detail(row(2)), "schema 2 with zoneText is readable");
});

test("accepted Roller Shutter detail keeps each schema's exact row key set", () => {
  const missing = responses(2);
  delete (missing.rows[1] as Record<string, unknown>).zoneText;
  assert.equal(validateAcceptedFireRatedRollerShutterV7Detail(row(2, { responses: missing })), undefined, "schema 2 requires zoneText on every row");
  const extra = responses(1);
  (extra.rows[0] as Record<string, unknown>).zoneText = "Zone 1";
  assert.equal(validateAcceptedFireRatedRollerShutterV7Detail(row(1, { responses: extra })), undefined, "schema 1 must not carry zoneText");
});

test("accepted Roller Shutter detail rejects an unknown schema version and an oversized or non-string zone heading", () => {
  const future = responses(2) as Record<string, unknown>;
  future.schemaVersion = 3;
  assert.equal(validateAcceptedFireRatedRollerShutterV7Detail(row(2, { responses: future })), undefined);
  const long = responses(2);
  (long.rows[0] as Record<string, unknown>).zoneText = "z".repeat(201);
  assert.equal(validateAcceptedFireRatedRollerShutterV7Detail(row(2, { responses: long })), undefined);
  const numeric = responses(2);
  (numeric.rows[0] as Record<string, unknown>).zoneText = 7;
  assert.equal(validateAcceptedFireRatedRollerShutterV7Detail(row(2, { responses: numeric })), undefined);
});
