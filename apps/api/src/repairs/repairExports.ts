import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CurrentUser } from "../auth/authTypes.js";
import { renderHtmlToPdf } from "../reports/pdf/htmlToPdf.js";
import { activeActor, correctionLock, repairAccess, repairUuid, serviceLock, transaction, type Database } from "./repairFoundation.js";
import { extractRepairSource, fingerprint, readBeforeBytes, sourceRevision } from "./acceptedSource.js";
import { boundEvidence } from "./repairSubmission.js";
import { RepairError, record, type R } from "./findingReaders.js";
import { repairReportHtml, type ExportPart } from "./repairReport.js";
const fail = (code = "INVALID_REPAIR_EXPORT", status = 409): never => { throw new RepairError(code, "Repair export authority is unavailable; refresh and retry.", status); };
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
function reviewer(actor: CurrentUser) { if (!["admin", "supervisor"].includes(actor.role)) fail("FORBIDDEN", 403); }
export type ExportSelection = { clientUuid: string; approvalSequence: number; sourceRevision: string; reviewSequence: number };
export function parseExportRequest(value: unknown) {
  if (!record(value) || Object.keys(value).sort().join() !== "jobId,requestId,selection,systemKey" || typeof value.systemKey !== "string"
    || !/^[a-z0-9_]{1,80}$/.test(value.systemKey) || !Array.isArray(value.selection) || !value.selection.length || value.selection.length > 100) return fail("INVALID_REPAIR_EXPORT", 400);
  const selection: ExportSelection[] = value.selection.map(v => {
    if (!record(v) || Object.keys(v).sort().join() !== "approvalSequence,clientUuid,reviewSequence,sourceRevision"
      || !Number.isSafeInteger(v.approvalSequence) || Number(v.approvalSequence) < 1 || !Number.isSafeInteger(v.reviewSequence) || Number(v.reviewSequence) < 0
      || typeof v.sourceRevision !== "string" || !/^[0-9a-f]{64}$/.test(v.sourceRevision)) return fail("INVALID_REPAIR_EXPORT", 400);
    return { clientUuid: repairUuid(v.clientUuid), approvalSequence: Number(v.approvalSequence), sourceRevision: v.sourceRevision, reviewSequence: Number(v.reviewSequence) };
  });
  if (new Set(selection.map(p => p.clientUuid)).size !== selection.length) return fail("INVALID_REPAIR_EXPORT", 400);
  // Canonical order; repeated cycles are separate explicit UUID entries.
  selection.sort((a, b) => a.clientUuid.localeCompare(b.clientUuid));
  return { requestId: repairUuid(value.requestId), jobId: repairUuid(value.jobId), systemKey: value.systemKey, selection };
}
type Request = ReturnType<typeof parseExportRequest>;
async function scope(db: PoolClient, actor: CurrentUser, jobId: string, systemKey: string) {
  reviewer(actor); await activeActor(db, actor); await serviceLock(db, jobId, systemKey); await repairAccess(db, actor, jobId, systemKey);
}
/** Service lock serializes decisions/submissions. Sorted correction locks serialize
 * corrections and source reviews. READ COMMITTED reads occur only AFTER those locks,
 * so records, decisions and source revisions describe one consistent authority. */
