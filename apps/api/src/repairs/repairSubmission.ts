import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import type { CurrentUser } from "../auth/authTypes.js";
import { loadConfig } from "../config/env.js";
import { moveNormalizedAttachment, normalizeAttachmentImage } from "../attachments/attachmentStorage.js";
import { extractRepairSource, fingerprint, readBeforeBytes, sourceRevision, type Queryable } from "./acceptedSource.js";
import { RepairError, record, type R } from "./findingReaders.js";
import { activeActor, correctionLock, repairAccess, repairUuid, serviceLock, transaction, type Database } from "./repairFoundation.js";

const invalid = (): never => { throw new RepairError("INVALID_REPAIR_REQUEST", "Repair request is invalid.", 400); };
const conflict = (code: string): never => { throw new RepairError(code, "Repair authority or evidence changed; refresh and retry."); };
const missing = (): never => { throw new RepairError("REPAIR_NOT_FOUND", "Repair was not found.", 404); };
function keys(value: unknown, names: string[]): R {
  if (!record(value) || Object.keys(value).length !== names.length || names.some(k => !Object.hasOwn(value,k))) return invalid();
  return value;
}
const hash = (v: unknown): string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : invalid();
const positive = (v: unknown): number => Number.isSafeInteger(v) && Number(v)>0 ? Number(v) : invalid();
const time = (v: unknown): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || v.startsWith("0000-") || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) return invalid();
  return v;
};
const identityKeys = ["findingId","workOrderId","jobId","systemKey","expectedWorkOrderRevision","expectedSourceRevision","sourceFingerprint"];
function identity(b: R) {
  if (typeof b.systemKey !== "string" || !/^[a-z0-9_]{1,80}$/.test(b.systemKey)) return invalid();
  return {findingId:repairUuid(b.findingId),workOrderId:repairUuid(b.workOrderId),jobId:repairUuid(b.jobId),systemKey:b.systemKey,
    expectedWorkOrderRevision:positive(b.expectedWorkOrderRevision),expectedSourceRevision:hash(b.expectedSourceRevision),sourceFingerprint:hash(b.sourceFingerprint)};
}
export function parseRepairPhoto(value: unknown) {
  const b=keys(value,[...identityKeys,"photoUuid","repairUuid","captureSource","capturedAt","sourceSha256","sizeBytes","width","height"]);
  if (typeof b.captureSource !== "string" || !["camera","gallery","unknown"].includes(b.captureSource)) return invalid();
  const sizeBytes=positive(b.sizeBytes),width=positive(b.width),height=positive(b.height);
  if (sizeBytes>2*1024*1024 || width>1600 || height>1600) return invalid();
  return {...identity(b),photoUuid:repairUuid(b.photoUuid),repairUuid:repairUuid(b.repairUuid),captureSource:b.captureSource,
    capturedAt:time(b.capturedAt),sourceSha256:hash(b.sourceSha256),sizeBytes,width,height};
}
export function parseRepairPart(value: unknown) {
  const b=keys(value,[...identityKeys,"clientUuid","cycleSequence","predecessorUuid","remark","performedAt","manifest"]);
  if (typeof b.remark !== "string" || !b.remark.trim() || b.remark.length>4000 || !Array.isArray(b.manifest) || b.manifest.length!==1) return invalid();
  const m=keys(b.manifest[0],["photoUuid","fieldPath","sourceSha256"]);
  if (typeof m.fieldPath !== "string" || m.fieldPath.length<1 || m.fieldPath.length>300) return invalid();
  return {...identity(b),clientUuid:repairUuid(b.clientUuid),cycleSequence:positive(b.cycleSequence),
    predecessorUuid:b.predecessorUuid===null?null:repairUuid(b.predecessorUuid),remark:b.remark,performedAt:time(b.performedAt),
    manifest:[{photoUuid:repairUuid(m.photoUuid),fieldPath:m.fieldPath,sourceSha256:hash(m.sourceSha256)}]};
}
type Identity = ReturnType<typeof identity>;
type Original = Awaited<ReturnType<typeof extractRepairSource>>["parts"][number];

