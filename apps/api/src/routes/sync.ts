import { Router } from "express";
import { auditLog } from "../audit/auditLog.js";
import { requireRole } from "../middleware/requireRole.js";
import { syncTestRecords } from "../sync/testRecordSync.js";

export const syncRouter = Router();

syncRouter.post(
  "/sync",
  requireRole("admin", "inspector"),
  async (request, response, next) => {
    try {
      const { items } = request.body as { items?: unknown };

      if (!Array.isArray(items)) {
        await auditLog({
          actorUserId: request.currentUser?.id,
          action: "sync_write",
          entityType: "testRecord",
          result: "failure",
          reason: "items must be an array"
        });
        response.status(400).json({
          acceptedIds: [],
          duplicateIds: [],
          failed: [
            {
              id: "unknown",
              code: "VALIDATION_ERROR",
              message: "items must be an array"
            }
          ]
        });
        return;
      }

      if (items.length > 25) {
        await auditLog({
          actorUserId: request.currentUser?.id,
          action: "sync_write",
          entityType: "testRecord",
          result: "failure",
          reason: "items batch limit is 25"
        });
        response.status(400).json({
          acceptedIds: [],
          duplicateIds: [],
          failed: [
            {
              id: "unknown",
              code: "VALIDATION_ERROR",
              message: "items batch limit is 25"
            }
          ]
        });
        return;
      }

      const result = await syncTestRecords(items);
      await auditLog({
        actorUserId: request.currentUser?.id,
        action: "sync_write",
        entityType: "testRecord",
        result: result.failed.length > 0 ? "failure" : "success",
        reason: `accepted=${result.acceptedIds.length}; duplicate=${result.duplicateIds.length}; failed=${result.failed.length}`
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  }
);
