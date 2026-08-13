import { Router } from "express";
import { auditLog } from "../audit/auditLog.js";
import { requireRole } from "../middleware/requireRole.js";
import { syncInspections } from "../sync/inspectionSync.js";
import { syncMasterSystemInspections } from "../sync/masterSystemInspectionSync.js";
import { syncTestRecords } from "../sync/testRecordSync.js";
import { syncCo2FormInstances } from "../sync/co2FormInstanceSync.js";
import { syncAutomaticSprinklerInspections } from "../sync/automaticSprinklerInspectionSync.js";
import { syncDryWetRiserInspections } from "../sync/dryWetRiserInspectionSync.js";
import { syncFireAlarmInspections } from "../sync/fireAlarmInspectionSync.js";
import { syncHydrantInspections } from "../sync/hydrantInspectionSync.js";
import { syncPortableFireExtinguishers } from "../sync/portableFireExtinguisherSync.js";
import { guardCompletedJobSyncItems } from "../sync/jobStateGuard.js";

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

      const guarded = await guardCompletedJobSyncItems(items);
      const dispatchableItems = guarded.dispatchable;
      const testRecordItems = dispatchableItems.filter(
        (item): item is Parameters<typeof syncTestRecords>[0][number] =>
          typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "testRecord"
      );
      const inspectionItems = dispatchableItems.filter(
        (item): item is Parameters<typeof syncInspections>[0][number] =>
          typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "inspection"
      );
      const hoseReelItems = dispatchableItems.filter(
        (item) => typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "masterSystemInspection"
          && typeof (item as { payload?: unknown }).payload === "object"
          && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "hose_reel"
      );
      const automaticSprinklerItems = dispatchableItems.filter(
        (item) => typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "masterSystemInspection"
          && typeof (item as { payload?: unknown }).payload === "object"
          && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "automatic_sprinkler"
      );
      const dryWetRiserItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "dry_wet_riser");
      const fireAlarmItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "fire_alarm_detector");
      const hydrantItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "hydrant");
      const portableFireExtinguisherItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "portable_fire_extinguisher");
      const masterSystemFormInstanceItems = dispatchableItems.filter(
        (item) => typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "masterSystemFormInstance"
      );
      const unsupportedItems = dispatchableItems.filter(
        (item) => !testRecordItems.includes(item) && !inspectionItems.includes(item)
          && !hoseReelItems.includes(item) && !automaticSprinklerItems.includes(item) && !dryWetRiserItems.includes(item) && !fireAlarmItems.includes(item) && !hydrantItems.includes(item) && !portableFireExtinguisherItems.includes(item)
          && !masterSystemFormInstanceItems.includes(item)
      );
      const [testRecordResult, inspectionResult, hoseReelResult, automaticSprinklerResult, dryWetRiserResult, fireAlarmResult, hydrantResult, portableFireExtinguisherResult, masterSystemFormInstanceResult] = await Promise.all([
        syncTestRecords(testRecordItems),
        syncInspections(inspectionItems, request.currentUser?.id),
        syncMasterSystemInspections(hoseReelItems, request.currentUser?.id),
        syncAutomaticSprinklerInspections(automaticSprinklerItems, request.currentUser?.id),
        syncDryWetRiserInspections(dryWetRiserItems, request.currentUser?.id),
        syncFireAlarmInspections(fireAlarmItems, request.currentUser?.id),
        syncHydrantInspections(hydrantItems, request.currentUser?.id),
        syncPortableFireExtinguishers(portableFireExtinguisherItems, request.currentUser?.id),
        syncCo2FormInstances(masterSystemFormInstanceItems, request.currentUser?.id)
      ]);
      const handlerFailed = [
        ...testRecordResult.failed,
        ...inspectionResult.failed,
        ...hoseReelResult.failed,
        ...automaticSprinklerResult.failed,
        ...dryWetRiserResult.failed,
        ...fireAlarmResult.failed,
        ...hydrantResult.failed,
        ...portableFireExtinguisherResult.failed,
        ...masterSystemFormInstanceResult.failed
      ];
      const handlerFailedIds = new Set(handlerFailed.map((failure) => failure.id));
      // A close may commit after the initial guard but before an individual
      // handler reads the job. Recheck only handler failures so that this race
      // is returned as the same deterministic terminal JOB_CLOSED outcome.
      const closeRaceGuard = await guardCompletedJobSyncItems(
        dispatchableItems.filter((item) => typeof (item as { entityId?: unknown }).entityId === "string"
          && handlerFailedIds.has((item as { entityId: string }).entityId))
      );
      const reclassifiedIds = new Set([
        ...closeRaceGuard.duplicateIds,
        ...closeRaceGuard.failed.map((failure) => failure.id)
      ]);
      const result = {
        acceptedIds: [...testRecordResult.acceptedIds, ...inspectionResult.acceptedIds, ...hoseReelResult.acceptedIds, ...automaticSprinklerResult.acceptedIds, ...dryWetRiserResult.acceptedIds, ...fireAlarmResult.acceptedIds, ...hydrantResult.acceptedIds, ...portableFireExtinguisherResult.acceptedIds, ...masterSystemFormInstanceResult.acceptedIds],
        duplicateIds: [...guarded.duplicateIds, ...closeRaceGuard.duplicateIds, ...testRecordResult.duplicateIds, ...inspectionResult.duplicateIds, ...hoseReelResult.duplicateIds, ...automaticSprinklerResult.duplicateIds, ...dryWetRiserResult.duplicateIds, ...fireAlarmResult.duplicateIds, ...hydrantResult.duplicateIds, ...portableFireExtinguisherResult.duplicateIds, ...masterSystemFormInstanceResult.duplicateIds],
        failed: [
          ...guarded.failed,
          ...closeRaceGuard.failed,
          ...handlerFailed.filter((failure) => !reclassifiedIds.has(failure.id)),
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
