import type { HydrantResponses, HydrantRow } from "./hydrantTypes";

type R = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const detailKeys = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerName", "systemKey", "systemLabel", "instanceKey", "status", "performedAt", "receivedAt", "responses", "displayControls", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername", "evidencePolicyId", "evidencePolicyVersion", "evidencePolicyDefinition", "evidencePolicySha256"];
const v7DetailKeys = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerName", "systemKey", "systemLabel", "instanceKey", "zoneId", "locationId", "displaySequence", "status", "performedAt", "receivedAt", "template", "configuration", "responses", "displayControls", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];
const responseKeys = ["schemaVersion", "hydrantType", "rows", "comments"];
const rowKeys = ["rowUuid", "source", "configuredLocationId", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "assetReference", "locationText", "canvasHose1Result", "canvasHose2Result", "diffuserNozzleResult", "landingValveResult", "landingValveHandleResult", "hoseCabinetResult", "keyLockResult", "remarks", "sortOrder"];
const v7RowKeys = [...rowKeys.slice(0, -1), "fieldRemarks", "sortOrder"];
const resultFields = ["canvasHose1Result", "canvasHose2Result", "diffuserNozzleResult", "landingValveResult", "landingValveHandleResult", "hoseCabinetResult", "keyLockResult"];
const rec = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: R, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, maximum: number, required = true): value is string => typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0);
const nullableText = (value: unknown, maximum: number) => value === null || text(value, maximum);

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour <= 23 && minute <= 59 && second <= 59;
}

function snapshot(value: unknown, expectedId?: string): value is { id: string; displayName: string } {
  return rec(value) && exact(value, ["id", "displayName"])
    && typeof value.id === "string" && uuid.test(value.id) && (!expectedId || value.id === expectedId)
    && text(value.displayName, 300);
}

function parseRows(value: unknown, v7 = false) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 250) return undefined;
  const seen = new Set<string>();
  const configuredIdentities = new Set<string>();
  const rows: HydrantRow[] = [];
  let technicianRowsStarted = false;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!rec(row) || !exact(row, v7 ? v7RowKeys : rowKeys) || typeof row.rowUuid !== "string" || !uuid.test(row.rowUuid) || seen.has(row.rowUuid)
      || row.sortOrder !== index + 1 || !text(row.locationText, 300) || !text(row.assetReference, 200, false)
      || !text(row.remarks, 2000, false)
      || !resultFields.every((field) => v7 ? ["good", "not_good", "complete_repair", "na"].includes(String(row[field])) : row[field] === "good" || row[field] === "poor")
      || (v7 && (!rec(row.fieldRemarks) || Object.keys(row.fieldRemarks).some((key) => !resultFields.includes(key)) || Object.values(row.fieldRemarks).some((remark) => !text(remark, 2000, false))))) return undefined;
    seen.add(row.rowUuid);
    if (row.source === "configured") {
      if (technicianRowsStarted || typeof row.configuredLocationId !== "string" || !uuid.test(row.configuredLocationId)
        || !Number.isSafeInteger(row.configuredRowOrdinal) || Number(row.configuredRowOrdinal) < 1 || Number(row.configuredRowOrdinal) > 250
        || !snapshot(row.locationSnapshot, row.configuredLocationId)
        || !(row.zoneSnapshot === null || snapshot(row.zoneSnapshot))
        || row.locationText !== row.locationSnapshot.displayName
        || configuredIdentities.has(`${row.configuredLocationId}:${row.configuredRowOrdinal}`)) return undefined;
      configuredIdentities.add(`${row.configuredLocationId}:${row.configuredRowOrdinal}`);
    } else {
      technicianRowsStarted = true;
      if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null
        || row.zoneSnapshot !== null || row.locationSnapshot !== null) return undefined;
    }
    rows.push(row as HydrantRow);
  }
  return rows;
}

function parseResponses(value: unknown, v7 = false): HydrantResponses | undefined {
  if (!rec(value) || !exact(value, responseKeys) || value.schemaVersion !== 1
    || !(value.hydrantType === "pressurize" || value.hydrantType === "meter" || value.hydrantType === "public")
    || !text(value.comments, 4000, false)) return undefined;
  const rows = parseRows(value.rows, v7);
  return rows ? { schemaVersion: 1, hydrantType: value.hydrantType, rows, comments: value.comments } : undefined;
}

