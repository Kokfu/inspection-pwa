import { beginWorkspaceActivity } from "../db/workspaceActivity";
import { actorId, fingerprint, hash, isVisitDate, object, positive, requireRepair, sha256, timestamp, uuid } from "./repairContract";
import { downloadRepairService, listAuthorizedRepairServices, repairContext, repairRequest } from "./repairRepository";
import { notDoneKey, parseNotDone, type NotDoneMarker } from "./repairPartState";
import type { RepairFinding, RepairHistory } from "./repairTypes";

export type RepairServiceSummary = {
  jobId: string; systemKey: string; sourceJob: { id: string; reference: string; title: string };
  customer: { id: string; code: string; displayName: string }; site: { id: string; displayName: string } | null; systemLabel: string; visitDate?: string | null;
};
export const REPAIR_LIST_CACHE = "repair-ui:services";
const listGenerations = new Map<string, number>();
export async function refreshRepairList() {
  const ctx = await repairContext();
  const generationKey = `${ctx.db.name}:${ctx.actorId}`, generation = (listGenerations.get(generationKey) ?? 0) + 1;
  listGenerations.set(generationKey, generation);
  try {
    const values = await listAuthorizedRepairServices();
    const seen = new Set<string>();
    for (const s of values) {
      requireRepair(["customer,jobId,site,sourceJob,systemKey,systemLabel", "customer,jobId,site,sourceJob,systemKey,systemLabel,visitDate"].includes(Object.keys(s).sort().join()) && (s.visitDate === undefined || s.visitDate === null || isVisitDate(s.visitDate))
        && object(s.sourceJob) && s.sourceJob.id === s.jobId && typeof s.sourceJob.reference === "string" && typeof s.sourceJob.title === "string"
        && object(s.customer) && uuid(s.customer.id) && typeof s.customer.code === "string" && typeof s.customer.displayName === "string"
        && (s.site === null || object(s.site) && uuid(s.site.id) && typeof s.site.displayName === "string") && typeof s.systemLabel === "string"
        && !seen.has(`${s.jobId}/${s.systemKey}`));
      seen.add(`${s.jobId}/${s.systemKey}`);
    }
    const at = new Date().toISOString();
    await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
      await ctx.assert();
      requireRepair(listGenerations.get(generationKey) === generation, "REPAIR_REFRESH_SUPERSEDED");
      await ctx.db.referenceData.put({ key: REPAIR_LIST_CACHE, version: "1", fetchedAt: at, expiresAt: at, payload: { services: values } });
    });
    return values as RepairServiceSummary[];
  } catch (error) {
    await ctx.assert();
    if (listGenerations.get(generationKey) !== generation) throw error;
    // Keep the last list and every local entity, but mark the authority failure.
    await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
      await ctx.assert();
      requireRepair(listGenerations.get(generationKey) === generation, "REPAIR_REFRESH_SUPERSEDED");
      const prior = await ctx.db.referenceData.get(REPAIR_LIST_CACHE);
      if (prior && object(prior.payload)) await ctx.db.referenceData.update(REPAIR_LIST_CACHE, {
        payload: { ...prior.payload, refreshError: error instanceof Error ? error.message : "REPAIR_REFRESH_FAILED" }
      });
    });
    throw error;
  }
}

/** Any active technician may start repairs on a service. Self-start is online once. Persist both mutation UUIDs
 * before the request, including after a lost response; a retry or a second device is answered with the one ACTIVE
 * order for this technician, so retries never create a second order. No new DB store. */
export async function prepareOwnRepairService(jobId: string, systemKey: string) {
  requireRepair(uuid(jobId) && /^[a-z0-9_]{1,80}$/.test(systemKey));
  const finish = beginWorkspaceActivity();
  try {
    const ctx = await repairContext(), key = `repair-ui:self-start:${jobId}:${systemKey}`;
    const body = await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
      await ctx.assert();
      const saved = await ctx.db.referenceData.get(key);
      if (saved) {
        const b = saved.payload;
        requireRepair(object(b) && Object.keys(b).sort().join() === "jobId,requestId,systemKey,workOrderId"
          && uuid(b.requestId) && uuid(b.workOrderId) && b.jobId === jobId && b.systemKey === systemKey);
        return b;
      }
      const payload = { requestId: crypto.randomUUID(), workOrderId: crypto.randomUUID(), jobId, systemKey };
      const at = new Date().toISOString();
      await ctx.db.referenceData.add({ key, payload, version: "1", fetchedAt: at, expiresAt: at });
      return payload;
    });
    const receipt: unknown = await (await repairRequest(ctx, "work-orders/self-start", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    })).json();
    requireRepair(object(receipt) && Object.keys(receipt).sort().join() === "assignedToUserId,jobId,requestFingerprint,requestId,revision,status,systemKey,workOrderId"
      && uuid(receipt.requestId) && uuid(receipt.workOrderId) && hash(receipt.requestFingerprint) && receipt.jobId === jobId && receipt.systemKey === systemKey
      && receipt.assignedToUserId === ctx.actorId && positive(receipt.revision) && receipt.status === "active", "INVALID_REPAIR_RECEIPT");
    // The exact request is verified against its own fingerprint. Otherwise the server reused this technician's existing ACTIVE order.
    if (receipt.requestId === body.requestId) requireRepair(receipt.workOrderId === body.workOrderId && receipt.revision === 1
      && receipt.requestFingerprint === await fingerprint({ actorId: ctx.actorId, mode: "self", ...body }), "INVALID_REPAIR_RECEIPT");
    await ctx.assert();
    const service = await downloadRepairService(jobId, systemKey);
    requireRepair(service.workOrders.some(w => w.workOrderId === receipt.workOrderId && w.status === "active" && w.assignedToUserId === ctx.actorId), "INVALID_REPAIR_RECEIPT");
    return service;
  } finally { finish(); }
}

