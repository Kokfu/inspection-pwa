import { createHash } from "node:crypto";
import { RepairError } from "./fieldCatalogReaders.js";
import { rvObject, rvKeys, rvUuid, rvPositive, rvDate, rvTime, rvTimestamp, rvText, rvHash,
  isRepairVisitPrevious, isRepairVisitFieldIdentity, type RepairVisitFieldIdentity } from "./repairVisitContract.js";

export const refuse = (code: string, status = 409): never => { throw new RepairError(code, code.replaceAll("_", " "), status); };
export const invalid = (): never => refuse("INVALID_REPAIR_VISIT_REQUEST", 400);
export function keys(v: unknown, names: string[]) {
  if (!rvObject(v) || !rvKeys(v, names)) return invalid();
  return v;
}
export const uuid = (v: unknown): string => rvUuid(v) ? v : invalid();
export const positive = (v: unknown): number => rvPositive(v) ? v : invalid();
export const hash = (v: unknown): string => rvHash(v) ? v : invalid();
export function fingerprint(v: unknown): string {
  const canonical = (x: unknown): unknown => Array.isArray(x) ? x.map(canonical) : rvObject(x)
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
  return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
}
export const fieldKey = (v: RepairVisitFieldIdentity) => fingerprint(v);
function selection(v: unknown) {
  const b = keys(v, ["clientUuid", "identity"]);
  if (!isRepairVisitFieldIdentity(b.identity)) return invalid();
  return { clientUuid: uuid(b.clientUuid), identity: b.identity };
}
function selections<T extends ReturnType<typeof selection>>(items: T[]) {
  if (!items.length || new Set(items.map(i => i.clientUuid)).size !== items.length
    || new Set(items.map(i => fieldKey(i.identity))).size !== items.length) return invalid();
  return items;
}
export function parseCreate(v: unknown) {
  const b = keys(v, ["clientUuid", "customerId", "siteId", "configurationRevisionId", "deviceCreatedAt", "visitDate", "arrivalTime", "serviceCallNumber", "previousVisit", "items"]);
  // deviceCreatedAt=null means online creation: server supplies the visit day/instant.
  if (b.deviceCreatedAt !== null && !rvTimestamp(b.deviceCreatedAt) || !rvDate(b.visitDate) || !rvTime(b.arrivalTime)
    || b.serviceCallNumber !== null && !rvText(b.serviceCallNumber, 100)
    || b.previousVisit !== null && !isRepairVisitPrevious(b.previousVisit) || !Array.isArray(b.items)) return invalid();
  const clientUuid = uuid(b.clientUuid);
  if (b.previousVisit?.visitId === clientUuid) return invalid();
  return { clientUuid, customerId: uuid(b.customerId), siteId: uuid(b.siteId), configurationRevisionId: uuid(b.configurationRevisionId),
    deviceCreatedAt: b.deviceCreatedAt, visitDate: b.visitDate, arrivalTime: b.arrivalTime, serviceCallNumber: b.serviceCallNumber,
    previousVisit: b.previousVisit, items: selections(b.items.map(selection)) };
}
export function parseSubmit(v: unknown) {
  const b = keys(v, ["operationUuid", "expectedRevision", "revision", "items"]);
  if (!Array.isArray(b.items)) return invalid();
  const items = b.items.map(v => {
    const i = keys(v, ["clientUuid", "identity", "outcome", "remark", "photoUuid", "sourceSha256"]);
    if (i.outcome !== "done_repair" && i.outcome !== "not_done" || !rvText(i.remark, 4000)) return invalid();
    return { ...selection({ clientUuid: i.clientUuid, identity: i.identity }), outcome: i.outcome, remark: i.remark,
      photoUuid: uuid(i.photoUuid), sourceSha256: hash(i.sourceSha256) };
  });
  if (new Set(items.map(i => i.photoUuid)).size !== items.length) return invalid();
  return { operationUuid: uuid(b.operationUuid), expectedRevision: positive(b.expectedRevision), revision: positive(b.revision), items: selections(items) };
}
export function parseDecision(v: unknown, returning: boolean) {
  const b = keys(v, returning ? ["operationUuid", "expectedRevision", "reason"] : ["operationUuid", "expectedRevision"]);
  if (returning && !rvText(b.reason, 4000)) return invalid();
  return { operationUuid: uuid(b.operationUuid), expectedRevision: positive(b.expectedRevision), reason: returning ? b.reason as string : null };
}
export function parsePhoto(v: unknown) {
  const b = keys(v, ["photoUuid", "itemUuid", "revision", "sourceSha256", "sizeBytes", "width", "height", "captureSource", "capturedAt"]);
  if (!rvTimestamp(b.capturedAt) || typeof b.captureSource !== "string" || !["camera", "gallery", "unknown"].includes(b.captureSource)) return invalid();
  const sizeBytes = positive(b.sizeBytes), width = positive(b.width), height = positive(b.height);
  if (sizeBytes > 2097152 || width > 1600 || height > 1600) return invalid();
  return { photoUuid: uuid(b.photoUuid), itemUuid: uuid(b.itemUuid), revision: positive(b.revision), sourceSha256: hash(b.sourceSha256),
    sizeBytes, width, height, captureSource: b.captureSource as string, capturedAt: b.capturedAt };
}
