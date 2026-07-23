import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

export const masterSystemInspectionsRouter = Router();

masterSystemInspectionsRouter.get("/master-system-inspections", requireRole("admin", "inspector"), async (_request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT instance.client_uuid AS "clientUuid", job.job_reference AS "jobReference", job.title AS "jobTitle",
        customer.display_name AS "customerName", inspection.system_key AS "systemKey", instance.status,
        instance.performed_at AS "performedAt", instance.received_at AS "receivedAt",
        instance.original_creator_snapshot->>'username' AS "deviceReportedCreatorUsername",
        creator.username AS "verifiedOriginalCreatorUsername",
        syncer.username AS "syncedByUsername"
      FROM master_system_form_instances instance
      INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
      INNER JOIN inspection_jobs job ON job.id = inspection.job_id
      INNER JOIN customers customer ON customer.id = job.customer_id
      LEFT JOIN users creator ON creator.id = instance.original_created_by_user_id
      INNER JOIN users syncer ON syncer.id = instance.synced_by_user_id
      ORDER BY instance.performed_at DESC, instance.client_uuid ASC LIMIT 100
    `);
    response.json({ inspections: result.rows });
  } catch (error) { next(error); }
});
