import Dexie from "dexie";
import type { AuthUser } from "../auth/authApi";
import { currentWorkspaceUserId, deviceDatabase, localDatabase } from "../db/localDatabase";
import { beginWorkspaceActivity } from "../db/workspaceActivity";
import { actorId, canonical, fingerprint, hash, isVisitDate, object, parseRepairService, positive, requireRepair, sameAuthIdentity, sha256, timestamp, uuid } from "./repairContract";
import { verifyRepairBlob } from "./repairRepository";
import type { RepairFinding, RepairHistory, RepairService, RepairWorkOrder } from "./repairTypes";
import type { RepairServiceSummary } from "./repairUiRepository";

/** The live App grant is required in addition to device identity. Persisted identity
 * alone is never a reviewer capability. Pin both across every await/transaction. */
export async function reviewContext(user: AuthUser, isCurrent: () => boolean) {
  const db = localDatabase, auth = await deviceDatabase.authState.get("device-auth");
  requireRepair(isCurrent() && navigator.onLine && (user.role === "admin" || user.role === "supervisor")
    && currentWorkspaceUserId() === user.id && auth?.userId === user.id && auth.role === user.role
    && !auth.explicitLogout && !auth.serverLogoutPending, "REPAIR_REVIEW_AUTHORITY_REQUIRED");
  const ctx = { db, user, async assert() {
    const now = await Dexie.waitFor(deviceDatabase.authState.get("device-auth"));
    requireRepair(isCurrent() && navigator.onLine && db === localDatabase && currentWorkspaceUserId() === user.id
      && sameAuthIdentity(now, auth), "REPAIR_REVIEW_AUTHORITY_CHANGED");
  } };
  await ctx.assert(); return ctx;
}
export type ReviewContext = Awaited<ReturnType<typeof reviewContext>>;
async function request(ctx: ReviewContext, path: string, body?: unknown) {
  await ctx.assert();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      signal: controller.signal, headers: { "X-Expected-User-Id": String(ctx.user.id), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await ctx.assert();
    if (!response.ok) {
      const v: unknown = await response.json().catch(() => null);
      throw new Error(object(v) && typeof v.error === "string" ? v.error : `REPAIR_HTTP_${response.status}`);
    }
    return response;
  } finally { clearTimeout(timer); }
}
export async function reviewServices(ctx: ReviewContext): Promise<RepairServiceSummary[]> {
  const v: unknown = await (await request(ctx, "/api/repairs/services")).json();
  requireRepair(object(v) && Object.keys(v).join() === "services" && Array.isArray(v.services));
  const seen = new Set<string>();
  for (const s of v.services) {
    requireRepair(object(s) && ["customer,jobId,site,sourceJob,systemKey,systemLabel", "customer,jobId,site,sourceJob,systemKey,systemLabel,visitDate"].includes(Object.keys(s).sort().join()) && (s.visitDate === undefined || s.visitDate === null || isVisitDate(s.visitDate))
      && uuid(s.jobId) && typeof s.systemKey === "string" && /^[a-z0-9_]{1,80}$/.test(s.systemKey)
      && object(s.sourceJob) && Object.keys(s.sourceJob).sort().join() === "id,reference,title" && s.sourceJob.id === s.jobId
      && typeof s.sourceJob.reference === "string" && typeof s.sourceJob.title === "string"
      && object(s.customer) && uuid(s.customer.id) && typeof s.customer.code === "string" && typeof s.customer.displayName === "string"
      && (s.site === null || object(s.site) && uuid(s.site.id) && typeof s.site.displayName === "string") && typeof s.systemLabel === "string"
      && !seen.has(`${s.jobId}/${s.systemKey}`));
    seen.add(`${s.jobId}/${s.systemKey}`);
  }
  await ctx.assert(); return v.services as RepairServiceSummary[];
}
export async function reviewService(ctx: ReviewContext, jobId: string, systemKey: string): Promise<RepairService> {
  requireRepair(uuid(jobId) && /^[a-z0-9_]{1,80}$/.test(systemKey));
  const v: unknown = await (await request(ctx, `/api/repairs/services/${jobId}/${systemKey}`)).json();
  const service = parseRepairService(v, jobId, systemKey);
  for (const f of service.findings) {
    const last = f.reviews.at(-1) as { source_revision: string; decision: string } | undefined;
    requireRepair(last ? f.eligibility === (last.source_revision === f.sourceRevision ? last.decision : "needs_review")
      : f.eligibility === "eligible" || f.eligibility === "needs_review", "INVALID_REPAIR_AUTHORITY");
    requireRepair(f.reviews.every(r => object(r) && typeof r.reason === "string" && r.reason.length <= 500), "INVALID_REPAIR_AUTHORITY");
  }
  // Do not write to technician finding/record/Blob caches from a reviewer screen.
  await ctx.assert(); return service;
}
export type ReviewDecision = { clientUuid: string; sequence: number; decision: "approved" | "rejected" | "withdrawn"; reason: string | null;
  decidedAt: string; decidedByUserId: number; decidedByRole: "admin" | "supervisor"; requestId: string; requestFingerprint: string; decisionId: string };