async function selected(db: PoolClient, b: Request): Promise<ExportPart[]> {
  const rows = (await db.query(`SELECT r.*,f.form_instance_id,f.original_metadata,f.source_fingerprint FROM repair_records r
    JOIN repair_findings f ON f.id=r.finding_id WHERE r.client_uuid=ANY($1::uuid[]) ORDER BY r.client_uuid`, [b.selection.map(p => p.clientUuid)])).rows;
  if (rows.length !== b.selection.length || rows.some(r => r.job_id !== b.jobId || r.system_key !== b.systemKey)) return fail("REPAIR_EXPORT_SCOPE");
  for (const form of [...new Set<string>(rows.map(r => r.form_instance_id))].sort()) await correctionLock(db, form);
  for (const finding of [...new Set<string>(rows.map(r => r.finding_id))].sort()) await db.query("SELECT id FROM repair_findings WHERE id=$1 FOR UPDATE", [finding]);
  const parts: ExportPart[] = [];
  for (const r of rows) {
    const s = b.selection.find(p => p.clientUuid === r.client_uuid)!;
    const source = await extractRepairSource(db, r.form_instance_id);
    const original = source.parts.find(p => fingerprint(p) === r.source_fingerprint);
    if (!original || fingerprint(r.original_metadata) !== r.source_fingerprint) return fail("REPAIR_SOURCE_CHANGED");
    const revision = await sourceRevision(db, r.form_instance_id);
    const review = (await db.query("SELECT * FROM repair_finding_reviews WHERE finding_id=$1 ORDER BY sequence DESC LIMIT 1", [r.finding_id])).rows[0];
    const eligible = review?.source_revision === revision.revision ? review.decision === "eligible" : !review && revision.correctionCount === 0;
    if (!eligible || revision.revision !== s.sourceRevision || (review?.sequence ?? 0) !== s.reviewSequence) return fail("STALE_SOURCE_REVIEW");
    const approvals = (await db.query("SELECT * FROM repair_approvals WHERE repair_uuid=$1 ORDER BY sequence", [r.client_uuid])).rows;
    const approval = approvals.at(-1);
    if (!approval || approval.decision !== "approved" || approval.sequence !== s.approvalSequence) return fail("REPAIR_NOT_APPROVED");
    // Verify append-only approval against its original audited source revision and
    // exact request fingerprint. A stored decision enum alone is insufficient.
    const audits = (await db.query("SELECT reason FROM audit_events WHERE action='repair.decision' AND entity_id=$1 AND actor_user_id=$2 AND result='success'", [r.client_uuid, approval.decided_by_user_id])).rows;
    const audit = audits.map(a => { try { return JSON.parse(a.reason); } catch { return null; } }).find(a => a?.decisionId === approval.id);
    if (approvals.length !== approval.sequence || approvals.some((a, i) => a.sequence !== i + 1 || !["admin", "supervisor"].includes(a.decided_by_role))
      || !audit || audit.requestId !== approval.request_id || audit.requestFingerprint !== approval.request_fingerprint
      || typeof audit.sourceRevision !== "string" || !/^[0-9a-f]{64}$/.test(audit.sourceRevision)
      || fingerprint({ actorId: Number(approval.decided_by_user_id), repairUuid: r.client_uuid, requestId: approval.request_id,
        expectedSequence: approval.sequence - 1, expectedSourceRevision: audit.sourceRevision, decision: approval.decision, reason: approval.reason }) !== approval.request_fingerprint) return fail("INVALID_REPAIR_APPROVAL");
    const people = (await db.query("SELECT id,username FROM users WHERE id=ANY($1::bigint[])", [[r.submitted_by_user_id, approval.decided_by_user_id]])).rows;
    const technician = people.find(p => String(p.id) === String(r.submitted_by_user_id)), approver = people.find(p => String(p.id) === String(approval.decided_by_user_id));
    if (!technician || !approver) return fail("INVALID_REPAIR_IDENTITY");
    const { bytes } = await boundEvidence(db, r, original);
    const before = original.beforePhoto ? await readBeforeBytes(original.beforePhoto) : null;
    parts.push({ ...s, approvalId: approval.id, findingId: r.finding_id, cycle: r.cycle_sequence, original,
      before: before ? `data:image/jpeg;base64,${before.toString("base64")}` : null, after: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      remark: r.remark, technician: `${technician.username} (#${technician.id})`, performedAt: r.performed_at.toISOString(), submittedAt: r.submitted_at.toISOString(),
      reviewer: `${approval.decided_by_role === "admin" ? "Manager" : "Admin"} ${approver.username} (#${approver.id})`, reviewedAt: approval.decided_at.toISOString() });
  }
  return parts;
}
const reportNumber = (n: string | number) => `MFE/RR/${String(n).padStart(6, "0")}`;
function receipt(r: R) { return { exportId: String(r.id), requestId: String(r.request_id), requestFingerprint: String(r.request_fingerprint),
  jobId: String(r.job_id), systemKey: String(r.system_key), number: reportNumber(String(r.number)), issuedAt: (r.issued_at as Date).toISOString(),
  selection: r.selection as Array<ExportSelection & { approvalId: string; findingId: string; cycle: number }> }; }
