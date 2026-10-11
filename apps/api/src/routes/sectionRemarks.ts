import { createHash } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireExpectedActor } from "../jobs/technicianOwnership.js";
import { isSectionRemarkKey, isSectionRemarkSystemKey } from "../inspections/remarkSections.js";
import { normaliseSectionRemarkWording } from "../inspections/sectionRemarkText.js";

/**
 * CR-07 Phase 1: technician-added free-text remarks, shared per customer + system + form section.
 *
 * A remark is only ever TEXT that the browser appends to an existing inspection field string, so nothing
 * here touches the inspection payload, a template, an evidence contract or a report. The id is the
 * device-generated idempotency key (crypto.randomUUID()); the response always echoes the REQUESTED id so
 * the device can confirm the exact UUID it queued even when the server resolved it to an existing row.
 *
 * Auth: any signed-in role may call; an inspector must own a non-sample job for the customer that
 * contains the system (the same predicate locationProposals.ts uses). Every "you may not" answer in
 * scope is one uniform 404, so a technician cannot probe other customers.
 */
export class SectionRemarkError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

export const sectionRemarkCap = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const notFound = () => new SectionRemarkError("SECTION_REMARK_SCOPE_NOT_FOUND", "Customer or service visit was not found.", 404);
const invalid = (message: string) => new SectionRemarkError("INVALID_SECTION_REMARK", message, 400);

type Database = Pick<Pool, "query" | "connect">;
type Queryable = Pick<Pool | PoolClient, "query">;
type Actor = NonNullable<Request["currentUser"]>;
type PublicRemark = { id: string; customerId: string; systemKey: string; sectionKey: string; wording: string };

const columns = `id, customer_id AS "customerId", system_key AS "systemKey", section_key AS "sectionKey", wording`;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTarget(request: Request) {
  const { customerId, systemKey } = request.params;
  if (typeof customerId !== "string" || !uuidPattern.test(customerId)) throw invalid("Customer id is invalid.");
  if (!isSectionRemarkSystemKey(systemKey)) throw invalid("This service does not support section remarks.");
  return { customerId: customerId.toLowerCase(), systemKey };
}

