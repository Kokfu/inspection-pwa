import assert from "node:assert/strict";
import test from "node:test";
import { resolveFm200Controls } from "../inspections/templates/fm200DefinitionControls.js";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { pool } from "../db/pool.js";
import { syncFm200FormInstances } from "./fm200FormInstanceSync.js";

type R = Record<string, any>;
let number = 9700;
const id = () => `00000000-0000-4000-8000-${String(number++).padStart(12, "0")}`;
const definition = masterServiceReportV7.systems.find((system) => system.key === "fm200_fire_suppression")!;

test("a valid FM200 V7 envelope is accepted by its own dedicated handler, independent of CO2", async () => {
  const jobId = id(), templateId = masterServiceReportV7.id, revisionId = id(), zoneId = id(), locationId = id(), clientUuid = id();
  const system = { systemKey: "fm200_fire_suppression", displayName: "FM200 System", definitionStatus: "confirmed", zones: [{ id: zoneId, key: "zone", displayName: "Zone", sortOrder: 1 }], locations: [{ id: locationId, zoneId, key: "location", displayName: "Location", sortOrder: 1 }] };
  const snapshot = { customer: { id: id(), code: "FM200", displayName: "FM200" }, configuration: { revisionId, revisionNumber: 1 }, template: { id: templateId, code: "MFE-FSSR", version: 7 }, enabledSystems: [system] };
  const controls = resolveFm200Controls(definition, "MFE-FSSR", 7);
  const checklist = (items: Array<{ key: string }>) => Object.fromEntries(items.map((item) => [item.key, { result: "good", remarks: "" }]));
  const item: any = { operationId: id(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create", payload: { clientUuid, jobId, systemKey: "fm200_fire_suppression", instanceKey: `location:${locationId}`, configuredZoneId: zoneId, configuredLocationId: locationId, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: templateId, code: "MFE-FSSR", version: 7 }, configuration: { revisionId, revisionNumber: 1 }, inspectionSnapshot: { retainedClientSnapshot: true }, responses: { controlPanelLocation: "Location", detectorRows: [{ rowUuid: id(), displaySequence: 1, alarmZone: "Zone", location: "Location", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }], chargerAndBatteries: checklist(controls.chargerAndBatteries), physicalOutlook: checklist(controls.physicalOutlook), mainFunctionKeys: checklist(controls.mainFunctionKeys), comments: "" }, evidenceManifest: [], performedAt: "2026-08-11T00:00:00.000Z" } };
  const forms = new Map<string, R>(); let groupId: string | undefined;
  const database = pool as unknown as { connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number; rows: R[] }>; release: () => void }> };
  const originalConnect = database.connect;
  database.connect = async () => ({ query: async (sql, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT instance.request_fingerprint,instance.synced_by_user_id")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT status, job_reference")) return { rowCount: 1, rows: [{ status: "open", job_reference: "FM200", title: "FM200", master_template_version_id: templateId, customer_configuration_revision_id: revisionId, configuration_snapshot: snapshot }] };
    if (sql.startsWith("SELECT definition")) return { rowCount: 1, rows: [{ definition, definition_status: "confirmed" }] };
    if (sql.startsWith("SELECT job_id,system_key,master_template_version_id")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT request_fingerprint")) { const form = forms.get(values[0]); return { rowCount: form ? 1 : 0, rows: form ? [{ request_fingerprint: form.fingerprint }] : [] }; }
    if (sql.startsWith("INSERT INTO master_system_inspections")) { groupId = values[0]; return { rowCount: 1, rows: [] }; }
    if (sql.startsWith("SELECT id FROM master_system_inspections")) return { rowCount: groupId ? 1 : 0, rows: groupId ? [{ id: groupId }] : [] };
    if (sql.startsWith("SELECT 1 FROM master_system_form_instances")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("INSERT INTO master_system_form_instances")) { forms.set(values[2], { fingerprint: values[14] }); return { rowCount: 1, rows: [] }; }
    throw new Error(`Unexpected query ${sql}`);
  }, release: () => undefined });
  try {
    assert.deepEqual(await syncFm200FormInstances([item], 42), { acceptedIds: [clientUuid], duplicateIds: [], failed: [] });
    assert.equal(forms.size, 1);
  } finally { database.connect = originalConnect; }
});