/** This is a read adapter for B2's submitted-record endpoint, never a submission or
 * approval projection. Bind history, parent, manifest and After bytes before display. */
export async function readHistoryAfter(f: RepairFinding, h: RepairHistory) {
  const ctx = await repairContext();
  const v: unknown = await (await repairRequest(ctx, `records/${h.client_uuid}`)).json();
  requireRepair(object(v) && Object.keys(v).sort().join() === "decisions,evidence,manifest,performedAt,receipt,remark,reviewState,submittedAt,submittedByUserId"
    && object(v.receipt) && Object.keys(v.receipt).sort().join() === "clientUuid,cycleSequence,findingId,jobId,predecessorUuid,requestFingerprint,sourceRevision,systemKey,workOrderId"
    && object(v.evidence) && Object.keys(v.evidence).sort().join() === "findingId,jobId,photoUuid,repairUuid,requestFingerprint,sourceSha256,storedSha256,systemKey,workOrderId"
    && hash(v.receipt.sourceRevision) && hash(v.evidence.requestFingerprint) && timestamp(v.submittedAt)
    && ["awaiting_approval", "approved", "rejected", "withdrawn"].includes(String(v.reviewState)) && typeof v.reviewState === "string" && Array.isArray(v.decisions)
    && Array.isArray(v.manifest) && v.manifest.length === 1
    && v.remark === h.remark && v.performedAt === h.performed_at && v.submittedByUserId === Number(h.submitted_by_user_id)
    && v.receipt.clientUuid === h.client_uuid && v.receipt.findingId === f.findingId && v.receipt.jobId === f.original.jobId
    && v.receipt.systemKey === f.original.systemKey && uuid(v.receipt.workOrderId) && hash(v.receipt.requestFingerprint)
    && v.receipt.cycleSequence === h.cycle_sequence && v.receipt.predecessorUuid === h.predecessor_uuid
    && v.evidence.repairUuid === h.client_uuid && v.evidence.findingId === f.findingId && v.evidence.jobId === f.original.jobId
    && v.evidence.systemKey === f.original.systemKey && v.evidence.workOrderId === v.receipt.workOrderId
    && uuid(v.evidence.photoUuid) && hash(v.evidence.storedSha256) && hash(v.evidence.sourceSha256)
    && object(v.manifest[0]) && Object.keys(v.manifest[0]).sort().join() === "fieldPath,photoUuid,sourceSha256"
    && v.manifest[0].photoUuid === v.evidence.photoUuid && v.manifest[0].fieldPath === f.original.fieldPath
    && v.manifest[0].sourceSha256 === v.evidence.sourceSha256, "INVALID_REPAIR_HISTORY");
  for (const [i, d] of v.decisions.entries()) requireRepair(object(d)
    && Object.keys(d).sort().join() === "clientUuid,decidedAt,decidedByRole,decidedByUserId,decision,decisionId,reason,requestFingerprint,requestId,sequence"
    && d.clientUuid === h.client_uuid && d.sequence === i + 1 && uuid(d.decisionId) && uuid(d.requestId) && hash(d.requestFingerprint)
    && timestamp(d.decidedAt) && actorId(d.decidedByUserId) && (d.decidedByRole === "admin" || d.decidedByRole === "supervisor")
    && (d.decision === "approved" || d.decision === "rejected" || d.decision === "withdrawn")
    && (d.reason === null && d.decision === "approved" || typeof d.reason === "string" && d.reason.trim().length >= 3 && d.reason.length <= 500), "INVALID_REPAIR_HISTORY");
  requireRepair((v.decisions.at(-1)?.decision ?? "awaiting_approval") === v.reviewState, "INVALID_REPAIR_HISTORY");
  const blob = await (await repairRequest(ctx, `records/${h.client_uuid}/after/content`)).blob();
  requireRepair(blob.type === "image/jpeg" && positive(blob.size) && blob.size <= 2 * 1024 * 1024
    && await sha256(await blob.arrayBuffer()) === v.evidence.storedSha256, "REPAIR_PHOTO_INTEGRITY");
  const bitmap = await createImageBitmap(blob); bitmap.close();
  await ctx.assert();
  return { blob, decisions: v.decisions as Array<{ sequence: number; decision: string; reason: string | null; decidedAt: string; decidedByUserId: number }> };
}

