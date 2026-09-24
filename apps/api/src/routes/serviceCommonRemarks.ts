import { createHash } from "node:crypto";
import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireExpectedActor } from "../jobs/technicianOwnership.js";

const systems = new Set(["automatic_sprinkler", "hose_reel", "hydrant", "fire_alarm_detector", "fm200_fire_suppression", "co2_fire_extinguisher"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const columns = `id, system_key AS "systemKey", wording, detail_label AS "detailLabel", detail_options AS "detailOptions", active`;

class RemarkError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function parseBody(value: unknown, creation: boolean) {
  const keys = creation ? ["id", "systemKey", "wording", "detailLabel", "detailOptions"] : ["wording", "detailLabel", "detailOptions"];
  if (!object(value) || Object.keys(value).some((key) => !keys.includes(key)) ||
    (creation && (typeof value.id !== "string" || !uuid.test(value.id) || !systems.has(String(value.systemKey))))) throw new RemarkError("INVALID_REMARK", "Invalid common remark.");
  const wording = value.wording;
  const detailLabel = value.detailLabel ?? null;
  const detailOptions = value.detailOptions ?? [];
  if (typeof wording !== "string" || !wording.trim() || wording.trim().length > 300 ||
    !(detailLabel === null || typeof detailLabel === "string" && !!detailLabel.trim() && detailLabel.length <= 80) ||
    !Array.isArray(detailOptions) || detailOptions.length > 20 ||
    detailOptions.some((option) => typeof option !== "string" || !option.trim() || option.length > 100) ||
    (detailOptions.length > 0 && detailLabel === null) || new Set(detailOptions).size !== detailOptions.length) throw new RemarkError("INVALID_REMARK", "Invalid common remark.");
  return { id: value.id as string | undefined, systemKey: value.systemKey as string | undefined, wording: wording.trim(), detailLabel: detailLabel as string | null, detailOptions: detailOptions as string[] };
}
async function audit(client: PoolClient, actor: number, action: string, id: string) {
  await client.query("INSERT INTO audit_events (actor_user_id,action,entity_type,entity_id,result) VALUES ($1,$2,'service_common_remark',$3,'success')", [actor, action, id]);
}
export function createServiceCommonRemarksRouter(database: Pick<Pool, "query" | "connect"> = pool) {
  const router = Router();
  router.get("/service-common-remarks", requireRole("admin", "inspector"), async (_request, response, next) => {
    try { const result = await database.query(`SELECT ${columns} FROM service_common_remarks WHERE active ORDER BY system_key, created_at, id`); response.setHeader("Cache-Control", "private, no-store"); response.json({ remarks: result.rows }); } catch (error) { next(error); }
  });
  router.post("/service-common-remarks", requireRole("admin", "inspector"), requireExpectedActor("service_common_remark_create", "service_common_remark"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const data = parseBody(request.body, true);
      const fingerprint = createHash("sha256").update(JSON.stringify([data.systemKey, data.wording, data.detailLabel, data.detailOptions])).digest("hex");
      client = await database.connect(); await client.query("BEGIN");
      const existing = await client.query(`SELECT ${columns}, create_fingerprint AS "createFingerprint" FROM service_common_remarks WHERE id=$1 FOR UPDATE`, [data.id]);
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.createFingerprint !== fingerprint) throw new RemarkError("REMARK_ID_CONFLICT", "This remark ID belongs to different content.", 409);
        await client.query("COMMIT"); const { createFingerprint: _fingerprint, ...remark } = row; response.json({ remark, duplicate: true }); return;
      }
      const result = await client.query(`INSERT INTO service_common_remarks (id,system_key,wording,detail_label,detail_options,created_by,create_fingerprint) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`, [data.id, data.systemKey, data.wording, data.detailLabel, JSON.stringify(data.detailOptions), request.currentUser!.id, fingerprint]);
      if (!result.rows[0]) {
        const raced = await client.query(`SELECT ${columns}, create_fingerprint AS "createFingerprint" FROM service_common_remarks WHERE id=$1`, [data.id]);
        if (raced.rows[0]?.createFingerprint !== fingerprint) throw new RemarkError("REMARK_ID_CONFLICT", "This remark ID belongs to different content.", 409);
        await client.query("COMMIT"); const { createFingerprint: _fingerprint, ...remark } = raced.rows[0]; response.json({ remark, duplicate: true }); return;
      }
      await audit(client, request.currentUser!.id, "service_common_remark_created", data.id!);
      await client.query("COMMIT"); response.status(201).json({ remark: result.rows[0], duplicate: false });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); if (object(error) && error.code === "23505") next(new RemarkError("REMARK_DUPLICATE", "This service already has that common remark.", 409)); else next(error); } finally { client?.release(); }
  });
  router.put("/service-common-remarks/:id", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = request.params.id; if (typeof id !== "string" || !uuid.test(id)) throw new RemarkError("INVALID_REMARK_ID", "Invalid remark ID.");
      const data = parseBody(request.body, false);
      client = await database.connect(); await client.query("BEGIN");
      const result = await client.query(`UPDATE service_common_remarks SET wording=$2,detail_label=$3,detail_options=$4::jsonb,updated_at=now() WHERE id=$1 AND active RETURNING ${columns}`, [id, data.wording, data.detailLabel, JSON.stringify(data.detailOptions)]);
      if (!result.rows[0]) throw new RemarkError("REMARK_NOT_FOUND", "Common remark not found.", 404);
      await audit(client, request.currentUser!.id, "service_common_remark_updated", id);
      await client.query("COMMIT"); response.json({ remark: result.rows[0] });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); if (object(error) && error.code === "23505") next(new RemarkError("REMARK_DUPLICATE", "This service already has that common remark.", 409)); else next(error); } finally { client?.release(); }
  });
  router.delete("/service-common-remarks/:id", requireRole("admin"), async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = request.params.id; if (typeof id !== "string" || !uuid.test(id)) throw new RemarkError("INVALID_REMARK_ID", "Invalid remark ID.");
      client = await database.connect(); await client.query("BEGIN");
      const result = await client.query("UPDATE service_common_remarks SET active=false,updated_at=now() WHERE id=$1 AND active RETURNING id", [id]);
      if (!result.rows[0]) throw new RemarkError("REMARK_NOT_FOUND", "Common remark not found.", 404);
      await audit(client, request.currentUser!.id, "service_common_remark_removed", id);
      await client.query("COMMIT"); response.json({ id });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); } finally { client?.release(); }
  });
  return router;
}
export const serviceCommonRemarksRouter = createServiceCommonRemarksRouter();