export type SubmittedReview = { receipt: { clientUuid: string; workOrderId: string; sourceRevision: string }; decisions: ReviewDecision[];
  reviewState: RepairHistory["review_state"]; submittedAt: string; blob: Blob };
export async function submittedReview(ctx: ReviewContext, f: RepairFinding, h: RepairHistory): Promise<SubmittedReview> {
  const v: unknown = await (await request(ctx, `/api/repairs/records/${h.client_uuid}`)).json();
  requireRepair(object(v) && Object.keys(v).sort().join() === "decisions,evidence,manifest,performedAt,receipt,remark,reviewState,submittedAt,submittedByUserId"
    && object(v.receipt) && Object.keys(v.receipt).sort().join() === "clientUuid,cycleSequence,findingId,jobId,predecessorUuid,requestFingerprint,sourceRevision,systemKey,workOrderId"
    && object(v.evidence) && Object.keys(v.evidence).sort().join() === "findingId,jobId,photoUuid,repairUuid,requestFingerprint,sourceSha256,storedSha256,systemKey,workOrderId"
    && hash(v.receipt.sourceRevision) && hash(v.evidence.requestFingerprint) && timestamp(v.submittedAt)
    && v.reviewState === h.review_state && Array.isArray(v.decisions) && Array.isArray(v.manifest) && v.manifest.length === 1
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
    && timestamp(d.decidedAt) && positive(d.decidedByUserId) && (d.decidedByRole === "admin" || d.decidedByRole === "supervisor")
    && (d.decision === "approved" || d.decision === "rejected" || d.decision === "withdrawn")
    && (d.reason === null && d.decision === "approved" || typeof d.reason === "string" && d.reason.trim().length >= 3 && d.reason.length <= 500)
    && (i === 0 || v.decisions[i - 1].decision === "approved" && d.decision === "withdrawn"), "INVALID_REPAIR_HISTORY");
  requireRepair((v.decisions.at(-1)?.decision ?? "awaiting_approval") === v.reviewState, "INVALID_REPAIR_HISTORY");
  const blob = await (await request(ctx, `/api/repairs/records/${h.client_uuid}/after/content`)).blob();
  requireRepair(blob.type === "image/jpeg" && positive(blob.size) && blob.size <= 2 * 1024 * 1024
    && await sha256(await blob.arrayBuffer()) === v.evidence.storedSha256, "REPAIR_PHOTO_INTEGRITY");
  try { const bitmap = await createImageBitmap(blob); bitmap.close(); } catch { throw new Error("REPAIR_PHOTO_INTEGRITY"); }
  await ctx.assert(); return { ...v, blob } as unknown as SubmittedReview;
}
export async function reviewBefore(ctx: ReviewContext, f: RepairFinding) {
  if (f.original.beforePhotoMissing) { requireRepair(f.original.beforePhoto === null); return null; }
  requireRepair(f.original.beforePhoto, "REPAIR_PHOTO_INTEGRITY");
  const blob = await (await request(ctx, `/api/repairs/findings/${f.findingId}/before/content`)).blob();
  try { await verifyRepairBlob(blob, f.original.beforePhoto, f.original.beforePhoto.storedSha256); } catch { throw new Error("REPAIR_PHOTO_INTEGRITY"); }
  await ctx.assert(); return blob;
}
export type ReviewTechnician = { id: number; displayName: string | null; username: string };
export async function reviewTechnicians(ctx: ReviewContext): Promise<ReviewTechnician[]> {
  requireRepair(ctx.user.role === "admin", "FORBIDDEN");
  const v: unknown = await (await request(ctx, "/api/manager/technicians")).json();
  requireRepair(object(v) && Object.keys(v).join() === "technicians" && Array.isArray(v.technicians));
  const seen = new Set<number>();
  for (const t of v.technicians) {
    requireRepair(object(t) && Object.keys(t).sort().join() === "createdAt,displayName,id,isActive,role,supervisorIds,username"
      && positive(t.id) && !seen.has(t.id) && typeof t.username === "string" && (t.displayName === null || typeof t.displayName === "string")
      && (t.role === "inspector" || t.role === "supervisor") && typeof t.isActive === "boolean" && timestamp(t.createdAt)
      && Array.isArray(t.supervisorIds) && t.supervisorIds.every(actorId)); seen.add(t.id);
  }
  await ctx.assert(); return v.technicians.filter(t => t.role === "inspector" && t.isActive) as ReviewTechnician[];
}

