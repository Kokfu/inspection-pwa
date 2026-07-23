import { Router } from "express";
import { auditLog } from "../audit/auditLog.js";
import { requireRole } from "../middleware/requireRole.js";
import { syncInspections } from "../sync/inspectionSync.js";
import { syncMasterSystemInspections } from "../sync/masterSystemInspectionSync.js";
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

      const testRecordItems = items.filter(
        (item): item is Parameters<typeof syncTestRecords>[0][number] =>
          typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "testRecord"
      );
      const inspectionItems = items.filter(
        (item): item is Parameters<typeof syncInspections>[0][number] =>
          typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "inspection"
      );
      const masterSystemInspectionItems = items.filter(
        (item) => typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "masterSystemInspection"
      );
      const unsupportedItems = items.filter(
        (item) => !testRecordItems.includes(item) && !inspectionItems.includes(item) && !masterSystemInspectionItems.includes(item)
      );
      const [testRecordResult, inspectionResult, masterSystemInspectionResult] = await Promise.all([
        syncTestRecords(testRecordItems),
        syncInspections(inspectionItems, request.currentUser?.id),
        syncMasterSystemInspections(masterSystemInspectionItems, request.currentUser?.id)
      ]);
      const result = {
        acceptedIds: [...testRecordResult.acceptedIds, ...inspectionResult.acceptedIds, ...masterSystemInspectionResult.acceptedIds],
        duplicateIds: [...testRecordResult.duplicateIds, ...inspectionResult.duplicateIds, ...masterSystemInspectionResult.duplicateIds],
        failed: [
          ...testRecordResult.failed,
          ...inspectionResult.failed,
          ...masterSystemInspectionResult.failed,
          ...unsupportedItems.map((item) => ({
            id: typeof (item as { entityId?: unknown })?.entityId === "string" ? (item as { entityId: string }).entityId : "unknown",
            code: "VALIDATION_ERROR",
            message: "entityType is unsupported"
          }))
        ]
      };
      await auditLog({
        actorUserId: request.currentUser?.id,
        action: "sync_write",
        entityType: "sync",
        result: result.failed.length > 0 ? "failure" : "success",
        reason: `accepted=${result.acceptedIds.length}; duplicate=${result.duplicateIds.length}; failed=${result.failed.length}`
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  }
);
