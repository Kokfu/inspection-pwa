import assert from "node:assert/strict";
import test from "node:test";
import { JOB_CUSTOMER_SNAPSHOT_KEYS, type JobCustomerSnapshot } from "../src/jobs/jobTypes.ts";
import {
  CUSTOMER_SNAPSHOT_BASE_KEYS, CUSTOMER_SNAPSHOT_DETAIL_KEYS, hasValidCustomerSnapshotKeys
} from "../../api/src/inspections/customerSnapshot";
import { portableFireExtinguisherV5 } from "../../api/src/inspections/templates/masterServiceReportV5";
import { validatePortableSyncItemForTest } from "../../api/src/sync/portableFireExtinguisherSync";

/**
 * FR-12 guard. Portable Fire Extinguisher (and legacy Hydrant / Fire Alarm) copy the job's
 * frozen `configurationSnapshot.customer` straight into the queued sync payload, and the API
 * refuses any key set it does not know. If the customer snapshot gains or loses a key on the
 * web side and the API validator is not changed with it, every such record fails at sync.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// The newest customer a job can freeze: one value per key the web type declares.
const webCustomer = (): JobCustomerSnapshot => ({
  id: id(2), code: "C-1", displayName: "Customer A",
  contactPhone: "03-111", contactPerson: "Contact A", fax: "03-222", contractNumber: "C-42", serviceFrequency: "ANNUALLY"
});

function portableItem(customer: unknown) {
  const at = "2026-08-11T00:00:00.000Z";
  const jobId = id(1), templateId = id(3), revisionId = id(4), enabledSystemId = id(5), clientUuid = id(6);
  return { operationId: id(7), entityType: "masterSystemInspection", entityId: clientUuid, action: "create", payload: {
    clientUuid, jobId, systemKey: "portable_fire_extinguisher", instanceKey: "primary", configuredZoneId: null, configuredLocationId: null, displaySequence: 1,
    originalCreatorSnapshot: null, masterTemplate: { id: templateId, code: "MFE-FSSR", version: 5 }, configuration: { revisionId, revisionNumber: 1 },
    inspectionSnapshot: { schemaVersion: 1, capturedAt: at, job: { id: jobId, reference: "P", title: "P" }, customer,
      configuration: { revisionId, revisionNumber: 1 }, template: { id: templateId, code: "MFE-FSSR", name: "MFE", version: 5 },
      system: { enabledSystemId, systemKey: "portable_fire_extinguisher", displayName: "Portable Fire Extinguisher", sortOrder: 9, definitionStatus: "confirmed", zones: [], locations: [], definition: portableFireExtinguisherV5, repetitionMode: "single_quantity_summary" } },
    responses: { schemaVersion: 1, total: 1, dryPowder9kg: null, co2_2kg: null, others: "", comments: "" }, performedAt: at
  } };
}

test("web customer snapshot keys equal the API validator's known keys", () => {
  assert.deepEqual([...JOB_CUSTOMER_SNAPSHOT_KEYS].sort(), [...CUSTOMER_SNAPSHOT_BASE_KEYS, ...CUSTOMER_SNAPSHOT_DETAIL_KEYS].sort());
  assert.deepEqual(Object.keys(webCustomer()).sort(), [...JOB_CUSTOMER_SNAPSHOT_KEYS].sort());
});

test("a customer built from every web snapshot key passes the API key check and the Portable sync validator", () => {
  assert.equal(hasValidCustomerSnapshotKeys(webCustomer()), true);
  const result = validatePortableSyncItemForTest(portableItem(webCustomer()));
  assert.ok(result.payload, JSON.stringify(result.failure));
  const legacy = { id: id(2), code: "C-1", displayName: "Customer A" };
  assert.ok(validatePortableSyncItemForTest(portableItem(legacy)).payload, "legacy three-key snapshots keep syncing");
});

test("the API still refuses a key the web type does not declare", () => {
  assert.equal(validatePortableSyncItemForTest(portableItem({ ...webCustomer(), notAWebKey: "x" })).payload, undefined);
});
