import { Router } from "express";
import { auditLog } from "../audit/auditLog.js";
import { pool } from "../db/pool.js";
import {
  closeInspectionJob,
  loadJobCompletion
} from "../jobs/jobCompletion.js";
import { requireRole } from "../middleware/requireRole.js";

type InspectionJobRow = {
  id: string;
  reference: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  configurationSnapshot: unknown;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        ORDER BY job_reference, id
      `);

      const jobs = [];
      for (const job of result.rows) {
        const completion = await loadJobCompletion(job.id);
        if (!completion) throw new Error("Listed inspection job disappeared");
        jobs.push({ ...job, completion });
      }

      response.json({ jobs });
    } catch (error) {
      next(error);
    }
  }
);

inspectionJobsRouter.get(
  "/inspection-jobs/:jobId/completion",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      const completion = await loadJobCompletion(jobId);
      if (!completion) {
        response.status(404).json({ error: "JOB_NOT_FOUND" });
        return;
      }
      response.json({ completion });
    } catch (error) {
      next(error);
    }
  }
);

inspectionJobsRouter.post(
  "/inspection-jobs/:jobId/close",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const jobId = request.params.jobId;
      if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
        response.status(400).json({ error: "INVALID_JOB_ID" });
        return;
      }
      if (request.body !== undefined && (
        typeof request.body !== "object"
        || request.body === null
        || Array.isArray(request.body)
        || Object.keys(request.body).length > 0
      )) {
        response.status(400).json({
          error: "INVALID_CLOSE_COMMAND",
          message: "Job completion is evaluated by the server and accepts no client progress"
        });
        return;
      }
      const actor = request.currentUser!;
      const result = await closeInspectionJob(jobId, {
        id: actor.id,
        username: actor.username
      });
      if (result.kind === "not-found") {
        response.status(404).json({ error: "JOB_NOT_FOUND" });
        return;
      }
      if (result.kind === "incomplete") {
        await auditLog({
          actorUserId: actor.id,
          action: "inspection_job_close",
          entityType: "inspectionJob",
          entityId: jobId,
          result: "failure",
          reason: "JOB_INCOMPLETE"
        });
        response.status(409).json({
          error: "JOB_INCOMPLETE",
          message: "Required inspection work is not yet accepted by the server",
          completion: result.completion
        });
        return;
      }
      response.json({
        outcome: result.alreadyCompleted ? "already-completed" : "completed",
        completion: result.completion
      });
    } catch (error) {
      next(error);
    }
  }
);