function parseBody(body: unknown, systemKey: string) {
  if (!object(body)) throw invalid("Request body is invalid.");
  const allowed = ["id", "sectionKey", "wording", "jobId"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid("Request body is invalid.");
  if (typeof body.id !== "string" || !uuidPattern.test(body.id)) throw invalid("id must be a valid UUID.");
  if (!isSectionRemarkKey(systemKey, body.sectionKey)) throw invalid("sectionKey is not a remark section of this service.");
  let jobId: string | undefined;
  if (body.jobId !== undefined) {
    if (typeof body.jobId !== "string" || !uuidPattern.test(body.jobId)) throw invalid("jobId must be a valid UUID.");
    jobId = body.jobId.toLowerCase();
  }
  const text = normaliseSectionRemarkWording(body.wording);
  if (!text.ok) throw invalid(text.message);
  return { requestedId: body.id, id: body.id.toLowerCase(), sectionKey: body.sectionKey as string, wording: text.wording, jobId };
}

function fingerprint(customerId: string, systemKey: string, sectionKey: string, wording: string) {
  return createHash("sha256").update(JSON.stringify([customerId, systemKey, sectionKey, wording])).digest("hex");
}

/**
 * True when `actor` may use remarks for this customer (and system / visit, when given). Demo and inactive
 * customers are out of scope for everyone. An inspector must own a non-sample visit for the customer.
 */
async function inScope(database: Queryable, actor: Actor, customerId: string, systemKey: string | undefined, jobId: string | undefined) {
  const customer = await database.query("SELECT id FROM customers WHERE id=$1 AND is_active AND NOT is_demo", [customerId]);
  if (!customer.rows[0]) return false;
  if (actor.role === "inspector") {
    const job = await database.query(
      `SELECT id FROM inspection_jobs
        WHERE customer_id=$1 AND created_by_user_id=$2 AND is_sample=false
          AND ($3::uuid IS NULL OR id=$3)
          AND ($4::text IS NULL OR configuration_snapshot->'enabledSystems' @> jsonb_build_array(jsonb_build_object('systemKey',$4::text)))
        LIMIT 1`,
      [customerId, actor.id, jobId ?? null, systemKey ?? null]
    );
    return Boolean(job.rows[0]);
  }
  if (jobId) {
    const job = await database.query("SELECT id FROM inspection_jobs WHERE id=$1 AND customer_id=$2", [jobId, customerId]);
    return Boolean(job.rows[0]);
  }
  return true;
}

export function createSectionRemarksRouter(database: Database = pool) {
  const router = Router();

  router.get("/customers/:customerId/section-remarks", requireRole("admin", "supervisor", "inspector"), async (request, response, next) => {
    try {
      const customerId = request.params.customerId;
      if (typeof customerId !== "string" || !uuidPattern.test(customerId)) throw invalid("Customer id is invalid.");
      const id = customerId.toLowerCase();
      if (!await inScope(database, request.currentUser!, id, undefined, undefined)) throw notFound();
      const result = await database.query<PublicRemark>(
        `SELECT ${columns} FROM service_section_remarks WHERE customer_id=$1 AND active ORDER BY created_at, id`, [id]
      );
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ remarks: result.rows });
    } catch (error) { next(error); }
  });

  router.post(
    "/technician/customers/:customerId/systems/:systemKey/section-remarks",
    requireRole("admin", "supervisor", "inspector"),
    requireExpectedActor("service_section_remark_create", "service_section_remark"),
    async (request, response, next) => {
      let client: PoolClient | undefined;
      try {
        const { customerId, systemKey } = parseTarget(request);
        const input = parseBody(request.body, systemKey);
        const requestFingerprint = fingerprint(customerId, systemKey, input.sectionKey, input.wording);
        const actor = request.currentUser!;
        client = await database.connect();
        await client.query("BEGIN");
        if (!await inScope(client, actor, customerId, systemKey, input.jobId)) throw notFound();
        // One writer at a time per (customer, system, section): serialises the replay check, the
        // same-text merge, the cap count and the insert, so concurrent POSTs of one text make one row.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('service_section_remark:' || $1 || ':' || $2 || ':' || $3))",
          [customerId, systemKey, input.sectionKey]
        );
        const sameId = await client.query<PublicRemark & { createFingerprint: string }>(
          `SELECT ${columns}, create_fingerprint AS "createFingerprint" FROM service_section_remarks WHERE id=$1`, [input.id]
        );
        if (sameId.rows[0]) {
          const { createFingerprint, ...remark } = sameId.rows[0];
          if (createFingerprint !== requestFingerprint) {
            throw new SectionRemarkError("IDEMPOTENCY_CONFLICT", "This remark id was already used for different content.", 409);
          }
          await client.query("COMMIT");
          response.status(200).json({ requestedId: input.requestedId, duplicate: true, merged: false, remark });
          return;
        }
        const sameText = await client.query<PublicRemark>(
          `SELECT ${columns} FROM service_section_remarks
            WHERE customer_id=$1 AND system_key=$2 AND section_key=$3 AND lower(wording)=lower($4) AND active
            ORDER BY created_at, id LIMIT 1`,
          [customerId, systemKey, input.sectionKey, input.wording]
        );
        if (sameText.rows[0]) {
          await client.query("COMMIT");
          response.status(200).json({ requestedId: input.requestedId, duplicate: false, merged: true, remark: sameText.rows[0] });
          return;
        }
        const count = await client.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM service_section_remarks WHERE customer_id=$1 AND system_key=$2 AND section_key=$3 AND active",
          [customerId, systemKey, input.sectionKey]
        );
        if ((count.rows[0]?.n ?? 0) >= sectionRemarkCap) {
          throw new SectionRemarkError("SECTION_REMARK_LIMIT_REACHED", `This section already has ${sectionRemarkCap} added remarks.`, 409);
        }
        const inserted = await client.query<PublicRemark>(
          `INSERT INTO service_section_remarks (id, customer_id, system_key, section_key, wording, created_by_user_id, job_id, create_fingerprint)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`,
          [input.id, customerId, systemKey, input.sectionKey, input.wording, actor.id, input.jobId ?? null, requestFingerprint]
        );
        await client.query(
          "INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, result) VALUES ($1,'service_section_remark_created','service_section_remark',$2,'success')",
          [actor.id, input.id]
        );
        await client.query("COMMIT");
        response.status(201).json({ requestedId: input.requestedId, duplicate: false, merged: false, remark: inserted.rows[0] });
      } catch (error) {
        await client?.query("ROLLBACK").catch(() => undefined);
        // A same-id insert in ANOTHER scope that committed first. The id is bound to different content.
        if (object(error) && error.code === "23505") {
          next(new SectionRemarkError("IDEMPOTENCY_CONFLICT", "This remark id was already used for different content.", 409));
        } else next(error);
      } finally { client?.release(); }
    }
  );

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof SectionRemarkError) { response.status(error.status).json({ error: error.code, message: error.message }); return; }
    next(error);
  });
  return router;
}

export const sectionRemarksRouter = createSectionRemarksRouter();