export type ReviewOperation = { kind: "decision" | "source" | "assignment"; target: string; body: Record<string, unknown>;
  requestFingerprint: string; actorId: number; jobId: string; systemKey: string; receipt?: Record<string, unknown> };
const PREFIX = "repair-review:request:";
function identity(op: ReviewOperation) {
  return op.kind === "decision" ? { actorId: op.actorId, repairUuid: op.target, ...op.body }
    : op.kind === "source" ? { actorId: op.actorId, findingId: op.target, ...op.body } : { actorId: op.actorId, mode: "manager", ...op.body };
}
function operationKey(op: ReviewOperation) {
  return `${PREFIX}${op.kind}:${op.target}:${op.body.expectedSequence ?? op.body.expectedReviewSequence ?? op.body.expectedRevision}:${op.body.expectedSourceRevision ?? "order"}`;
}
function validateOperation(ctx: ReviewContext, op: ReviewOperation) {
  requireRepair(object(op) && Object.keys(op).every(k => ["kind", "target", "body", "requestFingerprint", "actorId", "jobId", "systemKey", "receipt"].includes(k))
    && op.actorId === ctx.user.id && uuid(op.target) && uuid(op.jobId) && /^[a-z0-9_]{1,80}$/.test(op.systemKey)
    && object(op.body) && uuid(op.body.requestId) && hash(op.requestFingerprint), "INVALID_REPAIR_REQUEST_CACHE");
  const b = op.body;
  if (op.kind === "assignment") requireRepair(Object.keys(b).sort().join() === "assignedToUserId,expectedRevision,jobId,requestId,status,systemKey,workOrderId"
    && b.workOrderId === op.target && b.jobId === op.jobId && b.systemKey === op.systemKey && positive(b.assignedToUserId)
    && Number.isSafeInteger(b.expectedRevision) && Number(b.expectedRevision) >= 0 && (b.status === "active" || b.status === "revoked"));
  else {
    requireRepair(op.kind === "decision" || op.kind === "source");
    const source = op.kind === "source", sequence = source ? b.expectedReviewSequence : b.expectedSequence;
    requireRepair(Object.keys(b).sort().join() === (source ? "decision,expectedReviewSequence,expectedSourceRevision,reason,requestId" : "decision,expectedSequence,expectedSourceRevision,reason,requestId")
      && hash(b.expectedSourceRevision) && Number.isSafeInteger(sequence) && Number(sequence) >= 0
      && (source ? b.decision === "eligible" || b.decision === "not_required" : b.decision === "approved" || b.decision === "rejected")
      && (b.reason === null && b.decision === "approved" || typeof b.reason === "string" && b.reason.trim().length >= 3 && b.reason.length <= 500));
  }
  if (op.receipt !== undefined) verifyReviewReceipt(op, op.receipt);
}
function verifyReviewReceipt(saved: ReviewOperation, v: unknown): asserts v is Record<string, unknown> {
  requireRepair(object(v) && v.requestId === saved.body.requestId && v.requestFingerprint === saved.requestFingerprint, "INVALID_REPAIR_RECEIPT");
  if (saved.kind === "decision") requireRepair(Object.keys(v).sort().join() === "clientUuid,decision,decisionId,requestFingerprint,requestId,sequence"
    && v.clientUuid === saved.target && uuid(v.decisionId) && v.sequence === Number(saved.body.expectedSequence) + 1 && v.decision === saved.body.decision, "INVALID_REPAIR_RECEIPT");
  else if (saved.kind === "source") requireRepair(Object.keys(v).sort().join() === "decision,findingId,requestFingerprint,requestId,reviewId,sequence,sourceRevision"
    && v.findingId === saved.target && uuid(v.reviewId) && v.sequence === Number(saved.body.expectedReviewSequence) + 1
    && v.sourceRevision === saved.body.expectedSourceRevision && v.decision === saved.body.decision, "INVALID_REPAIR_RECEIPT");
  else requireRepair(Object.keys(v).sort().join() === "assignedToUserId,jobId,requestFingerprint,requestId,revision,status,systemKey,workOrderId"
    && v.workOrderId === saved.target && v.jobId === saved.jobId && v.systemKey === saved.systemKey && v.assignedToUserId === saved.body.assignedToUserId
    && v.revision === Number(saved.body.expectedRevision) + 1 && v.status === saved.body.status, "INVALID_REPAIR_RECEIPT");
}
/** New writes are durable before fetch. The revision slot cannot acquire different
 * content after an unknown outcome. Replay reads the exact stored body and UUID. */
