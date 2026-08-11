import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db/pool.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { masterServiceReportV1 } from "../inspections/templates/masterServiceReportV1.js";
import { syncCo2FormInstances } from "./co2FormInstanceSync.js";

type R = Record<string, any>;
let number = 9500;
const id = () => `00000000-0000-4000-8000-${String(number++).padStart(12, "0")}`;
const definition = masterServiceReportV1.systems.find((system) => system.key === "co2_fire_extinguisher")!;

test("existing valid CO2 envelope remains accepted by the shared form-instance handler", async () => {
  const jobId = id(), templateId = id(), revisionId = id(), zoneId = id(), locationId = id(), clientUuid = id();
  const system = { systemKey: "co2_fire_extinguisher", displayName: "CO2", definitionStatus: "confirmed", zones: [{ id: zoneId, key: "zone", displayName: "Zone", sortOrder: 1 }], locations: [{ id: locationId, zoneId, key: "location", displayName: "Location", sortOrder: 1 }] };
  const snapshot = { customer: { id: id(), code: "CO2", displayName: "CO2" }, configuration: { revisionId, revisionNumber: 1 }, template: { id: templateId, code: "MFE-FSSR", version: 1 }, enabledSystems: [system] };
  const controls = resolveCo2Controls(definition, "MFE-FSSR", 1);
  const checklist = (items: Array<{ key: string }>) => Object.fromEntries(items.map((item) => [item.key, { result: "good", remarks: "" }]));
  const item: any = { operationId: id(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create", payload: { clientUuid, jobId, systemKey: "co2_fire_extinguisher", instanceKey: `location:${locationId}`, configuredZoneId: zoneId, configuredLocationId: locationId, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: templateId, code: "MFE-FSSR", version: 1 }, configuration: { revisionId, revisionNumber: 1 }, inspectionSnapshot: { retainedClientSnapshot: true }, responses: { controlPanelLocation: "Location", detectorRows: [{ rowUuid: id(), displaySequence: 1, alarmZone: "Zone", location: "Location", heatDetectorStatus: "normal", smokeDetectorStatus: null, remarks: "" }], chargerAndBatteries: checklist(controls.chargerAndBatteries), physicalOutlook: checklist(controls.physicalOutlook), mainFunctionKeys: checklist(controls.mainFunctionKeys), comments: "" }, performedAt: "2026-08-11T00:00:00.000Z" } };
  const forms = new Map<string, R>(); let groupId: string | undefined;
  const database = pool as unknown as { connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number; rows: R[] }>; release: () => void }> };
  const originalConnect = database.connect;
  database.connect = async () => ({ query: async (sql, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT status, job_reference")) return { rowCount: 1, rows: [{ status: "open", job_reference: "CO2", title: "CO2", master_template_version_id: templateId, customer_configuration_revision_id: revisionId, configuration_snapshot: snapshot }] };
    if (sql.startsWith("SELECT definition")) return { rowCount: 1, rows: [{ definition, definition_status: "confirmed" }] };
    if (sql.startsWith("SELECT request_fingerprint")) { const form = forms.get(values[0]); return { rowCount: form ? 1 : 0, rows: form ? [{ request_fingerprint: form.fingerprint }] : [] }; }
    if (sql.startsWith("INSERT INTO master_system_inspections")) { groupId = values[0]; return { rowCount: 1, rows: [] }; }
    if (sql.startsWith("SELECT id FROM master_system_inspections")) return { rowCount: groupId ? 1 : 0, rows: groupId ? [{ id: groupId }] : [] };
    if (sql.startsWith("SELECT 1 FROM master_system_form_instances")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("INSERT INTO master_system_form_instances")) { forms.set(values[2], { fingerprint: values[13] }); return { rowCount: 1, rows: [] }; }
    throw new Error(`Unexpected query ${sql}`);
  }, release: () => undefined });
  try {
    assert.deepEqual(await syncCo2FormInstances([item], 42), { acceptedIds: [clientUuid], duplicateIds: [], failed: [] });
    assert.equal(forms.size, 1);
  } finally { database.connect = originalConnect; }
});