/** Caller holds service, then correction, then finding locks. Never takes inspection job-open locks. */
async function authority(db: PoolClient, actor: CurrentUser, b: Identity, technician: boolean) {
  await serviceLock(db,b.jobId,b.systemKey);
  await repairAccess(db,actor,b.jobId,b.systemKey);
  if (technician) {
    if (actor.role!=="inspector") throw new RepairError("FORBIDDEN","Technician required.",403);
    const order=(await db.query("SELECT * FROM repair_work_orders WHERE id=$1 AND job_id=$2 AND system_key=$3 FOR UPDATE",[b.workOrderId,b.jobId,b.systemKey])).rows[0];
    if (!order || order.status!=="active" || String(order.assigned_to_user_id)!==String(actor.id)) return missing();
    if (order.revision!==b.expectedWorkOrderRevision) return conflict("STALE_WORK_ORDER");
  } else if (actor.role==="inspector") {
    // Reading a submitted record needs the actor's own live work order, not just read access to the service.
    const own=await db.query("SELECT 1 FROM repair_work_orders WHERE job_id=$1 AND system_key=$2 AND assigned_to_user_id=$3 AND status='active'",[b.jobId,b.systemKey,actor.id]);
    if (!own.rows.length) return missing();
  }
  const f=(await db.query("SELECT * FROM repair_findings WHERE id=$1 AND job_id=$2 AND system_key=$3",[b.findingId,b.jobId,b.systemKey])).rows[0];
  if (!f) return missing();
  await correctionLock(db,f.form_instance_id);
  await db.query("SELECT id FROM repair_findings WHERE id=$1 FOR UPDATE",[f.id]);
  const source=await extractRepairSource(db,f.form_instance_id);
  const original=source.parts.find(p=>fingerprint(p)===f.source_fingerprint);
  if (!original || f.source_fingerprint!==b.sourceFingerprint) return conflict("REPAIR_SOURCE_CHANGED");
  return {finding:f,original};
}
async function eligible(db: Queryable, f: R, expected: string, requireEligible=true) {
  const revision=await sourceRevision(db,String(f.form_instance_id));
  const last=(await db.query("SELECT * FROM repair_finding_reviews WHERE finding_id=$1 ORDER BY sequence DESC LIMIT 1",[f.id])).rows[0];
  const state=last?.source_revision===revision.revision?last.decision:revision.correctionCount===0&&!last?"eligible":"needs_review";
  if (revision.revision!==expected) return conflict("STALE_SOURCE_REVIEW");
  if (requireEligible && state!=="eligible") return conflict("SOURCE_NOT_ELIGIBLE");
}
function paths(repairUuid: string, photoUuid: string) {
  const relative=`repairs/${repairUuid}/${photoUuid}.jpg`;
  return {relative,absolute:path.resolve(loadConfig().uploadsPath,...relative.split("/"))};
}
async function evidenceBytes(e: R, original: Original) {
  const m=e.metadata;
  if (!record(m) || !record(m.input) || typeof e.photo_uuid!=="string" || typeof e.repair_uuid!=="string"
    || e.storage_relative_path!==paths(e.repair_uuid,e.photo_uuid).relative || !Number.isSafeInteger(m.storedSizeBytes)
    || !Number.isSafeInteger(m.width) || !Number.isSafeInteger(m.height)) return conflict("REPAIR_EVIDENCE_INVALID");
  try {
    const input=parseRepairPhoto(m.input);
    if (Object.keys(m).length!==8 || m.fieldPath!==original.fieldPath
      || fingerprint(m.template)!==fingerprint(original.template) || m.contractSha256!==original.contractSha256
      || m.beforePhotoMissing!==original.beforePhotoMissing || input.sourceFingerprint!==fingerprint(original)) return conflict("REPAIR_EVIDENCE_INVALID");
    if (input.photoUuid!==e.photo_uuid || input.repairUuid!==e.repair_uuid || input.findingId!==e.finding_id
      || input.workOrderId!==e.work_order_id || input.jobId!==e.job_id || input.systemKey!==e.system_key
      || input.sourceSha256!==e.source_sha256 || fingerprint({actorId:Number(e.uploader_user_id),...input})!==e.request_fingerprint) return conflict("REPAIR_EVIDENCE_INVALID");
    return await readBeforeBytes({photoUuid:e.photo_uuid,fieldPath:String(m.fieldPath),sourceSha256:String(e.source_sha256),storedSha256:String(e.stored_sha256),
      sizeBytes:Number(m.storedSizeBytes),width:Number(m.width),height:Number(m.height),storageRelativePath:String(e.storage_relative_path)});
  } catch { return conflict("REPAIR_EVIDENCE_INVALID"); }
}
function photoReceipt(e: R) {
  return {photoUuid:e.photo_uuid,repairUuid:e.repair_uuid,requestFingerprint:e.request_fingerprint,sourceSha256:e.source_sha256,
    storedSha256:e.stored_sha256,findingId:e.finding_id,workOrderId:e.work_order_id,jobId:e.job_id,systemKey:e.system_key};
}
function partReceipt(r: R) {
  return {clientUuid:r.client_uuid,requestFingerprint:r.request_fingerprint,findingId:r.finding_id,workOrderId:r.work_order_id,
    jobId:r.job_id,systemKey:r.system_key,cycleSequence:r.cycle_sequence,predecessorUuid:r.predecessor_uuid,sourceRevision:r.source_revision};
}
function ownEvidence(e: R, actor: CurrentUser, b: Identity, repairUuid: string) {
  if (e.repair_uuid!==repairUuid || e.finding_id!==b.findingId || e.work_order_id!==b.workOrderId || e.job_id!==b.jobId
    || e.system_key!==b.systemKey || String(e.uploader_user_id)!==String(actor.id)) return conflict("EVIDENCE_NOT_STAGED");
}
/** Reconstruct the frozen submission fingerprint, not merely the existence of a bound row. */
export async function boundEvidence(db: Queryable, r: R, original: Original) {
  const rows=(await db.query("SELECT * FROM staged_repair_evidence WHERE bound_repair_uuid=$1 AND status='accepted'",[r.client_uuid])).rows;
  if (rows.length!==1) return conflict("REPAIR_EVIDENCE_INVALID");
  const e=rows[0],metadata=e.metadata;
  try {
    if (!record(metadata) || !record(metadata.input)) return conflict("REPAIR_EVIDENCE_INVALID");
    const input=parseRepairPhoto(metadata.input);
    const performedAt=r.performed_at instanceof Date?r.performed_at.toISOString():new Date(String(r.performed_at)).toISOString();
    const part=parseRepairPart({...identity(input),clientUuid:r.client_uuid,cycleSequence:r.cycle_sequence,predecessorUuid:r.predecessor_uuid,
      remark:r.remark,performedAt,manifest:r.manifest});
    if (part.findingId!==r.finding_id || part.workOrderId!==r.work_order_id || part.jobId!==r.job_id || part.systemKey!==r.system_key
      || part.expectedSourceRevision!==r.source_revision || part.clientUuid!==e.repair_uuid
      || String(e.uploader_user_id)!==String(r.submitted_by_user_id)
      || part.manifest[0].photoUuid!==e.photo_uuid || part.manifest[0].sourceSha256!==e.source_sha256
      || part.manifest[0].fieldPath!==metadata.fieldPath || fingerprint({actorId:Number(r.submitted_by_user_id),...part})!==r.request_fingerprint) return conflict("REPAIR_EVIDENCE_INVALID");
    return {e,bytes:await evidenceBytes(e,original)};
  } catch {return conflict("REPAIR_EVIDENCE_INVALID");}
}
/** Exactly one immutable normalized After photo. Files are moved durably before committing the staging row. */
export async function stageRepairPhoto(database: Database, actor: CurrentUser, value: unknown, sourcePath: string) {
  let normalizedPath: string | undefined;
  try {
    const b=parseRepairPhoto(value);
    if (actor.role!=="inspector") throw new RepairError("FORBIDDEN","Technician required.",403);
    return await transaction(database,async db=>{
      const {finding,original}=await authority(db,actor,b,true);
      // Serialize global UUID collisions as well as the per-service photo slot.
      for (const key of [b.photoUuid,b.repairUuid].sort()) await db.query("SELECT pg_advisory_xact_lock(hashtext('repair_evidence:' || $1))",[key]);
      let image;
      try {image=await normalizeAttachmentImage(sourcePath);normalizedPath=image.normalizedTempPath;} catch {return invalid();}
      if (image.sourceSha256!==b.sourceSha256 || image.sourceSizeBytes!==b.sizeBytes || image.sourceWidth!==b.width || image.sourceHeight!==b.height) return conflict("PHOTO_METADATA_MISMATCH");
      const requestFingerprint=fingerprint({actorId:actor.id,...b});
      const existing=(await db.query("SELECT * FROM staged_repair_evidence WHERE photo_uuid=$1 OR repair_uuid=$2 FOR UPDATE",[b.photoUuid,b.repairUuid])).rows;
      if (existing.length) {
        const e=existing[0];ownEvidence(e,actor,b,b.repairUuid);
        if (e.photo_uuid!==b.photoUuid || e.request_fingerprint!==requestFingerprint) return conflict("IDEMPOTENCY_CONFLICT");
        await evidenceBytes(e,original); return photoReceipt(e);
      }
      if ((await db.query("SELECT 1 FROM repair_records WHERE client_uuid=$1",[b.repairUuid])).rows.length) return conflict("IDEMPOTENCY_CONFLICT");
      await eligible(db,finding,b.expectedSourceRevision);
      const before=original.beforePhoto;
      if (before && (b.sourceSha256===before.sourceSha256 || image.storedSha256===before.storedSha256)) return conflict("AFTER_EQUALS_BEFORE");
      const target=paths(b.repairUuid,b.photoUuid);
      const metadata={input:b,fieldPath:original.fieldPath,template:original.template,contractSha256:original.contractSha256,
        beforePhotoMissing:original.beforePhotoMissing,storedSizeBytes:image.storedSizeBytes,width:image.width,height:image.height};
      await moveNormalizedAttachment(image.normalizedTempPath,target.absolute);normalizedPath=undefined;
      // A DB failure after durable move leaves a recognizable orphan, never deletes committed evidence.
      const e=(await db.query(`INSERT INTO staged_repair_evidence(photo_uuid,repair_uuid,finding_id,work_order_id,job_id,system_key,uploader_user_id,
        request_fingerprint,source_sha256,stored_sha256,metadata,storage_relative_path,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'staged') RETURNING *`,
        [b.photoUuid,b.repairUuid,b.findingId,b.workOrderId,b.jobId,b.systemKey,actor.id,requestFingerprint,b.sourceSha256,image.storedSha256,metadata,target.relative])).rows[0];
      await audit(db,actor,"repair.evidence_stage",b.photoUuid,requestFingerprint);
      return photoReceipt(e);
    });
  } finally {
    await unlink(sourcePath).catch(()=>undefined);
    // Sharp may have created a partial output before rejecting a corrupt JPEG.
    await unlink(`${sourcePath}.jpg`).catch(()=>undefined);
    if (normalizedPath) await unlink(normalizedPath).catch(()=>undefined);
  }
}
async function audit(db: Queryable, actor: CurrentUser, action: string, id: string, reason: string) {
  await db.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,$2,'repair',$3,'success',$4)",[actor.id,action,id,reason]);
}
export async function submitRepairPart(database: Database, actor: CurrentUser, value: unknown) {
  const b=parseRepairPart(value);
  if (actor.role!=="inspector") throw new RepairError("FORBIDDEN","Technician required.",403);
  const requestFingerprint=fingerprint({actorId:actor.id,...b});
  return transaction(database,async db=>{
    const {finding,original}=await authority(db,actor,b,true);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('repair_record:' || $1))",[b.clientUuid]);
    const prior=(await db.query("SELECT * FROM repair_records WHERE client_uuid=$1 FOR UPDATE",[b.clientUuid])).rows[0];
    if (prior) {
      if (prior.request_fingerprint!==requestFingerprint || String(prior.submitted_by_user_id)!==String(actor.id)) return conflict("IDEMPOTENCY_CONFLICT");
      await boundEvidence(db,prior,original);return partReceipt(prior);
    }
    await eligible(db,finding,b.expectedSourceRevision);
    const latest=(await db.query(`SELECT r.*, (SELECT decision FROM repair_approvals a WHERE a.repair_uuid=r.client_uuid ORDER BY sequence DESC LIMIT 1) AS decision
      FROM repair_records r WHERE finding_id=$1 ORDER BY cycle_sequence DESC LIMIT 1`,[b.findingId])).rows[0];
    if (b.cycleSequence!==(latest?latest.cycle_sequence+1:1) || b.predecessorUuid!==(latest?.client_uuid??null) || latest&&!latest.decision) return conflict("REPAIR_CYCLE_OCCUPIED");
    const photos=(await db.query("SELECT * FROM staged_repair_evidence WHERE repair_uuid=$1 FOR UPDATE",[b.clientUuid])).rows;
    if (photos.length!==1) return conflict("EVIDENCE_NOT_STAGED");
    const e=photos[0],m=b.manifest[0];ownEvidence(e,actor,b,b.clientUuid);
    if (e.status!=="staged" || e.photo_uuid!==m.photoUuid || e.source_sha256!==m.sourceSha256 || m.fieldPath!==original.fieldPath) return conflict("EVIDENCE_NOT_STAGED");
    const metadata=e.metadata;
    if (!record(metadata) || !record(metadata.input) || metadata.input.expectedSourceRevision!==b.expectedSourceRevision
      || metadata.input.expectedWorkOrderRevision!==b.expectedWorkOrderRevision || metadata.input.sourceFingerprint!==b.sourceFingerprint
      || metadata.fieldPath!==original.fieldPath || fingerprint(metadata.template)!==fingerprint(original.template)
      || metadata.contractSha256!==original.contractSha256 || metadata.beforePhotoMissing!==original.beforePhotoMissing) return conflict("EVIDENCE_NOT_STAGED");
    await evidenceBytes(e,original);
    const before=original.beforePhoto;
    if (before && (e.source_sha256===before.sourceSha256 || e.stored_sha256===before.storedSha256)) return conflict("AFTER_EQUALS_BEFORE");
    if ((await db.query(`SELECT 1 FROM staged_repair_evidence WHERE job_id=$1 AND system_key=$2 AND status='accepted'
      AND (source_sha256=$3 OR stored_sha256=$4)`,[b.jobId,b.systemKey,e.source_sha256,e.stored_sha256])).rows.length) return conflict("REPAIR_PHOTO_REUSED");
    const r=(await db.query(`INSERT INTO repair_records(client_uuid,finding_id,work_order_id,job_id,system_key,cycle_sequence,predecessor_uuid,remark,
      performed_at,submitted_by_user_id,source_revision,manifest,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [b.clientUuid,b.findingId,b.workOrderId,b.jobId,b.systemKey,b.cycleSequence,b.predecessorUuid,b.remark,b.performedAt,actor.id,b.expectedSourceRevision,JSON.stringify(b.manifest),requestFingerprint])).rows[0];
    await db.query("UPDATE staged_repair_evidence SET status='accepted',bound_repair_uuid=$2 WHERE photo_uuid=$1",[e.photo_uuid,b.clientUuid]);
    await audit(db,actor,"repair.submit",b.clientUuid,requestFingerprint);return partReceipt(r);
  });
}
/** Each part is atomic; envelope scope/duplicates are checked before any writes. */
export async function submitRepairBatch(database: Database, actor: CurrentUser, value: unknown) {
  const b=keys(value,["jobId","systemKey","parts"]),jobId=repairUuid(b.jobId);
  if (typeof b.systemKey!=="string" || !Array.isArray(b.parts) || b.parts.length<1 || b.parts.length>100) return invalid();
  const parts=b.parts.map(parseRepairPart);
  if (parts.some(p=>p.jobId!==jobId || p.systemKey!==b.systemKey) || new Set(parts.map(p=>p.clientUuid)).size!==parts.length
    || new Set(parts.map(p=>p.findingId)).size!==parts.length) return invalid();
  const results=[];
  for (const part of parts) {
    try {results.push({clientUuid:part.clientUuid,outcome:"submitted",receipt:await submitRepairPart(database,actor,part)});}
    catch(e) {
      if (!(e instanceof RepairError)) throw e;
      await database.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'repair.submit','repair',$2,'failure',$3)",[actor.id,part.clientUuid,e.code]);
      results.push({clientUuid:part.clientUuid,outcome:"failed",error:e.code});
    }
  }
  return {jobId,systemKey:b.systemKey,results};
}
export async function decideRepair(database: Database, actor: CurrentUser, repairUuid: string, value: unknown) {
  if (!["admin","supervisor"].includes(actor.role)) throw new RepairError("FORBIDDEN","Reviewer required.",403);
  repairUuid=repairUuidId(repairUuid);
  const b=keys(value,["requestId","expectedSequence","expectedSourceRevision","decision","reason"]),requestId=repairUuidId(b.requestId);
  if (!Number.isSafeInteger(b.expectedSequence) || Number(b.expectedSequence)<0 || typeof b.decision!=="string" || !["approved","rejected","withdrawn"].includes(b.decision)
    || !(b.reason===null || typeof b.reason==="string" && b.reason.trim().length>=3 && b.reason.length<=500)
    || b.decision!=="approved" && b.reason===null) return invalid();
  const expected=hash(b.expectedSourceRevision),requestFingerprint=fingerprint({actorId:actor.id,repairUuid,...b,requestId});
  return transaction(database,async db=>{
    await activeActor(db,actor);
    const r=(await db.query("SELECT * FROM repair_records WHERE client_uuid=$1",[repairUuid])).rows[0];if (!r) return missing();
    const f=(await db.query("SELECT source_fingerprint FROM repair_findings WHERE id=$1",[r.finding_id])).rows[0];
    const {finding,original}=await authority(db,actor,{findingId:r.finding_id,workOrderId:r.work_order_id,jobId:r.job_id,systemKey:r.system_key,
      expectedWorkOrderRevision:1,expectedSourceRevision:expected,sourceFingerprint:f.source_fingerprint},false);
    await db.query("SELECT client_uuid FROM repair_records WHERE client_uuid=$1 FOR UPDATE",[repairUuid]);
    await boundEvidence(db,r,original);
    const history=(await db.query("SELECT * FROM repair_approvals WHERE repair_uuid=$1 ORDER BY sequence",[repairUuid])).rows;
    const replay=history.find(a=>a.request_id===requestId);
    if (replay) {
      if (replay.request_fingerprint!==requestFingerprint || String(replay.decided_by_user_id)!==String(actor.id)) return conflict("IDEMPOTENCY_CONFLICT");
      return decisionReceipt(replay);
    }
    await eligible(db,finding,expected,b.decision==="approved");
    const last=history.at(-1);
    if ((last?.sequence??0)!==b.expectedSequence || last && !(last.decision==="approved" && b.decision==="withdrawn")) return conflict("STALE_REPAIR_DECISION");
    const decision=(await db.query(`INSERT INTO repair_approvals(id,repair_uuid,decision,reason,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[randomUUID(),repairUuid,b.decision,b.reason,actor.id,actor.role,Number(b.expectedSequence)+1,requestId,requestFingerprint])).rows[0];
    await audit(db,actor,"repair.decision",repairUuid,JSON.stringify({requestId,decisionId:decision.id,requestFingerprint,sourceRevision:expected}));
    return decisionReceipt(decision);
  });
}
const repairUuidId=repairUuid;
function decisionReceipt(a: R) {
  return {requestId:a.request_id,requestFingerprint:a.request_fingerprint,decisionId:a.id,clientUuid:a.repair_uuid,sequence:a.sequence,decision:a.decision};
}
export async function readSubmittedRepair(database: Database, actor: CurrentUser, clientUuid: string, content=false) {
  clientUuid=repairUuid(clientUuid);
  return transaction(database,async db=>{
    const r=(await db.query("SELECT * FROM repair_records WHERE client_uuid=$1",[clientUuid])).rows[0];if (!r) return missing();
    const f=(await db.query("SELECT * FROM repair_findings WHERE id=$1",[r.finding_id])).rows[0];
    const {original}=await authority(db,actor,{findingId:r.finding_id,workOrderId:r.work_order_id,jobId:r.job_id,systemKey:r.system_key,
      expectedWorkOrderRevision:1,expectedSourceRevision:r.source_revision,sourceFingerprint:f.source_fingerprint},false);
    const {e,bytes}=await boundEvidence(db,r,original);
    if (content) return {bytes};
    const decisions=(await db.query("SELECT * FROM repair_approvals WHERE repair_uuid=$1 ORDER BY sequence",[clientUuid])).rows.map(a=>({
      ...decisionReceipt(a),reason:a.reason,decidedAt:a.decided_at,decidedByUserId:Number(a.decided_by_user_id),decidedByRole:a.decided_by_role}));
    return {receipt:partReceipt(r),remark:r.remark,performedAt:r.performed_at,submittedAt:r.submitted_at,submittedByUserId:Number(r.submitted_by_user_id),
      manifest:r.manifest,evidence:photoReceipt(e),reviewState:decisions.at(-1)?.decision??"awaiting_approval",decisions};
  });
}
