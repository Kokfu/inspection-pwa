import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireRole, requireRoleAudited } from "../middleware/requireRole.js";
import { requireExpectedActor } from "../jobs/technicianOwnership.js";
import { isSectionRemarkKey, isSectionRemarkSystemKey } from "../inspections/remarkSections.js";
import { normaliseSectionRemarkWording } from "../inspections/sectionRemarkText.js";

type Database = Pick<Pool, "query" | "connect">;
type Queryable = Pick<Pool | PoolClient, "query">;
type Actor = NonNullable<Request["currentUser"]>;
type Existing = { id: string; wording: string };
type RemarkRequest = {
  id: string; systemKey: string; sectionKey: string; wording: string;
  customerId: string; customerDisplayName: string; jobId: string | null; jobReference: string | null;
  requestedByUserId: number; requestedBy: string; createdAt: string;
  status: "pending" | "approved" | "rejected";
  decision: { id: string; decision: "approved" | "rejected"; reviewerUserId: number; reviewer: string;
    reviewerRole: "admin" | "supervisor"; note: string | null; approvedWording: string | null; createdAt: string } | null;
};
export class RemarkRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly existing?: Existing) { super(message); }
}
const invalid = (message: string) => new RemarkRequestError("INVALID_REMARK_REQUEST", message, 400);
const missing = () => new RemarkRequestError("REMARK_REQUEST_NOT_FOUND", "Remark request or service visit was not found.", 404);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parseId(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw invalid("A valid UUID is required.");
  return value.toLowerCase();
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function body(value: unknown, keys: string[]): Record<string, unknown> {
  if (!object(value) || Object.keys(value).some((key) => !keys.includes(key))) throw invalid("Request body is invalid.");
  return value;
}
function wording(value: unknown): string {
  const result = normaliseSectionRemarkWording(value);
  if (!result.ok) throw invalid(result.message);
  return result.wording;
}
function system(value: unknown): string {
  if (!isSectionRemarkSystemKey(value)) throw invalid("This service does not support section remark requests.");
  return value;
}
const requestColumns = `r.id, r.system_key AS "systemKey", r.section_key AS "sectionKey", r.wording,
  r.customer_id AS "customerId", c.display_name AS "customerDisplayName", r.job_id AS "jobId", j.job_reference AS "jobReference",
  r.requested_by_user_id::int AS "requestedByUserId", u.username AS "requestedBy",
  to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  COALESCE(d.decision,'pending') AS status,
  CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'decision',d.decision,
    'reviewerUserId',d.reviewer_user_id::int,'reviewer',reviewer.username,'reviewerRole',d.reviewer_role,
    'note',d.note,'approvedWording',d.approved_wording,
    'createdAt',to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END AS decision
  FROM section_remark_requests r JOIN customers c ON c.id=r.customer_id JOIN users u ON u.id=r.requested_by_user_id
  LEFT JOIN inspection_jobs j ON j.id=r.job_id
  LEFT JOIN section_remark_request_decisions d ON d.request_id=r.id LEFT JOIN users reviewer ON reviewer.id=d.reviewer_user_id`;
const approvedColumns = `id, system_key AS "systemKey", section_key AS "sectionKey", wording, active, source_request_id AS "sourceRequestId"`;

async function load(database: Queryable, id: string): Promise<RemarkRequest> {
  const result = await database.query<RemarkRequest>(`SELECT ${requestColumns} WHERE r.id=$1`, [id]);
  if (!result.rows[0]) throw missing();
  return result.rows[0];
}

// Same customer/visit predicate as sectionRemarks.ts; the context never scopes an approved choice.
async function inScope(database: Queryable, actor: Actor, customerId: string, systemKey: string, jobId: string | null) {
  const customer = await database.query("SELECT id FROM customers WHERE id=$1 AND is_active AND NOT is_demo", [customerId]);
  if (!customer.rows[0]) return false;
  if (actor.role === "inspector") {
    const job = await database.query(`SELECT id FROM inspection_jobs WHERE customer_id=$1 AND created_by_user_id=$2 AND is_sample=false
      AND ($3::uuid IS NULL OR id=$3)
      AND configuration_snapshot->'enabledSystems' @> jsonb_build_array(jsonb_build_object('systemKey',$4::text)) LIMIT 1`,
    [customerId, actor.id, jobId, systemKey]);
    return Boolean(job.rows[0]);
  }
  return !jobId || Boolean((await database.query("SELECT id FROM inspection_jobs WHERE id=$1 AND customer_id=$2", [jobId, customerId])).rows[0]);
}
async function lockSection(client: PoolClient, systemKey: string, sectionKey: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('remark_request_section:' || $1 || ':' || $2))", [systemKey, sectionKey]);
}
async function rejectExistingChoice(client: PoolClient, systemKey: string, sectionKey: string, text: string) {
  const catalog = await client.query<Existing>(`SELECT id, wording FROM service_common_remarks
    WHERE system_key=$1 AND active AND lower(regexp_replace(btrim(wording),'\\s+',' ','g'))=lower($2) LIMIT 1`, [systemKey, text]);
  if (catalog.rows[0]) throw new RemarkRequestError("DUPLICATE_CATALOG", "This wording is already a system-wide choice.", 409, catalog.rows[0]);
  const approved = await client.query<Existing>(`SELECT id, wording FROM approved_section_remarks
    WHERE system_key=$1 AND section_key=$2 AND active AND lower(wording)=lower($3) LIMIT 1`, [systemKey, sectionKey, text]);
  if (approved.rows[0]) throw new RemarkRequestError("DUPLICATE_APPROVED", "This wording is already approved for this section.", 409, approved.rows[0]);
}
async function audit(client: PoolClient, actor: Actor, action: string, id: string, entity = "section_remark_request") {
  await client.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result) VALUES($1,$2,$3,$4,'success')`, [actor.id, action, entity, id]);
}

/** Separate from CR-07: requests never mutate an inspection, accepted text, or the system-wide catalog. */
export function createRemarkRequestsRouter(database: Database = pool) {
  const router = Router();
  const noStore = (authorize: RequestHandler): RequestHandler => (request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store"); authorize(request, response, next);
  };
  const signedIn = noStore(requireRole("admin", "supervisor", "inspector"));
  const reviewers = noStore(requireRoleAudited(database, "admin", "supervisor"));
  const expectedActor = requireExpectedActor("section_remark_request_write", "section_remark_request");

  router.post("/technician/customers/:customerId/systems/:systemKey/remark-requests", signedIn, expectedActor, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const customerId = parseId(request.params.customerId), systemKey = system(request.params.systemKey);
      const input = body(request.body, ["id", "sectionKey", "wording", "jobId"]);
      const id = parseId(input.id), jobId = input.jobId === undefined ? null : parseId(input.jobId);
      if (!isSectionRemarkKey(systemKey, input.sectionKey) || input.sectionKey === "comments") throw invalid("sectionKey is not a request section of this service.");
      const sectionKey = input.sectionKey as string, text = wording(input.wording), actor = request.currentUser!;
      const fingerprint = createHash("sha256").update(JSON.stringify([actor.id, customerId, jobId, systemKey, sectionKey, text])).digest("hex");
      client = await database.connect(); await client.query("BEGIN");
      // UUID lock first, including cross-section/body races. Replay is safe even when a visit is later removed.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('remark_request_id:' || $1))", [id]);
      const existing = await client.query<{ create_fingerprint: string }>("SELECT create_fingerprint FROM section_remark_requests WHERE id=$1", [id]);
      if (existing.rows[0]) {
        if (existing.rows[0].create_fingerprint !== fingerprint) throw new RemarkRequestError("IDEMPOTENCY_CONFLICT", "This UUID was already used for different content or an account.", 409);
        const record = await load(client, id);
        await client.query("COMMIT"); response.json({ requestedId: input.id, duplicate: true, request: record }); return;
      }
      if (!await inScope(client, actor, customerId, systemKey, jobId)) throw missing();
      await lockSection(client, systemKey, sectionKey);
      await rejectExistingChoice(client, systemKey, sectionKey, text);
      const pending = await client.query<Existing>(`SELECT r.id, r.wording FROM section_remark_requests r
        WHERE r.system_key=$1 AND r.section_key=$2 AND lower(r.wording)=lower($3)
        AND NOT EXISTS (SELECT 1 FROM section_remark_request_decisions d WHERE d.request_id=r.id) LIMIT 1`, [systemKey, sectionKey, text]);
      if (pending.rows[0]) throw new RemarkRequestError("DUPLICATE_PENDING", "This wording is already waiting for approval in this section.", 409, pending.rows[0]);
      await client.query(`INSERT INTO section_remark_requests(id,system_key,section_key,wording,requested_by_user_id,customer_id,job_id,create_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, systemKey, sectionKey, text, actor.id, customerId, jobId, fingerprint]);
      await audit(client, actor, "section_remark_requested", id);
      const record = await load(client, id);
      await client.query("COMMIT"); response.status(201).json({ requestedId: input.id, duplicate: false, request: record });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });

  router.get("/systems/:systemKey/approved-section-remarks", signedIn, async (request, response, next) => {
    try {
      const systemKey = system(request.params.systemKey);
      response.json({ remarks: (await database.query(`SELECT ${approvedColumns} FROM approved_section_remarks WHERE system_key=$1 AND active ORDER BY section_key, created_at, id`, [systemKey])).rows });
    } catch (error) { next(error); }
  });
  router.get("/technician/remark-requests", signedIn, async (request, response, next) => {
    try { response.json({ requests: (await database.query(`SELECT ${requestColumns} WHERE r.requested_by_user_id=$1 ORDER BY r.created_at DESC, r.id LIMIT 500`, [request.currentUser!.id])).rows }); }
    catch (error) { next(error); }
  });
  router.get("/manager/remark-requests", reviewers, async (request, response, next) => {
    try {
      const status = request.query.status ?? "pending";
      if (!["pending", "approved", "rejected", "decided", "all"].includes(status as string)) throw invalid("Invalid status filter.");
      response.json({ requests: (await database.query(`SELECT ${requestColumns}
        WHERE ($1='all' OR ($1='decided' AND d.id IS NOT NULL) OR COALESCE(d.decision,'pending')=$1) ORDER BY r.created_at DESC,r.id LIMIT 500`, [status])).rows });
    } catch (error) { next(error); }
  });
  router.get("/manager/remark-requests/:id", reviewers, async (request, response, next) => {
    try { response.json({ request: await load(database, parseId(request.params.id)) }); } catch (error) { next(error); }
  });
  router.post("/manager/remark-requests/:id/decision", reviewers, expectedActor, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = parseId(request.params.id), input = body(request.body, ["decision", "note", "approvedWording"]);
      if (input.decision !== "approved" && input.decision !== "rejected") throw invalid("decision must be approved or rejected.");
      let note: string | null = null;
      if (input.note !== undefined) {
        if (typeof input.note !== "string" || [...input.note.trim()].length < 3 || [...input.note.trim()].length > 500 || /\p{Cc}/u.test(input.note)) throw invalid("A note must be 3-500 plain text characters.");
        note = input.note.trim();
      }
      if (input.decision === "rejected" && (!note || input.approvedWording !== undefined)) throw invalid("Reject requires a note and cannot contain approvedWording.");
      client = await database.connect(); await client.query("BEGIN");
      const record = await load(client, id);
      await lockSection(client, record.systemKey, record.sectionKey);
      if ((await load(client, id)).status !== "pending") throw new RemarkRequestError("REMARK_REQUEST_ALREADY_DECIDED", "This remark request has already been decided.", 409);
      const approvedWording = input.decision === "approved" ? wording(input.approvedWording === undefined ? record.wording : input.approvedWording) : null;
      if (approvedWording !== null) {
        await rejectExistingChoice(client, record.systemKey, record.sectionKey, approvedWording);
        await client.query(`INSERT INTO approved_section_remarks(id,system_key,section_key,wording,source_request_id) VALUES($1,$2,$3,$4,$5)`,
          [randomUUID(), record.systemKey, record.sectionKey, approvedWording, id]);
      }
      const actor = request.currentUser!;
      await client.query(`INSERT INTO section_remark_request_decisions(id,request_id,decision,reviewer_user_id,reviewer_role,note,approved_wording)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), id, input.decision, actor.id, actor.role, note, approvedWording]);
      await audit(client, actor, `section_remark_${input.decision}`, id);
      const result = await load(client, id);
      await client.query("COMMIT"); response.status(201).json({ request: result });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
      if (object(error) && error.code === "23505") next(new RemarkRequestError("REMARK_DECISION_CONFLICT", "This request or wording was decided concurrently. Refresh before retrying.", 409));
      else next(error);
    } finally { client?.release(); }
  });

  // Separate manager routes keep legacy CR-07 reads and queued creates byte-for-byte unchanged.
  router.get("/manager/section-remarks", reviewers, async (_request, response, next) => {
    try {
      const approved = await database.query(`SELECT ${approvedColumns} FROM approved_section_remarks ORDER BY system_key,section_key,created_at,id`);
      const legacy = await database.query(`SELECT r.id,r.customer_id AS "customerId",c.display_name AS "customerDisplayName",
        r.system_key AS "systemKey",r.section_key AS "sectionKey",r.wording,r.active
        FROM service_section_remarks r JOIN customers c ON c.id=r.customer_id ORDER BY r.created_at,r.id`);
      response.json({ approvedRemarks: approved.rows, legacyRemarks: legacy.rows });
    } catch (error) { next(error); }
  });
  for (const kind of ["approved", "legacy"] as const) {
    router.post(`/manager/section-remarks/${kind}/:id/deactivate`, reviewers, expectedActor, async (request, response, next) => {
      let client: PoolClient | undefined;
      try {
        const id = parseId(request.params.id); body(request.body, []);
        // Only these two fixed table names can enter the SQL.
        const table = kind === "approved" ? "approved_section_remarks" : "service_section_remarks";
        client = await database.connect(); await client.query("BEGIN");
        const row = await client.query(`UPDATE ${table} SET active=false,updated_at=now() WHERE id=$1 RETURNING id,active`, [id]);
        if (!row.rows[0]) throw missing();
        await audit(client, request.currentUser!, "section_remark_deactivated", id, table);
        await client.query("COMMIT"); response.json({ remark: row.rows[0] });
      } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
    });
  }
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof RemarkRequestError) {
      response.status(error.status).json({ error: error.code, message: error.message, ...(error.existing ? { existing: error.existing } : {}) }); return;
    }
    next(error);
  });
  return router;
}
export const remarkRequestsRouter = createRemarkRequestsRouter();
