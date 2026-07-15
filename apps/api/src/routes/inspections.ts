import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

type InspectionSummary = {
  clientUuid: string;
  jobReference: string;
  jobTitle: string;
  inspectionTitle: string;
  performedAt: string;
};

export const inspectionsRouter = Router();

inspectionsRouter.get(
  "/inspections",
  requireRole("admin", "inspector"),
  async (_request, response, next) => {
    try {
      const result = await pool.query<InspectionSummary>(
        `
          SELECT
            inspection.client_uuid AS "clientUuid",
            job.job_reference AS "jobReference",
            job.title AS "jobTitle",
            inspection.header->>'title' AS "inspectionTitle",
            inspection.performed_at AS "performedAt"
          FROM inspections inspection
          INNER JOIN inspection_jobs job ON job.id = inspection.job_id
          ORDER BY inspection.performed_at DESC, inspection.client_uuid ASC
          LIMIT $1
        `,
        [100]
      );
      response.json({ inspections: result.rows });
    } catch (error) {
      next(error);
    }
  }
);
