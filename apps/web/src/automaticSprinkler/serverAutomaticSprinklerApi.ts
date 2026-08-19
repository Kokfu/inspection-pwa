import type { AutomaticSprinklerResponses, ResolvedAutomaticSprinklerControls } from "./automaticSprinklerTypes";

type UnknownRecord = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const timestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;
const maxText = 250;
const maxRemarks = 2000;
const maxComments = 4000;
const maxAttachmentBytes = 2 * 1024 * 1024;
const maxAttachmentEdge = 1600;
const policyId = "00000000-0000-4000-8000-000000000710";
const policyHash = "f280882235b680cc4f7d89704e96e305afe95b0638d4cd13577abddd6ae197d8";
const waterTank = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"] as const;
const pumpHouse = ["pump_house_clean", "manual_start_pumps", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"] as const;
const mainAlarmValve = ["breaching_inlet", "alarm_gong", "flow_meter_valve_positions"] as const;
const measurementKeys = ["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "water_supply_gauge", "installation_gauge"] as const;
const measurementSortOrders: Readonly<Record<(typeof measurementKeys)[number], number>> = { jockey_pump_pressure: 1, duty_pump_cut_in: 2, standby_pump_cut_in: 3, water_supply_gauge: 1, installation_gauge: 2 };
const evidencePaths = ["measurements.jockey_pump_pressure.cut_in", "measurements.jockey_pump_pressure.cut_out", "measurements.duty_pump_cut_in.value", "measurements.standby_pump_cut_in.value", "measurements.water_supply_gauge.value", "measurements.installation_gauge.value"] as const;

export type ServerInspectionAttachment = { serverAttachmentId: string; photoUuid: string; inspectionClientUuid: string; status: "accepted"; fieldPath: string; captureSource: "camera" | "gallery" | "unknown"; mimeType: "image/jpeg"; sizeBytes: number; width: number; height: number; sourceSha256: string; storedSha256: string; capturedAt: string; receivedAt: string };
type ServerEvidencePolicy = { id: string; version: 1; definition: { schemaVersion: 1; code: "automatic-sprinkler-psi-evidence"; version: 1; systemKey: "automatic_sprinkler"; points: Record<(typeof evidencePaths)[number], { allowed: true; required: false; maxCount: 1 }> }; definitionSha256: string };
export type ServerAutomaticSprinklerDetail = { clientUuid: string; serverFormInstanceId: string; jobId: string; jobReference: string; jobTitle: string; customerName: string; systemKey: "automatic_sprinkler"; systemLabel: string; instanceKey: "primary"; status: "submitted"; performedAt: string; receivedAt: string; responses: AutomaticSprinklerResponses; displayControls: ResolvedAutomaticSprinklerControls; deviceReportedCreatorUsername: string | null; verifiedOriginalCreatorUsername: string | null; syncedByUsername: string; evidencePolicy: ServerEvidencePolicy | null; attachments: ServerInspectionAttachment[] };

export class ServerInspectionNotFoundError extends Error {}
export class InvalidServerInspectionDetailError extends Error {}
export function serverAttachmentContentUrl(photoUuid: string) { return `/api/inspection-attachments/${encodeURIComponent(photoUuid)}/content`; }
const record = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: UnknownRecord, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const text = (value: unknown, limit = maxText): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const optionalText = (value: unknown) => value === null || text(value);
const canonicalTimestamp = (value: unknown): value is string => typeof value === "string" && timestamp.test(value) && !Number.isNaN(Date.parse(value));
const positiveInt = (value: unknown, max: number) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;
const exactKeys = (value: unknown, keys: readonly string[]): value is UnknownRecord => record(value) && exact(value, keys);

function parseRow(value: unknown) {
  return exactKeys(value, ["result", "remarks"]) && (value.result === "good" || value.result === "poor") && typeof value.remarks === "string" && value.remarks.length <= maxRemarks
    ? { result: value.result, remarks: value.remarks } as const : undefined;
}
function parseRows(value: unknown, keys: readonly string[]) {
  if (!exactKeys(value, keys)) return undefined;
  const result: Record<string, { result: "good" | "poor"; remarks: string }> = {};
  for (const key of keys) { const row = parseRow(value[key]); if (!row) return undefined; result[key] = row; }
  return result;
}
function parseResponses(value: unknown): AutomaticSprinklerResponses | undefined {
  if (!exactKeys(value, ["schemaVersion", "waterTank", "pumpHouse", "measurements", "mainAlarmValve", "comments"]) || value.schemaVersion !== 1 || typeof value.comments !== "string" || value.comments.length > maxComments) return undefined;
  const water = parseRows(value.waterTank, waterTank), pump = parseRows(value.pumpHouse, pumpHouse), valve = parseRows(value.mainAlarmValve, mainAlarmValve);
  if (!water || !pump || !valve || !exactKeys(value.measurements, measurementKeys)) return undefined;
  const measurements: Record<string, { values: Record<string, number>; unit: "PSI"; result: "good" | "poor"; remarks: string }> = {};
  for (const key of measurementKeys) {
    const memberKeys = key === "jockey_pump_pressure" ? ["cut_in", "cut_out"] : ["value"];
    const item = value.measurements[key];
    if (!exactKeys(item, ["values", "unit", "result", "remarks"])) return undefined;
    const values = item.values;
    // The authoritative v1 control contract requires a finite PSI reading but
    // defines no minimum or maximum. Keep accepted-detail reads aligned with
    // the local submit and server acceptance validators.
    if (!exactKeys(values, memberKeys) || item.unit !== "PSI" || (item.result !== "good" && item.result !== "poor") || typeof item.remarks !== "string" || item.remarks.length > maxRemarks || memberKeys.some((member) => typeof values[member] !== "number" || !Number.isFinite(values[member]))) return undefined;
    measurements[key] = { values: values as Record<string, number>, unit: "PSI", result: item.result, remarks: item.remarks };
  }
  return { schemaVersion: 1, waterTank: water as AutomaticSprinklerResponses["waterTank"], pumpHouse: pump as AutomaticSprinklerResponses["pumpHouse"], measurements: measurements as AutomaticSprinklerResponses["measurements"], mainAlarmValve: valve as AutomaticSprinklerResponses["mainAlarmValve"], comments: value.comments };
}
function parseControls(value: unknown): ResolvedAutomaticSprinklerControls | undefined {
  if (!exactKeys(value, ["schemaVersion", "source", "repetitionMode", "instance", "checklist", "measurements", "layout", "comments"]) || value.schemaVersion !== 1 || value.repetitionMode !== "single" || !exactKeys(value.source, ["templateCode", "templateVersion", "systemKey"]) || value.source.templateCode !== "MFE-FSSR" || value.source.templateVersion !== 1 || value.source.systemKey !== "automatic_sprinkler" || !exactKeys(value.instance, ["key", "displaySequence", "zoneId", "locationId"]) || value.instance.key !== "primary" || value.instance.displaySequence !== 1 || value.instance.zoneId !== null || value.instance.locationId !== null || !exactKeys(value.checklist, ["waterTank", "pumpHouse", "mainAlarmValve"]) || !Array.isArray(value.measurements) || !exactKeys(value.layout, ["waterTank", "pumpHouse", "mainAlarmValve"]) || !exactKeys(value.comments, ["policy", "maxLength"]) || value.comments.policy !== "optional" || value.comments.maxLength !== maxComments) return undefined;
  const validateDefinitions = (items: unknown, keys: readonly string[]) => Array.isArray(items) && items.length === keys.length && items.every((item, index) => exactKeys(item, ["key", "label", "sortOrder", "result", "remarks"]) && item.key === keys[index] && text(item.label) && item.sortOrder === index + 1 && exactKeys(item.result, ["type", "required", "options"]) && item.result.type === "single_select" && item.result.required === true && Array.isArray(item.result.options) && item.result.options.length === 2 && item.result.options[0]?.value === "good" && item.result.options[0]?.label === "Good" && item.result.options[1]?.value === "poor" && item.result.options[1]?.label === "Poor" && exactKeys(item.remarks, ["policy", "maxLength"]) && item.remarks.policy === "optional" && item.remarks.maxLength === maxRemarks);
  if (!validateDefinitions(value.checklist.waterTank, waterTank) || !validateDefinitions(value.checklist.pumpHouse, pumpHouse) || !validateDefinitions(value.checklist.mainAlarmValve, mainAlarmValve) || value.measurements.length !== measurementKeys.length) return undefined;
  const resultAndRemarks = (item: UnknownRecord) => exactKeys(item.result, ["type", "required", "options"]) && item.result.type === "single_select" && item.result.required === true && Array.isArray(item.result.options) && item.result.options.length === 2 && item.result.options[0]?.value === "good" && item.result.options[0]?.label === "Good" && item.result.options[1]?.value === "poor" && item.result.options[1]?.label === "Poor" && exactKeys(item.remarks, ["policy", "maxLength"]) && item.remarks.policy === "optional" && item.remarks.maxLength === maxRemarks;
  if (!value.measurements.every((item, index) => { const expectedKey = measurementKeys[index]; const keys = expectedKey === "jockey_pump_pressure" ? ["cut_in", "cut_out"] : ["value"]; return exactKeys(item, ["key", "label", "sortOrder", "values", "result", "remarks"]) && item.key === expectedKey && text(item.label) && item.sortOrder === measurementSortOrders[expectedKey] && Array.isArray(item.values) && item.values.length === keys.length && item.values.every((entry, entryIndex) => exactKeys(entry, ["key", "label", "unit", "required"]) && entry.key === keys[entryIndex] && text(entry.label) && entry.unit === "PSI" && entry.required === true) && resultAndRemarks(item); })) return undefined;
  const layoutKeys = { waterTank, pumpHouse: ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"], mainAlarmValve: ["breaching_inlet", "alarm_gong", "water_supply_gauge", "installation_gauge", "flow_meter_valve_positions"] };
  for (const [section, keys] of Object.entries(layoutKeys)) if (!Array.isArray(value.layout[section]) || value.layout[section].length !== keys.length || !value.layout[section].every((row, index) => exactKeys(row, ["kind", "key"]) && row.key === keys[index] && row.kind === (measurementKeys.includes(row.key as typeof measurementKeys[number]) ? "measurement" : "checklist"))) return undefined;
  return value as ResolvedAutomaticSprinklerControls;
}
function parseEvidencePolicy(value: UnknownRecord) {
  const none = value.evidencePolicyId === null && value.evidencePolicyVersion === null && value.evidencePolicyDefinition === null && value.evidencePolicySha256 === null;
  if (none) return null;
  if (!text(value.evidencePolicyId) || value.evidencePolicyId !== policyId || value.evidencePolicyVersion !== 1 || value.evidencePolicySha256 !== policyHash || !exactKeys(value.evidencePolicyDefinition, ["schemaVersion", "code", "version", "systemKey", "points"]) || value.evidencePolicyDefinition.schemaVersion !== 1 || value.evidencePolicyDefinition.code !== "automatic-sprinkler-psi-evidence" || value.evidencePolicyDefinition.version !== 1 || value.evidencePolicyDefinition.systemKey !== "automatic_sprinkler" || !exactKeys(value.evidencePolicyDefinition.points, evidencePaths)) return undefined;
  for (const path of evidencePaths) { const point = value.evidencePolicyDefinition.points[path]; if (!exactKeys(point, ["allowed", "required", "maxCount"]) || point.allowed !== true || point.required !== false || point.maxCount !== 1) return undefined; }
  return { id: policyId, version: 1 as const, definition: value.evidencePolicyDefinition as ServerEvidencePolicy["definition"], definitionSha256: policyHash };
}
export function parseServerAutomaticSprinklerDetail(value: unknown): ServerAutomaticSprinklerDetail | undefined {
  const keys = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerName", "systemKey", "systemLabel", "instanceKey", "status", "performedAt", "receivedAt", "responses", "displayControls", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername", "evidencePolicyId", "evidencePolicyVersion", "evidencePolicyDefinition", "evidencePolicySha256"];
  if (!exactKeys(value, keys) || !text(value.clientUuid) || !uuid.test(value.clientUuid) || !text(value.serverFormInstanceId) || !uuid.test(value.serverFormInstanceId) || !text(value.jobId) || !uuid.test(value.jobId) || !text(value.jobReference) || !text(value.jobTitle) || !text(value.customerName) || value.systemKey !== "automatic_sprinkler" || !text(value.systemLabel) || value.instanceKey !== "primary" || value.status !== "submitted" || !canonicalTimestamp(value.performedAt) || !canonicalTimestamp(value.receivedAt) || !optionalText(value.deviceReportedCreatorUsername) || !optionalText(value.verifiedOriginalCreatorUsername) || !text(value.syncedByUsername)) return undefined;
  const responses = parseResponses(value.responses), displayControls = parseControls(value.displayControls), evidencePolicy = parseEvidencePolicy(value);
  if (!responses || !displayControls || evidencePolicy === undefined) return undefined;
  return { clientUuid: value.clientUuid, serverFormInstanceId: value.serverFormInstanceId, jobId: value.jobId, jobReference: value.jobReference, jobTitle: value.jobTitle, customerName: value.customerName, systemKey: "automatic_sprinkler", systemLabel: value.systemLabel, instanceKey: "primary", status: "submitted", performedAt: value.performedAt, receivedAt: value.receivedAt, responses, displayControls, deviceReportedCreatorUsername: value.deviceReportedCreatorUsername, verifiedOriginalCreatorUsername: value.verifiedOriginalCreatorUsername, syncedByUsername: value.syncedByUsername, evidencePolicy, attachments: [] };
}
export function parseServerAutomaticSprinklerAttachments(value: unknown, inspection: ServerAutomaticSprinklerDetail): ServerInspectionAttachment[] | undefined {
  if (!exactKeys(value, ["attachments"]) || !Array.isArray(value.attachments) || value.attachments.length > evidencePaths.length) return undefined;
  const seenIds = new Set<string>(), seenPaths = new Set<string>(); const attachments: ServerInspectionAttachment[] = [];
  for (const item of value.attachments) {
    if (!exactKeys(item, ["serverAttachmentId", "photoUuid", "inspectionClientUuid", "status", "fieldPath", "captureSource", "mimeType", "sizeBytes", "width", "height", "sourceSha256", "storedSha256", "capturedAt", "receivedAt"]) || !text(item.serverAttachmentId) || !uuid.test(item.serverAttachmentId) || !text(item.photoUuid) || !uuid.test(item.photoUuid) || !text(item.inspectionClientUuid) || !uuid.test(item.inspectionClientUuid) || item.inspectionClientUuid !== inspection.clientUuid || item.status !== "accepted" || !text(item.fieldPath) || !evidencePaths.includes(item.fieldPath as typeof evidencePaths[number]) || typeof item.captureSource !== "string" || !["camera", "gallery", "unknown"].includes(item.captureSource) || item.mimeType !== "image/jpeg" || !positiveInt(item.sizeBytes, maxAttachmentBytes) || !positiveInt(item.width, maxAttachmentEdge) || !positiveInt(item.height, maxAttachmentEdge) || typeof item.sourceSha256 !== "string" || !sha256.test(item.sourceSha256) || typeof item.storedSha256 !== "string" || !sha256.test(item.storedSha256) || !canonicalTimestamp(item.capturedAt) || !canonicalTimestamp(item.receivedAt) || seenIds.has(item.photoUuid) || seenPaths.has(item.fieldPath) || !inspection.evidencePolicy) return undefined;
    seenIds.add(item.photoUuid); seenPaths.add(item.fieldPath); attachments.push(item as ServerInspectionAttachment);
  }
  return attachments;
}
async function loadServerAttachments(clientUuid: string, inspection: ServerAutomaticSprinklerDetail) {
  const response = await fetch(`/api/inspection-attachments?inspectionClientUuid=${encodeURIComponent(clientUuid)}`, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401 || response.status === 403) throw new Error("Sign in required to view server photos");
  if (!response.ok) throw new Error(`Server photo listing failed: ${response.status}`);
  const attachments = parseServerAutomaticSprinklerAttachments(await response.json(), inspection);
  if (!attachments) throw new InvalidServerInspectionDetailError("Server returned invalid Automatic Sprinkler photo metadata");
  return attachments;
}
export async function loadServerAutomaticSprinklerDetail(clientUuid: string): Promise<ServerAutomaticSprinklerDetail> {
  if (!uuid.test(clientUuid)) throw new InvalidServerInspectionDetailError("Inspection identifier is invalid");
  const response = await fetch(`/api/master-system-inspections/${encodeURIComponent(clientUuid)}`, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 404) throw new ServerInspectionNotFoundError("Inspection was not found on the server");
  if (response.status === 401 || response.status === 403) throw new Error("Sign in required to view this inspection");
  if (!response.ok) throw new Error(`Server inspection detail failed: ${response.status}`);
  const envelope = await response.json();
  if (!exactKeys(envelope, ["inspection"])) throw new InvalidServerInspectionDetailError("Server returned invalid Automatic Sprinkler detail");
  const inspection = parseServerAutomaticSprinklerDetail(envelope.inspection);
  if (!inspection || inspection.clientUuid !== clientUuid) throw new InvalidServerInspectionDetailError("Server returned invalid Automatic Sprinkler detail");
  const attachments = await loadServerAttachments(clientUuid, inspection);
  return { ...inspection, attachments };
}
