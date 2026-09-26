import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";
import { type StoredCorrection } from "../corrections/correctionApplication.js";
import { deriveDashboardSystemCondition, effectiveFieldsForAcceptedReportInstance, type FinalReportSection } from "../reports/finalServiceReport.js";

type Database = Pick<Pool, "query">;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validRange(from: unknown, to: unknown): from is string {
  return validDate(from) && validDate(to) && from <= to
    && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) <= 31 * 86_400_000;
}

type StatusRow = {
  job_id: string; system_key: string; inspection_snapshot: unknown; response_payload: unknown;
  configuration_snapshot: unknown; corrections: unknown;
};
function frozenSystem(snapshot: unknown, systemKey: string): unknown {
  if (typeof snapshot !== "object" || snapshot === null || !Object.hasOwn(snapshot, "enabledSystems")) throw new Error("Invalid frozen job configuration");
  const systems = (snapshot as { enabledSystems: unknown }).enabledSystems;
  if (!Array.isArray(systems)) throw new Error("Invalid frozen job configuration");
  const system = systems.find((item) => typeof item === "object" && item !== null && (item as { systemKey?: unknown }).systemKey === systemKey);
  if (!system || (system as { definitionStatus?: unknown }).definitionStatus !== "confirmed") throw new Error("Accepted system has no confirmed frozen configuration");
  return system;
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
    if (!validRange(from, to)) {
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
  router.get("/manager/dashboard/inspection-status", requireManager, async (request, response, next) => {
    const { from, to } = request.query;
    if (!validRange(from, to)) { response.status(400).json({ error: "INVALID_DATE_RANGE" }); return; }
    try {
      const result = await database.query<StatusRow>(`
        SELECT job.id AS job_id, inspection.system_key, job.configuration_snapshot,
          instance.inspection_snapshot, instance.response_payload,
          COALESCE(corrections.entries, '[]'::jsonb) AS corrections
        FROM inspection_jobs job
        INNER JOIN master_system_inspections inspection ON inspection.job_id = job.id
        INNER JOIN master_system_form_instances instance ON instance.inspection_group_id = inspection.id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('fieldPath', correction.field_path, 'sequence', correction.sequence,
            'newValue', correction.new_value) ORDER BY correction.sequence) AS entries
          FROM inspection_corrections correction WHERE correction.form_instance_id = instance.id
        ) corrections ON true
        WHERE job.master_template_version_id IS NOT NULL AND job.is_sample = false AND job.archived_at IS NULL
          AND job.service_date >= $1::date AND job.service_date <= $2::date AND instance.status = 'submitted'
        ORDER BY job.id, inspection.system_key, instance.display_sequence
      `, [from, to]);
      const grouped = new Map<string, FinalReportSection[]>();
      for (const row of result.rows) {
        if (!Array.isArray(row.corrections) || !row.corrections.every((item: unknown) =>
          typeof item === "object" && item !== null && typeof (item as StoredCorrection).fieldPath === "string"
          && Number.isSafeInteger((item as StoredCorrection).sequence) && (item as StoredCorrection).sequence > 0
          && Object.hasOwn(item, "newValue"))) throw new Error("Invalid stored inspection corrections");
        const system = frozenSystem(row.configuration_snapshot, row.system_key);
        const { fields } = effectiveFieldsForAcceptedReportInstance(row.system_key, row.inspection_snapshot, row.response_payload, system, row.corrections as StoredCorrection[]);
        const key = JSON.stringify([row.job_id, row.system_key]);
        const sections = grouped.get(key) ?? [];
        sections.push({ systemKey: row.system_key, label: row.system_key, fields, evidence: [] });
        grouped.set(key, sections);
      }
      const counts = { passed: 0, notOk: 0, na: 0 };
      for (const sections of grouped.values()) counts[deriveDashboardSystemCondition(sections)] += 1;
      response.setHeader("Cache-Control", "private, no-store");
      response.json(counts);
    } catch (error) { next(error); }
  });
  return router;
}

export const managerDashboardRouter = createManagerDashboardRouter();
