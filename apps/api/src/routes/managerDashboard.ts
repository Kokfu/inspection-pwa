import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";

type Database = Pick<Pool, "query">;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function createManagerDashboardRouter(database: Database = pool) {
  const router = Router();
  const requireManager = requireRoleAudited(database, "admin", "supervisor");

  router.get("/manager/dashboard/clients", requireManager, async (_request, response, next) => {
    try {
      const result = await database.query<{ totalClients: number }>(
        "SELECT count(*)::int AS \"totalClients\" FROM customers WHERE is_active = true AND is_demo = false"
      );
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ totalClients: result.rows[0]!.totalClients });
    } catch (error) { next(error); }
  });

  router.get("/manager/dashboard/inspections-per-day", requireManager, async (request, response, next) => {
    const { from, to } = request.query;
    if (!validDate(from) || !validDate(to) || from > to
      || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 31 * 86_400_000) {
      response.status(400).json({ error: "INVALID_DATE_RANGE" });
      return;
    }
    try {
      const result = await database.query<{ day: string; count: number }>(`
        SELECT date_trunc('day', service_date)::date::text AS day, count(*)::int AS count
        FROM inspection_jobs
        WHERE master_template_version_id IS NOT NULL AND is_sample = false
          AND archived_at IS NULL AND service_date >= $1::date AND service_date <= $2::date
        GROUP BY date_trunc('day', service_date)
        ORDER BY day
      `, [from, to]);
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ days: result.rows });
    } catch (error) { next(error); }
  });
  return router;
}

export const managerDashboardRouter = createManagerDashboardRouter();
