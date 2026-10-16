import { beginWorkspaceActivity } from "../db/workspaceActivity";
import { canonical, fingerprint, hash, object, positive, requireRepair, timestamp, uuid } from "./repairContract";
import type { ReviewContext } from "./repairReviewRepository";
export type ExportSelection = { clientUuid: string; approvalSequence: number; sourceRevision: string; reviewSequence: number };
export type ExportBody = { requestId: string; jobId: string; systemKey: string; selection: ExportSelection[] };
export type ExportOperation = { actorId: number; actorRole: string; body: ExportBody; requestFingerprint: string; receipt?: IssuedExport; refusal?: string };
export type IssuedExport = { exportId: string; requestId: string; requestFingerprint: string; jobId: string; systemKey: string;
  number: string; issuedAt: string; selection: Array<ExportSelection & { approvalId: string; findingId: string; cycle: number }>;
  validity?: Array<{ clientUuid: string; state: string }> };
const prefix = "repair-export-request:";
// These failures are returned after the replay lookup and before commit, so the
// exact request was definitively not issued. Auth/transport/receipt failures and
// idempotency/concurrency conflicts remain unknown outcomes requiring replay.
const definitiveRefusals = new Set(["REPAIR_NOT_APPROVED", "STALE_SOURCE_REVIEW", "REPAIR_EXPORT_SCOPE", "INVALID_REPAIR_EXPORT",
  "REPAIR_SOURCE_CHANGED", "REPAIR_SOURCE_INVALID", "REPAIR_EVIDENCE_INVALID", "INVALID_REPAIR_APPROVAL", "INVALID_REPAIR_IDENTITY"]);
