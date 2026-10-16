import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CurrentUser } from "../auth/authTypes.js";
import { extractRepairSource, fingerprint, sourceRevision, type Queryable } from "./acceptedSource.js";
import { RepairError, record, uuid, type R } from "./findingReaders.js";
export type Database = Pick<Pool,"query" | "connect">;
const notFound = (): never => { throw new RepairError("REPAIR_NOT_FOUND", "Repair service was not found.",404); };
const invalid = (): never => { throw new RepairError("INVALID_REPAIR_REQUEST", "Repair request is invalid.",400); };
export const repairUuid = (v: unknown): string => typeof v === "string" && uuid.test(v) ? v.toLowerCase() : invalid();
function bodyKeys(body: unknown, keys: string[]): R {
  if (!record(body) || Object.keys(body).length !== keys.length || keys.some(k => !Object.hasOwn(body,k))) return invalid();
  return body;
}
export async function activeActor(db: Queryable, actor: CurrentUser) {
  const user = await db.query("SELECT id FROM users WHERE id=$1 AND role=$2 AND is_active=true FOR SHARE",[actor.id,actor.role]);
  if (!user.rows.length) throw new RepairError("AUTH_REQUIRED","Sign in required.",401);
}
export async function serviceLock(db: Queryable, jobId: string, systemKey: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('repair_service:' || $1 || ':' || $2))",[jobId,systemKey]);
}
export async function correctionLock(db: Queryable, formId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('inspection_corrections:' || $1))",[formId]);
}
export async function repairAccess(db: Queryable, actor: CurrentUser, jobId: string, systemKey: string) {
  await activeActor(db,actor);
  const service = await db.query(`SELECT j.created_by_user_id AS owner,j.technician_visible AS visible
    FROM inspection_jobs j JOIN master_system_inspections p ON p.job_id=j.id
    WHERE j.id=$1 AND p.system_key=$2 AND j.is_sample=false
      AND EXISTS(SELECT 1 FROM master_system_form_instances f WHERE f.inspection_group_id=p.id AND f.status='submitted')
      AND EXISTS(SELECT 1 FROM repair_findings f WHERE f.job_id=j.id AND f.system_key=p.system_key)`,[jobId,systemKey]);
  if (!service.rows.length) return notFound();
  if (actor.role === "admin" || actor.role === "supervisor") return service.rows[0] as {owner: string | null; visible: boolean};
  // Any active technician may read a service that has repair findings; write authority stays on the actor's own active work order.
  return service.rows[0] as {owner: string | null; visible: boolean};
}
export async function transaction<T>(database: Database, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await database.connect();
  try { await db.query("BEGIN"); const result = await work(db); await db.query("COMMIT"); return result; }
  catch(error) {
    await db.query("ROLLBACK").catch(() => undefined);
    if (record(error) && ["23505","40001","40P01"].includes(String(error.code))) throw new RepairError("REPAIR_CONFLICT","Repair authority changed; refresh and retry.");
    throw error;
  } finally { db.release(); }
}

/** Explicit batched backfill. No startup/route runs it; call only with an authorized maintenance context.
 * Cursor uses UUID ordering (including zero-finding forms), never finding count. Entire batch rolls back on corruption. */
