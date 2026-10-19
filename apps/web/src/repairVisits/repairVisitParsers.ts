import { requestFingerprint } from "./repairVisitCanon";
import {
  isRepairVisitBeforeSnapshot, isRepairVisitFieldIdentity, isRepairVisit, isRepairVisitEvent, isRepairVisitItem,
  rvDate, rvEnum, rvHash, rvKeys, rvObject, rvPositive, rvText, rvTimestamp, rvUuid,
  type RepairCatalogField, type RepairPreviousVisitListItem, type RepairVisit, type RepairVisitCreateReceipt,
  type RepairVisitCreateRequest, type RepairVisitEvent, type RepairVisitEventReceipt, type RepairVisitItem,
  type RepairVisitPhotoMetadata, type RepairVisitPhotoReceipt, type RepairVisitSubmitBody
} from "./repairVisitTypes";

/** Every parser fails closed: unknown keys, bad enums or malformed timestamps reject the whole response. */
export class RepairVisitContractError extends Error {
  constructor(what: string) { super(`The server sent a malformed ${what}.`); this.name = "RepairVisitContractError"; }
}
const bad = (what: string): never => { throw new RepairVisitContractError(what); };

export function parsePreviousVisitList(body: unknown): RepairPreviousVisitListItem[] {
  if (!rvObject(body) || !rvKeys(body, ["visits"]) || !Array.isArray(body.visits)) return bad("previous-visit list");
  return body.visits.map(raw => {
    if (!rvObject(raw) || !rvKeys(raw, ["kind", "visitId", "visitNumber", "visitDate", "createdAt", "createdByUserId"])
      || !rvEnum(raw.kind, ["service", "repair"]) || !rvUuid(raw.visitId) || typeof raw.visitNumber !== "string"
      || !new RegExp(`^${raw.kind === "service" ? "SV" : "RV"}-[0-9]{8}-[1-9][0-9]*$`).test(raw.visitNumber)
      || !rvDate(raw.visitDate) || !rvTimestamp(raw.createdAt) || !rvPositive(raw.createdByUserId)) return bad("previous-visit list");
    return { kind: raw.kind as "service" | "repair", visitId: raw.visitId, visitNumber: raw.visitNumber, visitDate: raw.visitDate,
      createdAt: raw.createdAt, createdByUserId: raw.createdByUserId };
  });
}

export function parseCatalogFields(fields: unknown): RepairCatalogField[] {
  if (!Array.isArray(fields)) return bad("field catalog");
  const seen = new Set<string>();
  return fields.map(raw => {
    if (!rvObject(raw) || !rvKeys(raw, ["identity", "systemLabel", "unitLabel", "sectionLabel", "fieldLabel", "before"])
      || !isRepairVisitFieldIdentity(raw.identity) || ![raw.systemLabel, raw.unitLabel, raw.sectionLabel, raw.fieldLabel].every(label => rvText(label, 300))
      || !(raw.before === null || isRepairVisitBeforeSnapshot(raw.before))) return bad("field catalog");
    const identity = raw.identity as RepairCatalogField["identity"];
    const key = JSON.stringify(identity);
    if (seen.has(key)) return bad("field catalog");
    seen.add(key);
    return { identity, systemLabel: raw.systemLabel as string, unitLabel: raw.unitLabel as string, sectionLabel: raw.sectionLabel as string,
      fieldLabel: raw.fieldLabel as string, before: raw.before as RepairCatalogField["before"] };
  });
}

export function parsePreviousCatalog(body: unknown) {
  if (!rvObject(body) || !rvKeys(body, ["fields"])) return bad("field catalog");
  return parseCatalogFields((body as { fields: unknown }).fields);
}
export function parseCurrentCatalog(body: unknown) {
  if (!rvObject(body) || !rvKeys(body, ["configurationRevisionId", "fields"]) || !rvUuid(body.configurationRevisionId)) return bad("field catalog");
  return { configurationRevisionId: body.configurationRevisionId as string, fields: parseCatalogFields(body.fields) };
}

