import assert from "node:assert/strict";
import test from "node:test";
import { portableFireExtinguisherV5 } from "../inspections/templates/masterServiceReportV5.js";
import {
  CUSTOMER_SNAPSHOT_BASE_KEYS, CUSTOMER_SNAPSHOT_DETAIL_KEYS, hasValidCustomerSnapshotKeys
} from "../inspections/customerSnapshot.js";
import { validatePortableSyncItemForTest } from "./portableFireExtinguisherSync.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const legacyCustomer = () => ({ id: id(2), code: "TEST", displayName: "Test" });
const detailedCustomer = () => ({ ...legacyCustomer(), fax: "03-222", contactPhone: "03-111", contactPerson: "Contact A", contractNumber: "C-42", serviceFrequency: "MONTHLY" });
const nullCustomer = () => ({ ...legacyCustomer(), fax: null, contactPhone: null, contactPerson: null, contractNumber: null, serviceFrequency: null });

function item(customer: Record<string, unknown>) {
  const at = "2026-08-11T00:00:00.000Z";
  const jobId = id(1), templateId = id(3), revisionId = id(4), enabledSystemId = id(5), clientUuid = id(6);
  return { operationId: id(7), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId, systemKey: "portable_fire_extinguisher", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: { source: "device_reported", userId: 1, username: "inspector", role: "inspector", capturedAt: at },
    masterTemplate: { id: templateId, code: "MFE-FSSR", version: 5 }, configuration: { revisionId, revisionNumber: 1 },
    inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "PORTABLE", title: "Portable" }, customer,
      configuration: { revisionId, revisionNumber: 1 }, template: { id: templateId, code: "MFE-FSSR", name: "MFE Fire System Service Report Template", version: 5 },
      system: { enabledSystemId, systemKey: "portable_fire_extinguisher", displayName: "Portable Fire Extinguisher", sortOrder: 9, definitionStatus: "confirmed", zones: [], locations: [], definition: portableFireExtinguisherV5, repetitionMode: "single_quantity_summary" } },
    responses: { schemaVersion: 1, total: 1, dryPowder9kg: 1, co2_2kg: 0, others: "", comments: "" }, performedAt: at
  } };
}

test("Portable sync accepts the legacy 3-key, the full detailed and the all-null customer snapshot", () => {
  for (const [name, customer] of [["legacy", legacyCustomer()], ["detailed", detailedCustomer()], ["all null", nullCustomer()]] as const) {
    const result = validatePortableSyncItemForTest(item(customer));
    assert.ok(result.payload, `${name}: ${JSON.stringify(result.failure)}`);
  }
  for (const serviceFrequency of ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY", null]) {
    assert.ok(validatePortableSyncItemForTest(item({ ...detailedCustomer(), serviceFrequency })).payload, String(serviceFrequency));
  }
});

test("Portable sync still refuses unknown, partial, mistyped, over-long and blank customer snapshots", () => {
  const rejects: Array<[string, Record<string, unknown>]> = [
    ["unknown key on legacy", { ...legacyCustomer(), extra: "x" }],
    ["unknown key on detailed", { ...detailedCustomer(), extra: "x" }],
    ["partial detail set", { ...legacyCustomer(), fax: "03-222" }],
    ["missing one detail key", (() => { const { fax: _fax, ...rest } = detailedCustomer(); return { ...rest, other: null }; })()],
    ["non-string fax", { ...detailedCustomer(), fax: 3222 }],
    ["non-string contactPhone", { ...detailedCustomer(), contactPhone: {} }],
    ["undefined contactPerson", { ...detailedCustomer(), contactPerson: undefined }],
    ["bad serviceFrequency", { ...detailedCustomer(), serviceFrequency: "WEEKLY" }],
    ["lowercase serviceFrequency", { ...detailedCustomer(), serviceFrequency: "monthly" }],
    ["numeric serviceFrequency", { ...detailedCustomer(), serviceFrequency: 1 }],
    ["over-long fax", { ...detailedCustomer(), fax: "x".repeat(41) }],
    ["over-long contactPhone", { ...detailedCustomer(), contactPhone: "x".repeat(41) }],
    ["over-long contactPerson", { ...detailedCustomer(), contactPerson: "x".repeat(161) }],
    ["over-long contractNumber", { ...detailedCustomer(), contractNumber: "x".repeat(161) }],
    ["blank contractNumber", { ...detailedCustomer(), contractNumber: "  " }],
    ["bad customer id", { ...detailedCustomer(), id: "not-a-uuid" }],
    ["missing displayName", (() => { const { displayName: _name, ...rest } = detailedCustomer(); return rest; })()]
  ];
  for (const [name, customer] of rejects) {
    const result = validatePortableSyncItemForTest(item(customer));
    assert.equal(result.payload, undefined, name);
    assert.equal(result.failure?.code, "VALIDATION_ERROR", name);
  }
});

test("customer snapshot key sets are the legacy three or exactly the three plus the five known detail keys", () => {
  assert.deepEqual([...CUSTOMER_SNAPSHOT_BASE_KEYS], ["id", "code", "displayName"]);
  assert.deepEqual([...CUSTOMER_SNAPSHOT_DETAIL_KEYS], ["contactPhone", "contactPerson", "fax", "contractNumber", "serviceFrequency"]);
  assert.equal(hasValidCustomerSnapshotKeys(legacyCustomer()), true);
  assert.equal(hasValidCustomerSnapshotKeys(detailedCustomer()), true);
  assert.equal(hasValidCustomerSnapshotKeys(null), false);
  assert.equal(hasValidCustomerSnapshotKeys([]), false);
  assert.equal(hasValidCustomerSnapshotKeys({ ...detailedCustomer(), extra: 1 }), false);
});