export async function materializeRepairFindings(database: Database, options: { afterFormId?: string; limit: number; jobId?: string }) {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) return invalid();
  const after = options.afterFormId === undefined ? null : repairUuid(options.afterFormId);
  const jobId = options.jobId === undefined ? null : repairUuid(options.jobId);
  return transaction(database,async db => {
    const forms = await db.query(`SELECT f.id FROM master_system_form_instances f JOIN master_system_inspections p ON p.id=f.inspection_group_id
      JOIN inspection_jobs j ON j.id=p.job_id WHERE f.status='submitted' AND j.is_sample=false
      AND ($1::uuid IS NULL OR f.id>$1) AND ($2::uuid IS NULL OR j.id=$2) ORDER BY f.id LIMIT $3`,[after,jobId,options.limit]);
    let inserted = 0;
    for (const {id} of forms.rows as Array<{id:string}>) {
      await correctionLock(db,id);
      const extracted = await extractRepairSource(db,id);
      for (const metadata of extracted.parts) {
        const hash = fingerprint(metadata);
        const existing = await db.query("SELECT source_fingerprint FROM repair_findings WHERE form_instance_id=$1 AND field_path=$2",[id,metadata.fieldPath]);
        if (existing.rows.length) {
          if (existing.rows[0].source_fingerprint !== hash) throw new RepairError("REPAIR_SOURCE_CHANGED","Frozen original finding changed.");
          continue;
        }
        await db.query(`INSERT INTO repair_findings(id,form_instance_id,job_id,system_key,field_path,original_metadata,source_fingerprint)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,metadata.jobId,metadata.systemKey,metadata.fieldPath,metadata,hash]);
        inserted++;
      }
    }
    return { inserted, scanned: forms.rows.length, nextCursor: forms.rows.at(-1)?.id ?? after };
  });
}

type Order = { id: string; job_id: string; system_key: string; assigned_to_user_id: string; revision: number; status: string; mutations: Array<R> };
const publicOrder = (o: Order) => ({ workOrderId: o.id,jobId: o.job_id,systemKey: o.system_key,assignedToUserId: Number(o.assigned_to_user_id),revision: o.revision,status: o.status });
export async function mutateRepairWorkOrder(database: Database, actor: CurrentUser, body: unknown, mode: "manager" | "self") {
  if (actor.role !== (mode === "manager" ? "admin" : "inspector")) throw new RepairError("FORBIDDEN","Permission denied.",403);
  const b = bodyKeys(body,mode === "manager" ? ["requestId","workOrderId","jobId","systemKey","assignedToUserId","expectedRevision","status"] : ["requestId","workOrderId","jobId","systemKey"]);
  const requestId = repairUuid(b.requestId), orderId = repairUuid(b.workOrderId), jobId = repairUuid(b.jobId);
  if (typeof b.systemKey !== "string" || !/^[a-z0-9_]{1,80}$/.test(b.systemKey)) return invalid();
  const systemKey = b.systemKey, target = mode === "self" ? actor.id : b.assignedToUserId;
  if (!Number.isSafeInteger(target) || Number(target) < 1 || mode === "manager" && (!Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision)<0 || typeof b.status !== "string" || !["active","revoked"].includes(b.status))) return invalid();
  const hash = fingerprint({ actorId:actor.id,mode,...b,requestId,workOrderId:orderId,jobId });
  return transaction(database,async db => {
    await activeActor(db,actor); await serviceLock(db,jobId,systemKey);
    const service = await repairAccess(db,actor,jobId,systemKey);
    const technician = await db.query("SELECT id FROM users WHERE id=$1 AND role='inspector' AND is_active=true FOR SHARE",[target]);
    if (!technician.rows.length) throw new RepairError("INVALID_TECHNICIAN","An active technician is required.",400);
    const found = await db.query<Order>("SELECT * FROM repair_work_orders WHERE id=$1 FOR UPDATE",[orderId]);
    const existing = found.rows[0];
    if (existing && (existing.job_id !== jobId || existing.system_key !== systemKey)) return notFound();
    if (mode === "self") {
      if (existing && String(existing.assigned_to_user_id) !== String(actor.id)) return notFound();
      const own = await db.query<Order>("SELECT * FROM repair_work_orders WHERE job_id=$1 AND system_key=$2 AND assigned_to_user_id=$3 ORDER BY created_at,id FOR UPDATE",[jobId,systemKey,actor.id]);
      // A manager revocation keeps binding that technician; self-start cannot bypass it.
      if (own.rows.some(o => o.status === "revoked")) throw new RepairError("WORK_ORDER_REVOKED","Repair access was revoked for this service.",403);
      const active = own.rows.find(o => o.status === "active");
      if (active) {
        const prior = active.mutations.find(v => v.requestId === requestId);
        if (prior && (prior.fingerprint !== hash || prior.actorId !== actor.id)) throw new RepairError("IDEMPOTENCY_CONFLICT","Request UUID has different content.");
        // Retry or second device: reuse the one ACTIVE order and return its receipt.
        return (prior ?? active.mutations.at(-1))!.receipt;
      }
    }
    const replay = existing?.mutations.find(v => v.requestId === requestId);
    if (replay) {
      if (replay.fingerprint !== hash || replay.actorId !== actor.id) throw new RepairError("IDEMPOTENCY_CONFLICT","Request UUID has different content.");
      return replay.receipt;
    }
    const expected = mode === "self" ? 0 : Number(b.expectedRevision);
    if ((existing?.revision ?? 0) !== expected) throw new RepairError("STALE_WORK_ORDER","Work-order revision changed.");
    const status = mode === "self" ? "active" : String(b.status);
    if (mode === "manager" && status === "active") {
      // At most one ACTIVE order per (technician, job, system); same logic as self-start, lock the technician's rows first.
      const held = await db.query<Order>("SELECT * FROM repair_work_orders WHERE job_id=$1 AND system_key=$2 AND assigned_to_user_id=$3 ORDER BY created_at,id FOR UPDATE",[jobId,systemKey,target]);
      if (held.rows.some(o => o.status === "active" && o.id !== orderId)) throw new RepairError("WORK_ORDER_ALREADY_ACTIVE","Technician already has an active repair order for this service.",409);
    }
    const receipt = { requestId,requestFingerprint:hash,workOrderId:orderId,jobId,systemKey,assignedToUserId:Number(target),revision:expected+1,status };
    const mutations = [...(existing?.mutations ?? []),{requestId,fingerprint:hash,actorId:actor.id,receipt}];
    if (existing) await db.query("UPDATE repair_work_orders SET assigned_to_user_id=$2,revision=$3,status=$4,mutations=$5,updated_at=now() WHERE id=$1",[orderId,target,expected+1,status,JSON.stringify(mutations)]);
    else await db.query(`INSERT INTO repair_work_orders(id,job_id,system_key,assigned_to_user_id,created_by_user_id,status,mutations) VALUES($1,$2,$3,$4,$5,$6,$7)`,[orderId,jobId,systemKey,target,actor.id,status,JSON.stringify(mutations)]);
    await db.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'repair.assignment','repairWorkOrder',$2,'success',$3)",[actor.id,orderId,JSON.stringify(receipt)]);
    return receipt;
  });
}

export async function reviewRepairFinding(database: Database, actor: CurrentUser, findingId: string, body: unknown) {
  if (!["admin","supervisor"].includes(actor.role)) throw new RepairError("FORBIDDEN","Reviewer required.",403);
  findingId = repairUuid(findingId);
  const b = bodyKeys(body,["requestId","expectedSourceRevision","expectedReviewSequence","decision","reason"]);
  const requestId = repairUuid(b.requestId);
  if (typeof b.expectedSourceRevision !== "string" || !/^[0-9a-f]{64}$/.test(b.expectedSourceRevision) || !Number.isSafeInteger(b.expectedReviewSequence) || Number(b.expectedReviewSequence)<0
    || typeof b.decision !== "string" || !["eligible","not_required"].includes(b.decision) || typeof b.reason !== "string" || b.reason.trim().length<3 || b.reason.trim().length>500) return invalid();
  const hash = fingerprint({actorId:actor.id,findingId,...b,requestId});
  const reason = b.reason.trim();
  return transaction(database,async db => {
    await activeActor(db,actor);
    const found = await db.query("SELECT * FROM repair_findings WHERE id=$1",[findingId]);
    const finding = found.rows[0]; if (!finding) return notFound();
    await correctionLock(db,finding.form_instance_id);
    await db.query("SELECT id FROM repair_findings WHERE id=$1 FOR UPDATE",[findingId]);
    // Fail closed on corrupt original authority even when a prior request is replayed.
    const source = await extractRepairSource(db,finding.form_instance_id);
    if (!source.parts.some(p => fingerprint(p) === finding.source_fingerprint)) throw new RepairError("REPAIR_SOURCE_CHANGED","Original authority changed.");
    const prior = await db.query("SELECT * FROM repair_finding_reviews WHERE finding_id=$1 ORDER BY sequence DESC",[findingId]);
    const replay = prior.rows.find(r => r.request_id === requestId);
    if (replay) {
      if (replay.request_fingerprint !== hash || String(replay.decided_by_user_id)!==String(actor.id)) throw new RepairError("IDEMPOTENCY_CONFLICT","Request UUID has different content.");
      return {requestId,requestFingerprint:hash,reviewId:replay.id,findingId,sequence:replay.sequence,sourceRevision:replay.source_revision,decision:replay.decision};
    }
    const revision = await sourceRevision(db,finding.form_instance_id);
    if (revision.revision !== b.expectedSourceRevision || (prior.rows[0]?.sequence ?? 0)!==b.expectedReviewSequence) throw new RepairError("STALE_SOURCE_REVIEW","Source or review revision changed.");
    const reviewId = randomUUID(), sequence = Number(b.expectedReviewSequence)+1;
    await db.query(`INSERT INTO repair_finding_reviews(id,finding_id,source_revision,decision,reason,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[reviewId,findingId,revision.revision,b.decision,reason,actor.id,actor.role,sequence,requestId,hash]);
    await db.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason) VALUES($1,'repair.source_review','repairFinding',$2,'success',$3)",[actor.id,findingId,b.decision]);
    return {requestId,requestFingerprint:hash,reviewId,findingId,sequence,sourceRevision:revision.revision,decision:b.decision};
  });
}

export async function readRepairService(database: Database, actor: CurrentUser, jobId: string, systemKey: string) {
  jobId = repairUuid(jobId);
  if (!/^[a-z0-9_]{1,80}$/.test(systemKey)) return invalid();
  return transaction(database,async db => {
    await serviceLock(db,jobId,systemKey); await repairAccess(db,actor,jobId,systemKey);
    const findings = await db.query("SELECT * FROM repair_findings WHERE job_id=$1 AND system_key=$2 ORDER BY form_instance_id,field_path",[jobId,systemKey]);
    const sources = new Map<string, Awaited<ReturnType<typeof extractRepairSource>>>();
    const revisions = new Map<string, Awaited<ReturnType<typeof sourceRevision>>>();
    for (const formId of [...new Set<string>(findings.rows.map(r => r.form_instance_id))].sort()) {
      await correctionLock(db,formId);
      sources.set(formId,await extractRepairSource(db,formId)); revisions.set(formId,await sourceRevision(db,formId));
    }
    const result = [];
    for (const f of findings.rows) {
      const source = sources.get(f.form_instance_id)!;
      if (!source.parts.some(p => fingerprint(p) === f.source_fingerprint)) throw new RepairError("REPAIR_SOURCE_CHANGED","Original authority changed.");
      const reviews = (await db.query("SELECT id,source_revision,decision,reason,sequence,decided_at,decided_by_user_id FROM repair_finding_reviews WHERE finding_id=$1 ORDER BY sequence",[f.id])).rows;
      const revision = revisions.get(f.form_instance_id)!; const last = reviews.at(-1);
      const eligibility = last?.source_revision === revision.revision ? last.decision : revision.correctionCount === 0 && !last ? "eligible" : "needs_review";
      const history = (await db.query(`SELECT r.client_uuid,r.cycle_sequence,r.predecessor_uuid,r.remark,r.performed_at,r.submitted_by_user_id,
        COALESCE((SELECT a.decision FROM repair_approvals a WHERE a.repair_uuid=r.client_uuid ORDER BY sequence DESC LIMIT 1),'awaiting_approval') AS review_state
        FROM repair_records r WHERE finding_id=$1 ORDER BY cycle_sequence`,[f.id])).rows;
      // Do not expose internal storage paths; photo content is an authorized finding-specific route.
      const original = structuredClone(f.original_metadata) as R;
      if (record(original.beforePhoto)) { const {storageRelativePath: _path,...photo} = original.beforePhoto; original.beforePhoto=photo; }
      result.push({findingId:f.id,sourceFingerprint:f.source_fingerprint,original,sourceRevision:revision.revision,eligibility,reviewSequence:last?.sequence ?? 0,reviews,history});
    }
    const orders = await db.query<Order>("SELECT * FROM repair_work_orders WHERE job_id=$1 AND system_key=$2 ORDER BY created_at,id",[jobId,systemKey]);
    return { jobId,systemKey,findings:result,workOrders:orders.rows.filter(o => actor.role!=="inspector" || String(o.assigned_to_user_id)===String(actor.id)).map(publicOrder) };
  });
}

export async function listRepairServices(database: Database, actor: CurrentUser) {
  await activeActor(database,actor);
  const result = await database.query(`SELECT DISTINCT f.job_id AS "jobId",f.system_key AS "systemKey",
    f.original_metadata->'sourceJob' AS "sourceJob",f.original_metadata->'customer' AS customer,
    f.original_metadata->'site' AS site,f.original_metadata->>'system' AS "systemLabel",j.service_date::text AS "visitDate"
    FROM repair_findings f JOIN inspection_jobs j ON j.id=f.job_id WHERE j.is_sample=false
    ORDER BY "jobId","systemKey"`);
  return { services: result.rows };
}