async function prepare(ctx: ReviewContext, op: Omit<ReviewOperation, "body" | "requestFingerprint" | "actorId"> & { body: Record<string, unknown> }) {
  const candidate: ReviewOperation = { ...op, actorId: ctx.user.id, body: { requestId: crypto.randomUUID(), ...op.body }, requestFingerprint: "" };
  candidate.requestFingerprint = await fingerprint(identity(candidate)); validateOperation(ctx, candidate);
  const key = operationKey(candidate);
  return ctx.db.transaction("rw", ctx.db.referenceData, async () => {
    await ctx.assert(); const prior = await ctx.db.referenceData.get(key);
    if (prior) {
      const saved = prior.payload as ReviewOperation; validateOperation(ctx, saved);
      requireRepair(canonical({ ...saved.body, requestId: null }) === canonical({ ...candidate.body, requestId: null })
        && saved.jobId === candidate.jobId && saved.systemKey === candidate.systemKey && saved.kind === candidate.kind && saved.target === candidate.target,
        "REPAIR_REQUEST_CONTENT_CONFLICT");
      return saved;
    }
    const at = new Date().toISOString(); await ctx.db.referenceData.add({ key, payload: candidate, version: "1", fetchedAt: at, expiresAt: at });
    return candidate;
  });
}
export async function reviewOperations(ctx: ReviewContext, jobId: string, systemKey: string) {
  const entries = await ctx.db.referenceData.where("key").startsWith(PREFIX).toArray(), ops: ReviewOperation[] = [];
  for (const entry of entries) {
    const op = entry.payload as ReviewOperation; validateOperation(ctx, op);
    requireRepair(entry.key === operationKey(op) && op.requestFingerprint === await fingerprint(identity(op)), "INVALID_REPAIR_REQUEST_CACHE");
    if (op.jobId === jobId && op.systemKey === systemKey) ops.push(op);
  }
  await ctx.assert(); return ops;
}
export async function replayReviewOperation(ctx: ReviewContext, operation: ReviewOperation) {
  const finish = beginWorkspaceActivity();
  try {
    validateOperation(ctx, operation);
    requireRepair(operation.kind !== "assignment" || ctx.user.role === "admin", "FORBIDDEN");
    const key = operationKey(operation);
    const saved = (await ctx.db.referenceData.get(key))?.payload as ReviewOperation;
    requireRepair(saved && canonical(saved) === canonical(operation) && saved.requestFingerprint === await fingerprint(identity(saved)), "REPAIR_REQUEST_CHANGED");
    const path = saved.kind === "decision" ? `/api/repairs/records/${saved.target}/decisions`
      : saved.kind === "source" ? `/api/repairs/findings/${saved.target}/source-review` : "/api/repairs/work-orders";
    const v: unknown = await (await request(ctx, path, saved.body)).json();
    verifyReviewReceipt(saved, v);
    requireRepair(saved.receipt === undefined || canonical(saved.receipt) === canonical(v), "INVALID_REPAIR_RECEIPT");
    await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
      await ctx.assert(); requireRepair(canonical((await ctx.db.referenceData.get(key))?.payload) === canonical(saved), "REPAIR_REQUEST_CHANGED");
      await ctx.db.referenceData.update(key, { payload: { ...saved, receipt: v } });
    });
    return v; // Never project this historical receipt as current authority; refresh instead.
  } finally { finish(); }
}
export async function decidePart(ctx: ReviewContext, f: RepairFinding, h: RepairHistory, detail: SubmittedReview, decision: "approved" | "rejected", reason: string | null) {
  requireRepair(h.review_state === "awaiting_approval" && detail.receipt.clientUuid === h.client_uuid && detail.reviewState === h.review_state, "STALE_REPAIR_DECISION");
  requireRepair(decision !== "approved" || f.eligibility === "eligible", "REPAIR_SOURCE_REVIEW_REQUIRED");
  const op = await prepare(ctx, { kind: "decision", target: h.client_uuid, jobId: f.original.jobId, systemKey: f.original.systemKey,
    body: { expectedSequence: detail.decisions.at(-1)?.sequence ?? 0, expectedSourceRevision: f.sourceRevision, decision, reason } });
  return replayReviewOperation(ctx, op);
}
export async function decideEligibility(ctx: ReviewContext, f: RepairFinding, decision: "eligible" | "not_required", reason: string) {
  const op = await prepare(ctx, { kind: "source", target: f.findingId, jobId: f.original.jobId, systemKey: f.original.systemKey,
    body: { expectedSourceRevision: f.sourceRevision, expectedReviewSequence: f.reviewSequence, decision, reason } });
  return replayReviewOperation(ctx, op);
}
export async function assignRepair(ctx: ReviewContext, service: RepairService, order: RepairWorkOrder | undefined, assignedToUserId: number, status: "active" | "revoked") {
  requireRepair(ctx.user.role === "admin", "FORBIDDEN");
  // New assignment gets one durable order UUID as well as one request UUID. A
  // response-loss retry is surfaced from saved requests rather than a new order.
  if (!order) requireRepair(!(await reviewOperations(ctx, service.jobId, service.systemKey)).some(o => o.kind === "assignment" && o.body.expectedRevision === 0 && !o.receipt), "REPAIR_ASSIGNMENT_REPLAY_REQUIRED");
  const workOrderId = order?.workOrderId ?? crypto.randomUUID();
  const op = await prepare(ctx, { kind: "assignment", target: workOrderId, jobId: service.jobId, systemKey: service.systemKey,
    body: { workOrderId, jobId: service.jobId, systemKey: service.systemKey, assignedToUserId, expectedRevision: order?.revision ?? 0, status } });
  return replayReviewOperation(ctx, op);
}