export type ServerHydrantDetail = {
  clientUuid: string; serverFormInstanceId: string; jobId: string; jobReference: string; jobTitle: string; customerName: string;
  systemKey: "hydrant"; systemLabel: string; instanceKey: "primary"; status: "submitted"; performedAt: string; receivedAt: string;
  templateVersion?: 7; responses: HydrantResponses; deviceReportedCreatorUsername: string | null; verifiedOriginalCreatorUsername: string | null; syncedByUsername: string;
};

export function parseServerHydrantDetail(value: unknown): ServerHydrantDetail | undefined {
  if (rec(value) && exact(value, v7DetailKeys)
    && typeof value.clientUuid === "string" && uuid.test(value.clientUuid) && typeof value.serverFormInstanceId === "string" && uuid.test(value.serverFormInstanceId)
    && typeof value.jobId === "string" && uuid.test(value.jobId) && text(value.jobReference, 250) && text(value.jobTitle, 300) && text(value.customerName, 250)
    && value.systemKey === "hydrant" && text(value.systemLabel, 300) && value.instanceKey === "primary" && value.zoneId === null && value.locationId === null && value.displaySequence === 1 && value.status === "submitted"
    && timestamp(value.performedAt) && timestamp(value.receivedAt) && rec(value.template) && value.template.version === 7 && rec(value.configuration) && value.displayControls !== undefined
    && nullableText(value.deviceReportedCreatorUsername, 160) && nullableText(value.verifiedOriginalCreatorUsername, 160) && text(value.syncedByUsername, 160)) {
    const responses = parseResponses(value.responses, true);
    if (responses) return { clientUuid: value.clientUuid, serverFormInstanceId: value.serverFormInstanceId, jobId: value.jobId, jobReference: value.jobReference, jobTitle: value.jobTitle, customerName: value.customerName, systemKey: "hydrant", systemLabel: value.systemLabel, instanceKey: "primary", status: "submitted", performedAt: value.performedAt, receivedAt: value.receivedAt, templateVersion: 7, responses, deviceReportedCreatorUsername: value.deviceReportedCreatorUsername as string | null, verifiedOriginalCreatorUsername: value.verifiedOriginalCreatorUsername as string | null, syncedByUsername: value.syncedByUsername };
  }
  if (!rec(value) || !exact(value, detailKeys)
    || typeof value.clientUuid !== "string" || !uuid.test(value.clientUuid)
    || typeof value.serverFormInstanceId !== "string" || !uuid.test(value.serverFormInstanceId)
    || typeof value.jobId !== "string" || !uuid.test(value.jobId)
    || !text(value.jobReference, 250) || !text(value.jobTitle, 300) || !text(value.customerName, 250)
    || value.systemKey !== "hydrant" || !text(value.systemLabel, 300) || value.instanceKey !== "primary" || value.status !== "submitted"
    || !timestamp(value.performedAt) || !timestamp(value.receivedAt)
    || value.displayControls !== null || !nullableText(value.deviceReportedCreatorUsername, 160)
    || !nullableText(value.verifiedOriginalCreatorUsername, 160) || !text(value.syncedByUsername, 160)
    || value.evidencePolicyId !== null || value.evidencePolicyVersion !== null || value.evidencePolicyDefinition !== null || value.evidencePolicySha256 !== null) return undefined;
  const responses = parseResponses(value.responses);
  return responses ? {
    clientUuid: value.clientUuid, serverFormInstanceId: value.serverFormInstanceId, jobId: value.jobId,
    jobReference: value.jobReference, jobTitle: value.jobTitle, customerName: value.customerName,
    systemKey: "hydrant", systemLabel: value.systemLabel, instanceKey: "primary", status: "submitted",
    performedAt: value.performedAt, receivedAt: value.receivedAt, responses,
    deviceReportedCreatorUsername: value.deviceReportedCreatorUsername as string | null,
    verifiedOriginalCreatorUsername: value.verifiedOriginalCreatorUsername as string | null, syncedByUsername: value.syncedByUsername
  } : undefined;
}

export async function loadServerHydrantDetail(clientUuid: string) {
  if (!uuid.test(clientUuid)) throw new Error("Hydrant inspection identifier is invalid");
  const response = await fetch(`/api/master-system-inspections/${encodeURIComponent(clientUuid)}`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "Accepted Hydrant inspection was not found on the server" : "Server Hydrant detail is unavailable");
  const body: unknown = await response.json();
  if (!rec(body) || !exact(body, ["inspection"])) throw new Error("Server returned an invalid Hydrant accepted detail");
  const detail = parseServerHydrantDetail(body.inspection);
  if (!detail || detail.clientUuid !== clientUuid) throw new Error("Server returned an invalid Hydrant accepted detail");
  return detail;
}
