import { resolveHoseReelControls } from "./templates/definitionControls.js";
import { resolveCo2Controls } from "./templates/co2DefinitionControls.js";
import { validateHoseReelSubmission } from "../sync/masterSystemInspectionSync.js";
import { validateCo2Responses } from "../sync/co2FormInstanceSync.js";

type R = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rec = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: R, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const acceptedRowKeys = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerName", "systemKey", "instanceKey", "zoneId", "locationId", "displaySequence", "status", "performedAt", "receivedAt", "templateId", "configurationRevisionId", "inspectionSnapshot", "responses", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];
const canonicalMillis = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const canonicalMicros = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value)) return false;
  const millis = `${value.slice(0, 23)}Z`;
  return !Number.isNaN(Date.parse(millis)) && new Date(millis).toISOString() === millis;
};
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : rec(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

function identity(row: R) {
  return exact(row, acceptedRowKeys) && typeof row.clientUuid === "string" && uuid.test(row.clientUuid)
    && typeof row.serverFormInstanceId === "string" && uuid.test(row.serverFormInstanceId)
    && typeof row.jobId === "string" && uuid.test(row.jobId)
    && text(row.jobReference, 250) && text(row.jobTitle, 300) && text(row.customerName, 250)
    && row.status === "submitted" && canonicalMicros(row.performedAt) && canonicalMicros(row.receivedAt)
    && text(row.syncedByUsername, 160)
    && (row.deviceReportedCreatorUsername === null || text(row.deviceReportedCreatorUsername, 160))
    && (row.verifiedOriginalCreatorUsername === null || text(row.verifiedOriginalCreatorUsername, 160));
}

function snapshotBase(value: unknown): (R & { job: R; template: R; configuration: R; system: R }) | undefined {
  if (!rec(value) || !exact(value, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system"]) || value.schemaVersion !== 1
    || !canonicalMillis(value.acceptedAt)
    || !rec(value.job) || !exact(value.job, ["id", "reference", "title"]) || typeof value.job.id !== "string" || !uuid.test(value.job.id)
    || !text(value.job.reference, 250) || !text(value.job.title, 300)
    || !rec(value.customer) || !exact(value.customer, ["id", "code", "displayName"])
    || typeof value.customer.id !== "string" || !uuid.test(value.customer.id) || !text(value.customer.code, 100) || !text(value.customer.displayName, 250)
    || !rec(value.template) || !exact(value.template, ["id", "code", "version"])
    || typeof value.template.id !== "string" || !uuid.test(value.template.id) || value.template.code !== "MFE-FSSR"
    || !Number.isSafeInteger(value.template.version) || Number(value.template.version) < 1
    || !rec(value.configuration) || !exact(value.configuration, ["revisionId", "revisionNumber"])
    || typeof value.configuration.revisionId !== "string" || !uuid.test(value.configuration.revisionId)
    || !Number.isSafeInteger(value.configuration.revisionNumber) || Number(value.configuration.revisionNumber) < 1
    || !rec(value.system)) return undefined;
  return value as R & { job: R; template: R; configuration: R; system: R };
}

export function validateAcceptedHoseReelDetail(row: R) {
  const snapshot = snapshotBase(row.inspectionSnapshot);
  if (!identity(row) || row.systemKey !== "hose_reel" || row.instanceKey !== "primary" || row.zoneId !== null
    || row.locationId !== null || row.displaySequence !== 1 || !snapshot || !rec(row.responses)
    || snapshot.job.id !== row.jobId || snapshot.system.systemKey !== "hose_reel" || snapshot.system.definitionStatus !== "confirmed"
    || snapshot.template.id !== row.templateId || snapshot.configuration.revisionId !== row.configurationRevisionId) return undefined;
  try {
    const controls = resolveHoseReelControls(snapshot.system.definition, "MFE-FSSR", snapshot.template.version as number);
    if (canonical(snapshot.system.resolvedControls) !== canonical(controls) || !validateHoseReelSubmission(row.responses, controls)) return undefined;
    return { snapshot, controls };
  } catch { return undefined; }
}

/** Read-only report adapter for an already accepted historical Hose Reel payload. */
export function validateHoseReelHistoricalPayload(snapshotValue: unknown, responseValue: unknown) {
  const snapshot = snapshotBase(snapshotValue);
  if (!snapshot || !rec(responseValue) || snapshot.system.systemKey !== "hose_reel") return false;
  try {
    const controls = resolveHoseReelControls(snapshot.system.definition, "MFE-FSSR", snapshot.template.version as number);
    return canonical(snapshot.system.resolvedControls) === canonical(controls)
      && validateHoseReelSubmission(responseValue, controls);
  } catch { return false; }
}

export function validateAcceptedCo2Detail(row: R) {
  if (!identity(row) || row.systemKey !== "co2_fire_extinguisher" || typeof row.locationId !== "string" || !uuid.test(row.locationId)
    || !(row.zoneId === null || typeof row.zoneId === "string" && uuid.test(row.zoneId))
    || row.instanceKey !== `location:${row.locationId}` || !Number.isSafeInteger(row.displaySequence) || Number(row.displaySequence) < 1
    || !rec(row.inspectionSnapshot) || !exact(row.inspectionSnapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "instance"])
    || row.inspectionSnapshot.schemaVersion !== 1 || !canonicalMillis(row.inspectionSnapshot.acceptedAt)
    || !rec(row.inspectionSnapshot.job) || !exact(row.inspectionSnapshot.job, ["id", "reference", "title"])
    || row.inspectionSnapshot.job.id !== row.jobId || !text(row.inspectionSnapshot.job.reference, 250) || !text(row.inspectionSnapshot.job.title, 300)
    || !rec(row.inspectionSnapshot.customer) || !exact(row.inspectionSnapshot.customer, ["id", "code", "displayName"])
    || typeof row.inspectionSnapshot.customer.id !== "string" || !uuid.test(row.inspectionSnapshot.customer.id)
    || !text(row.inspectionSnapshot.customer.code, 100) || !text(row.inspectionSnapshot.customer.displayName, 250)
    || !rec(row.inspectionSnapshot.template) || !rec(row.inspectionSnapshot.configuration)
    || !rec(row.inspectionSnapshot.system) || !rec(row.inspectionSnapshot.instance) || !rec(row.responses)) return undefined;
  const snapshot = row.inspectionSnapshot;
  const template = snapshot.template as R, configuration = snapshot.configuration as R;
  const system = snapshot.system as R, instance = snapshot.instance as R;
  if (!exact(template, ["id", "code", "version"]) || template.id !== row.templateId || template.code !== "MFE-FSSR"
    || !Number.isSafeInteger(template.version) || Number(template.version) < 1
    || !exact(configuration, ["revisionId", "revisionNumber"]) || configuration.revisionId !== row.configurationRevisionId
    || system.key !== "co2_fire_extinguisher" || system.repetitionMode !== "per_location"
    || !exact(instance, ["instanceKey", "displaySequence", "zone", "location"])
    || instance.instanceKey !== row.instanceKey || instance.displaySequence !== row.displaySequence
    || !rec(instance.location) || instance.location.id !== row.locationId
    || (row.zoneId === null ? instance.zone !== null : !rec(instance.zone) || instance.zone.id !== row.zoneId)) return undefined;
  try {
    const controls = resolveCo2Controls(system.definition, "MFE-FSSR", template.version as number);
    if (controls.source.systemKey !== "co2_fire_extinguisher" || canonical(system.resolvedControls) !== canonical(controls)
      || !validateCo2Responses(row.responses, controls)) return undefined;
    return { snapshot, controls };
  } catch { return undefined; }
}