// An empty evidence manifest requires no reservation lookup - a clean FM200
// form (no findings) never stages a photo, so acceptance must not require one.
test("a replayed FM200 envelope with the same data is idempotent, not a new row", async () => {
  const jobId = id(), templateId = masterServiceReportV7.id, revisionId = id(), zoneId = id(), locationId = id(), clientUuid = id();
  const system = { systemKey: "fm200_fire_suppression", displayName: "FM200 System", definitionStatus: "confirmed", zones: [{ id: zoneId, key: "zone", displayName: "Zone", sortOrder: 1 }], locations: [{ id: locationId, zoneId, key: "location", displayName: "Location", sortOrder: 1 }] };
  const snapshot = { customer: { id: id(), code: "FM200", displayName: "FM200" }, configuration: { revisionId, revisionNumber: 1 }, template: { id: templateId, code: "MFE-FSSR", version: 7 }, enabledSystems: [system] };
  const controls = resolveFm200Controls(definition, "MFE-FSSR", 7);
  const checklist = (items: Array<{ key: string }>) => Object.fromEntries(items.map((item) => [item.key, { result: "good", remarks: "" }]));
  const item: any = { operationId: id(), entityType: "masterSystemFormInstance", entityId: clientUuid, action: "create", payload: { clientUuid, jobId, systemKey: "fm200_fire_suppression", instanceKey: `location:${locationId}`, configuredZoneId: zoneId, configuredLocationId: locationId, displaySequence: 1, originalCreatorSnapshot: null, masterTemplate: { id: templateId, code: "MFE-FSSR", version: 7 }, configuration: { revisionId, revisionNumber: 1 }, inspectionSnapshot: { retainedClientSnapshot: true }, responses: { controlPanelLocation: "Location", detectorRows: [{ rowUuid: id(), displaySequence: 1, alarmZone: "Zone", location: "Location", heatDetectorStatus: ["normal"], smokeDetectorStatus: ["normal"], remarks: "" }], chargerAndBatteries: checklist(controls.chargerAndBatteries), physicalOutlook: checklist(controls.physicalOutlook), mainFunctionKeys: checklist(controls.mainFunctionKeys), comments: "" }, evidenceManifest: [], performedAt: "2026-08-11T00:00:00.000Z" } };
  const forms = new Map<string, R>(); let groupId: string | undefined;
  const database = pool as unknown as { connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number; rows: R[] }>; release: () => void }> };
  const originalConnect = database.connect;
  database.connect = async () => ({ query: async (sql, values: any[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT instance.request_fingerprint,instance.synced_by_user_id")) { const form = forms.get(values[0]); return { rowCount: form ? 1 : 0, rows: form ? [{ request_fingerprint: form.fingerprint, synced_by_user_id: "42" }] : [] }; }
    if (sql.startsWith("SELECT status, job_reference")) return { rowCount: 1, rows: [{ status: "open", job_reference: "FM200", title: "FM200", master_template_version_id: templateId, customer_configuration_revision_id: revisionId, configuration_snapshot: snapshot }] };
    if (sql.startsWith("SELECT definition")) return { rowCount: 1, rows: [{ definition, definition_status: "confirmed" }] };
    if (sql.startsWith("SELECT job_id,system_key,master_template_version_id")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT request_fingerprint")) { const form = forms.get(values[0]); return { rowCount: form ? 1 : 0, rows: form ? [{ request_fingerprint: form.fingerprint }] : [] }; }
    if (sql.startsWith("INSERT INTO master_system_inspections")) { groupId = values[0]; return { rowCount: 1, rows: [] }; }
    if (sql.startsWith("SELECT id FROM master_system_inspections")) return { rowCount: groupId ? 1 : 0, rows: groupId ? [{ id: groupId }] : [] };
    if (sql.startsWith("SELECT 1 FROM master_system_form_instances")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("INSERT INTO master_system_form_instances")) { forms.set(values[2], { fingerprint: values[14] }); return { rowCount: 1, rows: [] }; }
    throw new Error(`Unexpected query ${sql}`);
  }, release: () => undefined });
  try {
    assert.deepEqual(await syncFm200FormInstances([item], 42), { acceptedIds: [clientUuid], duplicateIds: [], failed: [] });
    assert.deepEqual(await syncFm200FormInstances([item], 42), { acceptedIds: [], duplicateIds: [clientUuid], failed: [] });
    assert.equal(forms.size, 1);
  } finally { database.connect = originalConnect; }
});