class ExportApiRefusal extends Error {}
function bodyValid(b: unknown): b is ExportBody {
  return object(b) && Object.keys(b).sort().join() === "jobId,requestId,selection,systemKey" && uuid(b.requestId) && uuid(b.jobId)
    && typeof b.systemKey === "string" && /^[a-z0-9_]{1,80}$/.test(b.systemKey) && Array.isArray(b.selection) && b.selection.length > 0 && b.selection.length <= 100
    && new Set(b.selection.map(s => object(s) ? s.clientUuid : null)).size === b.selection.length && b.selection.every(s => object(s)
      && Object.keys(s).sort().join() === "approvalSequence,clientUuid,reviewSequence,sourceRevision" && uuid(s.clientUuid) && positive(s.approvalSequence)
      && Number.isSafeInteger(s.reviewSequence) && Number(s.reviewSequence) >= 0 && hash(s.sourceRevision));
}
function validateReceipt(v: unknown): asserts v is IssuedExport {
  requireRepair(object(v) && Object.keys(v).filter(k => k !== "validity").sort().join() === "exportId,issuedAt,jobId,number,requestFingerprint,requestId,selection,systemKey"
    && uuid(v.exportId) && uuid(v.requestId) && hash(v.requestFingerprint) && uuid(v.jobId) && typeof v.systemKey === "string" && /^[a-z0-9_]{1,80}$/.test(v.systemKey)
    && typeof v.number === "string" && /^MFE\/RR\/\d{6,}$/.test(v.number) && timestamp(v.issuedAt) && Array.isArray(v.selection) && v.selection.length > 0
    && new Set(v.selection.map(s => object(s) ? s.clientUuid : null)).size === v.selection.length && v.selection.every(s => object(s)
      && Object.keys(s).sort().join() === "approvalId,approvalSequence,clientUuid,cycle,findingId,reviewSequence,sourceRevision"
      && uuid(s.clientUuid) && uuid(s.approvalId) && uuid(s.findingId) && positive(s.cycle) && positive(s.approvalSequence)
      && hash(s.sourceRevision) && Number.isSafeInteger(s.reviewSequence) && Number(s.reviewSequence) >= 0), "INVALID_REPAIR_EXPORT_RECEIPT");
}
async function response(ctx: ReviewContext, path: string, body?: ExportBody) {
  await ctx.assert(); const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const r = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal,
      headers: { "X-Expected-User-Id": String(ctx.user.id), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    await ctx.assert();
    if (!r.ok) {
      const v = await r.json().catch(() => null), code = object(v) && typeof v.error === "string" ? v.error : `REPAIR_HTTP_${r.status}`;
      if ((r.status === 400 || r.status === 409) && definitiveRefusals.has(code)) throw new ExportApiRefusal(code);
      throw new Error(code);
    }
    return r;
  } finally { clearTimeout(timer); }
}
export async function exportPreview(ctx: ReviewContext, body: ExportBody) {
  requireRepair(bodyValid(body));
  const v: unknown = await (await response(ctx, "/api/repairs/exports/preview", body)).json();
  requireRepair(object(v) && Object.keys(v).sort().join() === "html,jobId,selection,systemKey" && v.jobId === body.jobId && v.systemKey === body.systemKey
    && canonical(v.selection) === canonical(body.selection) && typeof v.html === "string" && v.html.includes("PREVIEW - NOT ISSUED"), "INVALID_REPAIR_EXPORT_PREVIEW");
  await ctx.assert(); return v.html;
}
export async function savedExports(ctx: ReviewContext, jobId: string, systemKey: string) {
  const entries = await ctx.db.referenceData.where("key").startsWith(prefix).toArray(), ops: ExportOperation[] = [];
  for (const e of entries) {
    const v = e.payload;
    requireRepair(object(v) && bodyValid(v.body) && v.actorId === ctx.user.id && (v.actorRole === "admin" || v.actorRole === "supervisor")
      && e.key === prefix + v.body.requestId && v.requestFingerprint === await fingerprint({ actorId: v.actorId, ...v.body }), "INVALID_REPAIR_EXPORT_CACHE");
    requireRepair(v.refusal === undefined || typeof v.refusal === "string" && definitiveRefusals.has(v.refusal) && v.receipt === undefined, "INVALID_REPAIR_EXPORT_CACHE");
    if (v.receipt) { validateReceipt(v.receipt); verify(v as ExportOperation, v.receipt); }
    if (v.body.jobId === jobId && v.body.systemKey === systemKey) ops.push(v as ExportOperation);
  }
  await ctx.assert(); return ops;
}
function verify(op: ExportOperation, v: IssuedExport) {
  validateReceipt(v);
  const selection = v.selection.map(({ clientUuid, approvalSequence, sourceRevision, reviewSequence }) => ({ clientUuid, approvalSequence, sourceRevision, reviewSequence }));
  requireRepair(v.requestId === op.body.requestId && v.requestFingerprint === op.requestFingerprint && v.jobId === op.body.jobId
    && v.systemKey === op.body.systemKey && canonical(selection) === canonical(op.body.selection), "INVALID_REPAIR_EXPORT_RECEIPT");
}
export async function saveExportRequest(ctx: ReviewContext, body: ExportBody) {
  requireRepair(bodyValid(body)); const op: ExportOperation = { actorId: ctx.user.id, actorRole: ctx.user.role, body: structuredClone(body),
    requestFingerprint: await fingerprint({ actorId: ctx.user.id, ...body }) };
  const finish = beginWorkspaceActivity();
  try { await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
    await ctx.assert(); requireRepair(!(await ctx.db.referenceData.get(prefix + body.requestId)), "REPAIR_EXPORT_UUID_OCCUPIED");
    const at = new Date().toISOString(); await ctx.db.referenceData.add({ key: prefix + body.requestId, payload: op, version: "1", fetchedAt: at, expiresAt: at });
  }); await ctx.assert(); return op; } finally { finish(); }
}
export async function replayExport(ctx: ReviewContext, op: ExportOperation) {
  const finish = beginWorkspaceActivity();
  try {
    await ctx.assert(); requireRepair(op.actorId === ctx.user.id && op.actorRole === ctx.user.role && bodyValid(op.body), "REPAIR_EXPORT_ACTOR_CHANGED");
    const key = prefix + op.body.requestId, saved = (await ctx.db.referenceData.get(key))?.payload;
    requireRepair(canonical(saved) === canonical(op) && op.requestFingerprint === await fingerprint({ actorId: ctx.user.id, ...op.body }), "REPAIR_EXPORT_REQUEST_CHANGED");
    let v: unknown;
    try { v = await (await response(ctx, "/api/repairs/exports", op.body)).json(); }
    catch (e) {
      if (e instanceof ExportApiRefusal) await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
        await ctx.assert(); requireRepair(canonical((await ctx.db.referenceData.get(key))?.payload) === canonical(saved) && !op.receipt, "REPAIR_EXPORT_REQUEST_CHANGED");
        await ctx.db.referenceData.update(key, { payload: { ...op, refusal: e.message } });
      });
      throw e;
    }
    validateReceipt(v); verify(op, v);
    requireRepair(!op.receipt || canonical(op.receipt) === canonical(v), "INVALID_REPAIR_EXPORT_RECEIPT");
    await ctx.db.transaction("rw", ctx.db.referenceData, async () => {
      await ctx.assert(); requireRepair(canonical((await ctx.db.referenceData.get(key))?.payload) === canonical(saved), "REPAIR_EXPORT_REQUEST_CHANGED");
      const { refusal: _refusal, ...confirmed } = op;
      await ctx.db.referenceData.update(key, { payload: { ...confirmed, receipt: v } });
    }); await ctx.assert(); return v;
  } finally { finish(); }
}
export async function exportHistory(ctx: ReviewContext, jobId: string, systemKey: string) {
  const v: unknown = await (await response(ctx, `/api/repairs/services/${jobId}/${systemKey}/exports`)).json();
  requireRepair(object(v) && Object.keys(v).sort().join() === "exports,jobId,systemKey" && v.jobId === jobId && v.systemKey === systemKey && Array.isArray(v.exports), "INVALID_REPAIR_EXPORT_HISTORY");
  for (const r of v.exports) {
    validateReceipt(r); requireRepair(r.jobId === jobId && r.systemKey === systemKey && Array.isArray(r.validity) && r.validity.length === r.selection.length
      && r.validity.every((s, i) => object(s) && Object.keys(s).sort().join() === "clientUuid,state" && s.clientUuid === r.selection[i].clientUuid
        && ["current", "approval_withdrawn", "approval_changed", "source_eligibility_changed", "authority_unavailable"].includes(s.state)), "INVALID_REPAIR_EXPORT_HISTORY");
  }
  requireRepair(new Set(v.exports.map((r: IssuedExport) => r.exportId)).size === v.exports.length, "INVALID_REPAIR_EXPORT_HISTORY");
  await ctx.assert(); return v.exports as IssuedExport[];
}
export async function exportPdf(ctx: ReviewContext, issued: IssuedExport) {
  validateReceipt(issued); const r = await response(ctx, `/api/repairs/exports/${issued.exportId}/pdf`);
  requireRepair(r.headers.get("content-type")?.startsWith("application/pdf"), "INVALID_REPAIR_EXPORT_PDF");
  const blob = await r.blob(); requireRepair(new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) === "%PDF-", "INVALID_REPAIR_EXPORT_PDF");
  await ctx.assert(); return blob;
}
