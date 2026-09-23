import { technicianOwns, ownsExistingSyncIdentity, jobNotFound, requireExpectedActor } from "../jobs/technicianOwnership.js";
import { Router } from "express";
import { auditLog } from "../audit/auditLog.js";
import { requireRole } from "../middleware/requireRole.js";
import { syncInspections } from "../sync/inspectionSync.js";
import { syncMasterSystemInspections } from "../sync/masterSystemInspectionSync.js";
import { syncTestRecords } from "../sync/testRecordSync.js";
import { syncCo2FormInstances } from "../sync/co2FormInstanceSync.js";
import { syncFm200FormInstances } from "../sync/fm200FormInstanceSync.js";
import { syncAutomaticSprinklerInspections } from "../sync/automaticSprinklerInspectionSync.js";
import { syncDryWetRiserInspections } from "../sync/dryWetRiserInspectionSync.js";
import { syncFireAlarmInspections } from "../sync/fireAlarmInspectionSync.js";
import { syncHydrantInspections } from "../sync/hydrantInspectionSync.js";
import { syncSmokeVentilationInspections } from "../sync/smokeVentilationV7Acceptance.js";
import { syncFireIntercomInspections } from "../sync/fireIntercomV7Acceptance.js";
import { syncPortableFireExtinguishers } from "../sync/portableFireExtinguisherSync.js";
import { guardCompletedJobSyncItems } from "../sync/jobStateGuard.js";

export const syncRouter = Router();
// Unsupported entity types never dispatch; they keep their per-item validation failure.
const jobBoundEntityTypes = new Set(["inspection", "masterSystemInspection", "masterSystemFormInstance"]);

syncRouter.post(
  "/sync",
  requireRole("admin", "inspector"),
  requireExpectedActor("sync_write", "sync"),
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

      // Authorize every job before any idempotent replay or batch write.
      for (const item of items) {
        if (item && typeof item === "object" && jobBoundEntityTypes.has(item.entityType)
          && (!await technicianOwns(request, "job", item.payload?.jobId)
            || !await ownsExistingSyncIdentity(request, item.entityId)
            || !await ownsExistingSyncIdentity(request, item.payload?.clientUuid))) {
          await auditLog({ actorUserId: request.currentUser?.id, action: "sync_write",
            entityType: "sync", result: "failure", reason: "JOB_NOT_FOUND" });
          response.status(404).json(jobNotFound); return;
        }
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
      const smokeVentilationItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "smoke_ventilation");
      const fireIntercomItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "fire_intercom");
      const portableFireExtinguisherItems = dispatchableItems.filter((item) => typeof item === "object" && item !== null && (item as { entityType?: unknown }).entityType === "masterSystemInspection" && typeof (item as { payload?: unknown }).payload === "object" && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "portable_fire_extinguisher");
      const masterSystemFormInstanceItems = dispatchableItems.filter(
        (item) => typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "masterSystemFormInstance"
          && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey !== "fm200_fire_suppression"
      );
      // FM200 is a fully independent system (own key, own DB rows/evidence/sync),
      // so it dispatches to its own sync handler rather than `syncCo2FormInstances`
      // - a customer can have both CO2 and FM200 enabled simultaneously with no
      // shared sync state.
      const fm200FormInstanceItems = dispatchableItems.filter(
        (item) => typeof item === "object" && item !== null &&
          (item as { entityType?: unknown }).entityType === "masterSystemFormInstance"
          && (item as { payload?: { systemKey?: unknown } }).payload?.systemKey === "fm200_fire_suppression"
      );
      const unsupportedItems = dispatchableItems.filter(
        (item) => !testRecordItems.includes(item) && !inspectionItems.includes(item)
          && !hoseReelItems.includes(item) && !automaticSprinklerItems.includes(item) && !dryWetRiserItems.includes(item) && !fireAlarmItems.includes(item) && !hydrantItems.includes(item) && !smokeVentilationItems.includes(item) && !fireIntercomItems.includes(item) && !portableFireExtinguisherItems.includes(item)
          && !masterSystemFormInstanceItems.includes(item) && !fm200FormInstanceItems.includes(item)
      );
      const [testRecordResult, inspectionResult, hoseReelResult, automaticSprinklerResult, dryWetRiserResult, fireAlarmResult, hydrantResult, smokeVentilationResult, fireIntercomResult, portableFireExtinguisherResult, masterSystemFormInstanceResult, fm200FormInstanceResult] = await Promise.all([
        syncTestRecords(testRecordItems),
        syncInspections(inspectionItems, request.currentUser?.id),
        syncMasterSystemInspections(hoseReelItems, request.currentUser?.id),
        syncAutomaticSprinklerInspections(automaticSprinklerItems, request.currentUser?.id),
        syncDryWetRiserInspections(dryWetRiserItems, request.currentUser?.id),
        syncFireAlarmInspections(fireAlarmItems, request.currentUser?.id),
        syncHydrantInspections(hydrantItems, request.currentUser?.id),
        syncSmokeVentilationInspections(smokeVentilationItems, request.currentUser?.id),
        syncFireIntercomInspections(fireIntercomItems, request.currentUser?.id),
        syncPortableFireExtinguishers(portableFireExtinguisherItems, request.currentUser?.id),
        syncCo2FormInstances(masterSystemFormInstanceItems, request.currentUser?.id),
        syncFm200FormInstances(fm200FormInstanceItems, request.currentUser?.id)
      ]);
      const handlerFailed = [
        ...testRecordResult.failed,
        ...inspectionResult.failed,
        ...hoseReelResult.failed,
        ...automaticSprinklerResult.failed,
        ...dryWetRiserResult.failed,
        ...fireAlarmResult.failed,
        ...hydrantResult.failed,
        ...smokeVentilationResult.failed,
        ...fireIntercomResult.failed,
        ...portableFireExtinguisherResult.failed,
        ...masterSystemFormInstanceResult.failed,
        ...fm200FormInstanceResult.failed
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
        acceptedIds: [...testRecordResult.acceptedIds, ...inspectionResult.acceptedIds, ...hoseReelResult.acceptedIds, ...automaticSprinklerResult.acceptedIds, ...dryWetRiserResult.acceptedIds, ...fireAlarmResult.acceptedIds, ...hydrantResult.acceptedIds, ...smokeVentilationResult.acceptedIds, ...fireIntercomResult.acceptedIds, ...portableFireExtinguisherResult.acceptedIds, ...masterSystemFormInstanceResult.acceptedIds, ...fm200FormInstanceResult.acceptedIds],
        duplicateIds: [...guarded.duplicateIds, ...closeRaceGuard.duplicateIds, ...testRecordResult.duplicateIds, ...inspectionResult.duplicateIds, ...hoseReelResult.duplicateIds, ...automaticSprinklerResult.duplicateIds, ...dryWetRiserResult.duplicateIds, ...fireAlarmResult.duplicateIds, ...hydrantResult.duplicateIds, ...smokeVentilationResult.duplicateIds, ...fireIntercomResult.duplicateIds, ...portableFireExtinguisherResult.duplicateIds, ...masterSystemFormInstanceResult.duplicateIds, ...fm200FormInstanceResult.duplicateIds],
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
