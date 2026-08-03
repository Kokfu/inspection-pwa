import { parseDryWetRiserSystemConfiguration } from "./dryWetRiserConfiguration";
import type { DryWetRiserResponses, RiserOutlet, RiserRow } from "./dryWetRiserTypes";

const waterTankKeys = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"] as const;
const pumpHouseKeys = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const timestamp = (value: unknown): value is string => text(value) && !Number.isNaN(Date.parse(value));
const result = (value: unknown): value is "good" | "poor" => value === "good" || value === "poor";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const snapshot = (value: unknown, id: unknown): value is { id: string; displayName: string } => record(value) && Object.keys(value).length === 2 && value.id === id && text(value.id) && uuid.test(value.id) && text(value.displayName) && value.displayName.length > 0 && value.displayName.length <= 250;

export type ServerDryWetRiserDetail = {
  clientUuid: string; serverFormInstanceId: string; jobId: string; jobReference: string; jobTitle: string;
  customer: { id: string; code: string; displayName: string }; systemKey: "dry_wet_riser"; systemLabel: string;
  status: "submitted"; performedAt: string; receivedAt: string; template: { id: string; code: "MFE-FSSR"; version: 2 };
  configuration: { revisionId: string; revisionNumber: number }; systemConfiguration: { riserMode: "dry" | "wet" };
  responses: DryWetRiserResponses; deviceReportedCreatorUsername: string | null; verifiedOriginalCreatorUsername: string | null; syncedByUsername: string;
};

export class ServerDryWetRiserNotFoundError extends Error {}

