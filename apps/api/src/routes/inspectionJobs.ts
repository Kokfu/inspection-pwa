import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

type InspectionJobRow = {
  id: string;
  reference: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  configurationSnapshot: unknown;
};

export const inspectionJobsRouter = Router();

inspectionJobsRouter.get(
  "/inspection-jobs",
  requireRole("admin", "inspector"),
  async (_request, response, next) => {
    try {
      const result = await pool.query<InspectionJobRow>(`
        SELECT
          id,
          job_reference AS reference,
          title,
          status,
          created_at AS "createdAt",
          configuration_snapshot AS "configurationSnapshot"
        FROM inspection_jobs
        WHERE master_template_version_id IS NOT NULL
          AND status = 'open'
        ORDER BY job_reference, id
      `);

      response.json({ jobs: result.rows });
    } catch (error) {
      next(error);
    }
  }
);