export function parseVisitList(body: unknown): RepairVisit[] {
  if (!rvObject(body) || !rvKeys(body, ["visits"]) || !Array.isArray(body.visits) || !body.visits.every(isRepairVisit)) return bad("repair visit list");
  return body.visits as RepairVisit[];
}
export function parseVisitDetail(body: unknown): { visit: RepairVisit; items: RepairVisitItem[]; events: RepairVisitEvent[] } {
  if (!rvObject(body) || !rvKeys(body, ["visit", "items", "events"]) || !isRepairVisit(body.visit) || !Array.isArray(body.items)
    || !body.items.every(isRepairVisitItem) || !Array.isArray(body.events) || !body.events.every(isRepairVisitEvent)) return bad("repair visit");
  const visit = body.visit as RepairVisit;
  if ((body.items as RepairVisitItem[]).some(item => item.visitUuid !== visit.clientUuid)) return bad("repair visit");
  return { visit, items: body.items as RepairVisitItem[], events: body.events as RepairVisitEvent[] };
}

const visitNumberFor = (visitDate: string) => new RegExp(`^RV-${visitDate.replaceAll("-", "")}-[1-9][0-9]*$`);

export function parseCreateReceipt(body: unknown): RepairVisitCreateReceipt {
  if (!rvObject(body) || !rvKeys(body, ["clientUuid", "visitNumber", "configurationRevisionId", "deviceCreatedAt", "visitDate", "arrivalTime", "requestFingerprint"])
    || !rvUuid(body.clientUuid) || !rvUuid(body.configurationRevisionId) || !rvTimestamp(body.deviceCreatedAt) || !rvDate(body.visitDate)
    || typeof body.arrivalTime !== "string" || !rvHash(body.requestFingerprint) || typeof body.visitNumber !== "string"
    || !visitNumberFor(body.visitDate as string).test(body.visitNumber)) return bad("create receipt");
  return body as unknown as RepairVisitCreateReceipt;
}
export function parsePhotoReceipt(body: unknown): RepairVisitPhotoReceipt {
  if (!rvObject(body) || !rvKeys(body, ["photoUuid", "clientUuid", "itemUuid", "revision", "requestFingerprint", "sourceSha256", "storedSha256"])
    || !rvUuid(body.photoUuid) || !rvUuid(body.clientUuid) || !rvUuid(body.itemUuid) || !rvPositive(body.revision)
    || !rvHash(body.requestFingerprint) || !rvHash(body.sourceSha256) || !rvHash(body.storedSha256)) return bad("photo receipt");
  return body as unknown as RepairVisitPhotoReceipt;
}
export function parseEventReceipt(body: unknown): RepairVisitEventReceipt {
  if (!rvObject(body) || !rvKeys(body, ["operationUuid", "clientUuid", "revision", "event", "requestFingerprint", "occurredAt"])
    || !rvUuid(body.operationUuid) || !rvUuid(body.clientUuid) || !rvPositive(body.revision)
    || !rvEnum(body.event, ["submitted", "resubmitted", "returned", "approved"]) || !rvHash(body.requestFingerprint) || !rvTimestamp(body.occurredAt)) return bad("submit receipt");
  return body as unknown as RepairVisitEventReceipt;
}

/** The receipt must echo the exact UUID and every value sent, and carry the fingerprint the server computes itself. */
export async function createReceiptConfirms(receipt: RepairVisitCreateReceipt, request: RepairVisitCreateRequest, actorId: number) {
  const sentInstant = request.deviceCreatedAt;
  return receipt.clientUuid === request.clientUuid && receipt.configurationRevisionId === request.configurationRevisionId
    && receipt.arrivalTime === request.arrivalTime
    && (sentInstant === null || (Date.parse(receipt.deviceCreatedAt) === Date.parse(sentInstant) && receipt.visitDate === request.visitDate))
    && receipt.requestFingerprint === await requestFingerprint({ actorId, ...request });
}
export async function photoReceiptConfirms(receipt: RepairVisitPhotoReceipt, visitUuid: string, metadata: RepairVisitPhotoMetadata, actorId: number) {
  return receipt.photoUuid === metadata.photoUuid && receipt.itemUuid === metadata.itemUuid && receipt.clientUuid === visitUuid
    && receipt.revision === metadata.revision && receipt.sourceSha256 === metadata.sourceSha256
    && receipt.requestFingerprint === await requestFingerprint({ actorId, clientUuid: visitUuid, ...metadata });
}
export async function submitReceiptConfirms(receipt: RepairVisitEventReceipt, visitUuid: string, body: RepairVisitSubmitBody, actorId: number) {
  return receipt.operationUuid === body.operationUuid && receipt.clientUuid === visitUuid && receipt.revision === body.revision
    && (receipt.event === "submitted" || receipt.event === "resubmitted")
    && receipt.requestFingerprint === await requestFingerprint({ action: "submit", actorId, clientUuid: visitUuid, ...body });
}