function row(value: unknown): RiserRow | undefined {
  return record(value) && Object.keys(value).length === 2 && result(value.result) && text(value.remarks) && value.remarks.length <= 2000 ? { result: value.result, remarks: value.remarks } : undefined;
}
function fixedRows(value: unknown, keys: readonly string[]): Record<string, RiserRow> | undefined {
  if (!record(value) || Object.keys(value).length !== keys.length) return undefined;
  const rows: Record<string, RiserRow> = {};
  for (const key of keys) { const parsed = row(value[key]); if (!parsed) return undefined; rows[key] = parsed; }
  return rows;
}
function outlet(value: unknown): RiserOutlet | undefined {
  const keys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "locationText", "canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult", "remarks", "sortOrder"];
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every((key) => key in value) || !text(value.rowUuid) || !uuid.test(value.rowUuid) || (value.source !== "configured" && value.source !== "technician") || !text(value.assetReference) || value.assetReference.length > 250 || !text(value.locationText) || value.locationText.length === 0 || value.locationText.length > 250 || !result(value.canvasHoseAt2Result) || !result(value.diffuserNozzleResult) || !result(value.landingValveResult) || !result(value.crandleResult) || !result(value.doorResult) || !text(value.remarks) || value.remarks.length > 2000 || !number(value.sortOrder) || !Number.isInteger(value.sortOrder) || value.sortOrder < 1) return undefined;
  if (value.source === "configured" && (!text(value.configuredLocationId) || !uuid.test(value.configuredLocationId) || !number(value.configuredRowOrdinal) || !Number.isInteger(value.configuredRowOrdinal) || value.configuredRowOrdinal < 1 || !snapshot(value.locationSnapshot, value.configuredLocationId) || value.locationText !== value.locationSnapshot.displayName || (value.zoneSnapshot !== null && (!record(value.zoneSnapshot) || !text(value.zoneSnapshot.id) || !uuid.test(value.zoneSnapshot.id) || !text(value.zoneSnapshot.displayName) || Object.keys(value.zoneSnapshot).length !== 2)))) return undefined;
  if (value.source === "technician" && (value.configuredLocationId !== null || value.configuredRowOrdinal !== null || value.locationSnapshot !== null || value.zoneSnapshot !== null || value.assetReference !== "")) return undefined;
  return value as RiserOutlet;
}
function responses(value: unknown): DryWetRiserResponses | undefined {
  const keys = ["schemaVersion", "mode", "waterTank", "pumpHouse", "measurements", "riserOutlets", "comments"];
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every((key) => key in value) || value.schemaVersion !== 1 || (value.mode !== "dry" && value.mode !== "wet") || !record(value.measurements) || Object.keys(value.measurements).length !== 5 || !number(value.measurements.jockeyCutIn) || !number(value.measurements.jockeyCutOut) || !number(value.measurements.dutyCutIn) || !number(value.measurements.standbyCutIn) || value.measurements.unit !== "PSI" || !Array.isArray(value.riserOutlets) || !text(value.comments) || value.comments.length > 4000) return undefined;
  const waterTank = fixedRows(value.waterTank, waterTankKeys), pumpHouse = fixedRows(value.pumpHouse, pumpHouseKeys), riserOutlets = value.riserOutlets.map(outlet);
  if (!waterTank || !pumpHouse || riserOutlets.length === 0 || riserOutlets.length > 250 || riserOutlets.some((item) => !item)) return undefined;
  const outletRows = riserOutlets as RiserOutlet[];
  if (new Set(outletRows.map((item) => item.rowUuid)).size !== outletRows.length || outletRows.some((item, index) => item.sortOrder !== index + 1)) return undefined;
  return { schemaVersion: 1, mode: value.mode, waterTank, pumpHouse, measurements: { jockeyCutIn: value.measurements.jockeyCutIn, jockeyCutOut: value.measurements.jockeyCutOut, dutyCutIn: value.measurements.dutyCutIn, standbyCutIn: value.measurements.standbyCutIn, unit: "PSI" }, riserOutlets: outletRows, comments: value.comments };
}
export function parseServerDryWetRiserDetail(value: unknown): ServerDryWetRiserDetail | undefined {
  const keys = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerId", "customerCode", "customerName", "systemKey", "systemLabel", "status", "performedAt", "receivedAt", "template", "configuration", "systemConfiguration", "responses", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every((key) => key in value) || !text(value.clientUuid) || !uuid.test(value.clientUuid) || !text(value.serverFormInstanceId) || !uuid.test(value.serverFormInstanceId) || !text(value.jobId) || !uuid.test(value.jobId) || !text(value.jobReference) || !text(value.jobTitle) || !text(value.customerId) || !uuid.test(value.customerId) || !text(value.customerCode) || !text(value.customerName) || value.systemKey !== "dry_wet_riser" || !text(value.systemLabel) || value.status !== "submitted" || !timestamp(value.performedAt) || !timestamp(value.receivedAt) || !record(value.template) || Object.keys(value.template).length !== 3 || !text(value.template.id) || !uuid.test(value.template.id) || value.template.code !== "MFE-FSSR" || value.template.version !== 2 || !record(value.configuration) || Object.keys(value.configuration).length !== 2 || !text(value.configuration.revisionId) || !uuid.test(value.configuration.revisionId) || !number(value.configuration.revisionNumber) || !Number.isInteger(value.configuration.revisionNumber) || !text(value.syncedByUsername)) return undefined;
  const systemConfiguration = parseDryWetRiserSystemConfiguration(value.systemConfiguration), parsedResponses = responses(value.responses);
  if (!systemConfiguration || !parsedResponses || parsedResponses.mode !== systemConfiguration.riserMode || (value.deviceReportedCreatorUsername !== null && !text(value.deviceReportedCreatorUsername)) || (value.verifiedOriginalCreatorUsername !== null && !text(value.verifiedOriginalCreatorUsername))) return undefined;
  return { clientUuid: value.clientUuid, serverFormInstanceId: value.serverFormInstanceId, jobId: value.jobId, jobReference: value.jobReference, jobTitle: value.jobTitle, customer: { id: value.customerId, code: value.customerCode, displayName: value.customerName }, systemKey: "dry_wet_riser", systemLabel: value.systemLabel, status: "submitted", performedAt: value.performedAt, receivedAt: value.receivedAt, template: { id: value.template.id, code: "MFE-FSSR", version: 2 }, configuration: { revisionId: value.configuration.revisionId, revisionNumber: value.configuration.revisionNumber }, systemConfiguration, responses: parsedResponses, deviceReportedCreatorUsername: value.deviceReportedCreatorUsername, verifiedOriginalCreatorUsername: value.verifiedOriginalCreatorUsername, syncedByUsername: value.syncedByUsername };
}
export async function loadServerDryWetRiserDetail(clientUuid: string): Promise<ServerDryWetRiserDetail> {
  const response = await fetch(`/api/dry-wet-riser-inspections/${encodeURIComponent(clientUuid)}`, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 404) throw new ServerDryWetRiserNotFoundError("Inspection was not found on the server");
  if (response.status === 401 || response.status === 403) throw new Error("Sign in required to view this inspection");
  if (!response.ok) throw new Error(`Server inspection detail failed: ${response.status}`);
  const payload = await response.json() as { inspection?: unknown }; const inspection = parseServerDryWetRiserDetail(payload.inspection);
  if (!inspection) throw new Error("Server returned an invalid Dry/Wet Riser inspection");
  return inspection;
}