export async function previewRepairExport(database: Database, actor: CurrentUser, value: unknown) {
  reviewer(actor); const b = parseExportRequest(value);
  return transaction(database, async db => { await scope(db, actor, b.jobId, b.systemKey);
    return { jobId: b.jobId, systemKey: b.systemKey, selection: b.selection, html: repairReportHtml(await selected(db, b), "PREVIEW", new Date().toISOString(), true) }; });
}
export async function issueRepairExport(database: Database, actor: CurrentUser, value: unknown) {
  reviewer(actor); const b = parseExportRequest(value), hash = fingerprint({ actorId: actor.id, ...b });
  return transaction(database, async db => {
    await scope(db, actor, b.jobId, b.systemKey);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('repair_export:' || $1))", [b.requestId]);
    const previous = (await db.query("SELECT * FROM repair_exports WHERE request_id=$1", [b.requestId])).rows[0];
    if (previous) {
      if (previous.request_fingerprint !== hash || String(previous.actor_user_id) !== String(actor.id)) return fail("IDEMPOTENCY_CONFLICT");
      return receipt(previous); // Issued identity survives later withdrawal/correction.
    }
    const parts = await selected(db, b), issuedAt = new Date().toISOString(), exportId = randomUUID();
    const n = (await db.query("SELECT nextval(pg_get_serial_sequence('repair_exports','number')) AS n")).rows[0].n;
    const html = repairReportHtml(parts, reportNumber(n), issuedAt), pdf = await renderHtmlToPdf(html);
    const r = (await db.query(`INSERT INTO repair_exports(id,number,request_id,request_fingerprint,actor_user_id,job_id,system_key,selection,issued_at,presentation,pdf,pdf_sha256)
      OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [exportId, n, b.requestId, hash, actor.id, b.jobId, b.systemKey,
      JSON.stringify(parts.map(({ clientUuid, approvalSequence, sourceRevision, reviewSequence, approvalId, findingId, cycle }) => ({ clientUuid, approvalSequence, sourceRevision, reviewSequence, approvalId, findingId, cycle }))), issuedAt, html, pdf, digest(pdf)])).rows[0];
    await db.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'repair.export','repairExport',$2,'success',$3)", [actor.id, exportId, hash]);
    return receipt(r);
  });
}
export async function repairExportHistory(database: Database, actor: CurrentUser, jobId: string, systemKey: string) {
  jobId = repairUuid(jobId); if (!/^[a-z0-9_]{1,80}$/.test(systemKey)) return fail();
  return transaction(database, async db => {
    await scope(db, actor, jobId, systemKey);
    const rows = (await db.query("SELECT * FROM repair_exports WHERE job_id=$1 AND system_key=$2 ORDER BY number DESC", [jobId, systemKey])).rows;
    const forms = (await db.query("SELECT DISTINCT form_instance_id FROM repair_findings WHERE job_id=$1 AND system_key=$2 ORDER BY form_instance_id", [jobId, systemKey])).rows;
    for (const f of forms) await correctionLock(db, f.form_instance_id);
    const exports = [];
    for (const r of rows) {
      const validity = [];
      for (const s of r.selection) {
        const f = (await db.query("SELECT f.* FROM repair_findings f JOIN repair_records r ON r.finding_id=f.id WHERE r.client_uuid=$1", [s.clientUuid])).rows[0];
        const last = (await db.query("SELECT decision,sequence FROM repair_approvals WHERE repair_uuid=$1 ORDER BY sequence DESC LIMIT 1", [s.clientUuid])).rows[0];
        const revision = f ? await sourceRevision(db, f.form_instance_id) : null;
        const review = f ? (await db.query("SELECT * FROM repair_finding_reviews WHERE finding_id=$1 ORDER BY sequence DESC LIMIT 1", [f.id])).rows[0] : null;
        validity.push({ clientUuid: s.clientUuid, state: !last || !revision ? "authority_unavailable" : last.decision === "withdrawn" ? "approval_withdrawn"
          : last.decision !== "approved" || last.sequence !== s.approvalSequence ? "approval_changed" : revision.revision !== s.sourceRevision || (review?.sequence ?? 0) !== s.reviewSequence ? "source_eligibility_changed" : "current" });
      }
      exports.push({ ...receipt(r), validity });
    }
    return { jobId, systemKey, exports };
  });
}
export async function downloadRepairExport(database: Database, actor: CurrentUser, exportId: string) {
  reviewer(actor); exportId = repairUuid(exportId);
  return transaction(database, async db => {
    const r = (await db.query("SELECT * FROM repair_exports WHERE id=$1", [exportId])).rows[0]; if (!r) return fail("REPAIR_NOT_FOUND", 404);
    await scope(db, actor, r.job_id, r.system_key);
    if (!Buffer.isBuffer(r.pdf) || digest(r.pdf) !== r.pdf_sha256) return fail("REPAIR_EXPORT_CORRUPT");
    return { bytes: r.pdf as Buffer, number: reportNumber(r.number) };
  });
}
