import { repairVisitSystems, rvObject, rvKeys, rvUuid, rvPositive, rvDate, rvTime, rvTimestamp, rvText } from "../repairVisits/repairVisitContract.js";

/** Offline-only contract. Existing online create requests remain unchanged. */
export type OfflineServiceVisitCreateRequest = {
  clientJobUuid: string; customerId: string; siteId: string; systemKeys: string[];
  configurationRevisionId: string; configurationRevision: number;
  deviceCreatedAt: string; visitDate: string; arrivalTime: string; serviceCallNumber: string | null;
};
export type OfflineServiceVisitCreateResponse = {
  clientJobUuid: string; jobId: string; visitNumber: string; configurationRevisionId: string;
  deviceCreatedAt: string; visitDate: string; arrivalTime: string; idempotent: boolean;
};
export function isOfflineServiceVisitCreateRequest(v: unknown): v is OfflineServiceVisitCreateRequest {
  return rvObject(v) && rvKeys(v, ["clientJobUuid", "customerId", "siteId", "systemKeys", "configurationRevisionId", "configurationRevision", "deviceCreatedAt", "visitDate", "arrivalTime", "serviceCallNumber"])
    && [v.clientJobUuid, v.customerId, v.siteId, v.configurationRevisionId].every(rvUuid) && rvPositive(v.configurationRevision)
    && rvTimestamp(v.deviceCreatedAt) && rvDate(v.visitDate) && rvTime(v.arrivalTime)
    && (v.serviceCallNumber === null || rvText(v.serviceCallNumber, 80))
    && Array.isArray(v.systemKeys) && v.systemKeys.length > 0 && new Set(v.systemKeys).size === v.systemKeys.length
    && v.systemKeys.every(key => typeof key === "string" && [...repairVisitSystems, "portable_fire_extinguisher"].includes(key));
}
export function isOfflineServiceVisitCreateResponse(v: unknown): v is OfflineServiceVisitCreateResponse {
  return rvObject(v) && rvKeys(v, ["clientJobUuid", "jobId", "visitNumber", "configurationRevisionId", "deviceCreatedAt", "visitDate", "arrivalTime", "idempotent"])
    && rvUuid(v.clientJobUuid) && v.jobId === v.clientJobUuid && rvUuid(v.configurationRevisionId)
    && rvTimestamp(v.deviceCreatedAt) && rvDate(v.visitDate) && rvTime(v.arrivalTime) && typeof v.idempotent === "boolean"
    && typeof v.visitNumber === "string" && new RegExp(`^SV-${v.visitDate.replaceAll("-", "")}-[1-9][0-9]*$`).test(v.visitNumber);
}
export function parseOfflineServiceVisitCreateRequest(v: unknown): OfflineServiceVisitCreateRequest {
  if (!isOfflineServiceVisitCreateRequest(v)) throw new Error("INVALID_OFFLINE_SERVICE_VISIT_REQUEST");
  return v;
}
export function parseOfflineServiceVisitCreateResponse(v: unknown): OfflineServiceVisitCreateResponse {
  if (!isOfflineServiceVisitCreateResponse(v)) throw new Error("INVALID_OFFLINE_SERVICE_VISIT_RESPONSE");
  return v;
}