export function repairServiceHref(jobId: string, systemKey: string, findingId?: string) {
  return `#/repair-list/${encodeURIComponent(jobId)}/${encodeURIComponent(systemKey)}${findingId ? `/${encodeURIComponent(findingId)}` : ""}`;
}
export function repairLabel(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (object(value)) for (const key of ["displayName", "label", "name", "title", "reference", "unitNumber", "sequence"]) {
    if (typeof value[key] === "string" && (value[key] as string).trim()) return value[key] as string;
    if (typeof value[key] === "number") return String(value[key]);
  }
  return fallback;
}
export function repairUnitLabel(f: RepairFinding) {
  const unit = f.original.unit;
  if (object(unit)) {
    const ordinal = [unit.displaySequence, unit.sortOrder, unit.configuredRowOrdinal].find(positive);
    const location = repairLabel(unit.locationSnapshot, "") || repairLabel(unit.locationText, "") || repairLabel(unit.location, "");
    const asset = repairLabel(unit.assetReference, "");
    const labels = [ordinal ? `No. ${ordinal}` : "", asset, location].filter(Boolean);
    if (labels.length) return labels.join(" · ");
    if (typeof unit.label === "string" && unit.label.trim()) return unit.label;
    if (f.original.rowUuid) return `Row ${f.original.rowUuid}`;
  }
  return repairLabel(f.original.instance, String(f.original.instanceKey));
}
export const reviewLabel = (state: string) => ({ unsubmitted: "Not submitted to server", awaiting_approval: "Awaiting Approval", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" }[state] ?? "Unavailable");
export function repairRecovery(code: string) {
  if (code === "REPAIR_LOCAL_STORAGE_OUTCOME_UNKNOWN") return "Device storage completion could not be confirmed. This work may already be saved; rollback is not confirmed. Keep this form open and retry the available local action to confirm current work. Internet is not required.";
  if (code === "REPAIR_PHOTO_VERIFICATION_TIMEOUT") return "Stored photo verification took too long. Your committed remark and photo are retained. Retry Submit Locally on this device; internet is not required.";
  if (code === "REPAIR_LOCAL_STORAGE_TIMEOUT") return "Device storage took too long. Keep this form open and retry. If it keeps failing, another open Inspection tab may be holding device storage: close the other tabs or restart the browser, then retry. Your visible edits are not confirmed saved; previous saved work and photos are retained. Internet is not required.";
  if (/AUTH|IDENTITY|401|403|FORBIDDEN/.test(code)) return "Verify Sign-in, then refresh authority and retry Sync. Your local work and photos are retained.";
  if (/SOURCE|ELIGIBILITY/.test(code)) return "Ask Admin or Manager to review the source eligibility. Refresh authority, then retry the exact submission. Local work is retained.";
  if (/ORDER|ASSIGN|NOT_FOUND/.test(code)) return "Ask Manager to confirm or restore your repair assignment. Refresh authority and retry Sync. Local work is retained.";
  if (/INTEGRITY|INVALID|MISMATCH/.test(code)) return "Authority or photo integrity could not be verified. Download again; if it persists, ask Manager for help. Retained bytes are not deleted.";
  if (/LINEAGE|CYCLE/.test(code)) return "Refresh repair history before starting another cycle. Previous submissions and photos are retained.";
  return "Reconnect, verify sign-in and retry. Your saved work and photos remain on this device.";
}

/** Local-only Not Done markers for this actor. Stored in referenceData; nothing is sent to the server. */
export async function readNotDoneMarkers() {
  const ctx = await repairContext();
  const rows = await ctx.db.referenceData.where("key").startsWith("repair-ui:status:").toArray();
  await ctx.assert();
  const markers = new Map<string, NotDoneMarker>();
  for (const row of rows) {
    const findingId = row.key.slice("repair-ui:status:".length);
    const marker = parseNotDone(row.payload, ctx.actorId, findingId);
    if (marker) markers.set(findingId, marker);
  }
  return markers;
}
export async function markPartNotDone(findingId: string, reason: string) {
  requireRepair(uuid(findingId) && typeof reason === "string" && reason.trim().length <= 500, "INVALID_NOT_DONE");
  const ctx = await repairContext(), at = new Date().toISOString();
  const payload: NotDoneMarker = { actorId: ctx.actorId, findingId, status: "not_done", reason: reason.trim(), markedAt: at };
  await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
    await ctx.assert();
    await ctx.db.referenceData.put({ key: notDoneKey(findingId), payload, version: "1", fetchedAt: at, expiresAt: at });
  });
}
export async function clearPartNotDone(findingId: string) {
  requireRepair(uuid(findingId), "INVALID_NOT_DONE");
  const ctx = await repairContext();
  await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
    await ctx.assert();
    const row = await ctx.db.referenceData.get(notDoneKey(findingId));
    // Only this actor's own marker may be cleared.
    if (row && parseNotDone(row.payload, ctx.actorId, findingId)) await ctx.db.referenceData.delete(notDoneKey(findingId));
  });
}
export const repairCompareHref = (jobId: string, systemKey: string) => `#/repair-list/${encodeURIComponent(jobId)}/${encodeURIComponent(systemKey)}/compare`;
