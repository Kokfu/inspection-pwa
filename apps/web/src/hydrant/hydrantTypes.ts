import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";

export type HistoricalHydrantResult = "good" | "poor";
export type HydrantV7Result = "good" | "not_good" | "complete_repair" | "na";
export type HydrantResult = HistoricalHydrantResult | HydrantV7Result;
export type HydrantStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
export const hydrantResultColumns = [
  ["canvasHose1Result", "canvas_hose_1", "Canvas Hose 1"],
  ["canvasHose2Result", "canvas_hose_2", "Canvas Hose 2"],
  ["diffuserNozzleResult", "diffuser_nozzle", "Diffuser Nozzle"],
  ["landingValveResult", "landing_valve", "Landing Valve"],
  ["landingValveHandleResult", "landing_valve_handle", "Landing Valve Handle"],
  ["hoseCabinetResult", "hose_cabinet", "Hose Cabinet"],
  ["keyLockResult", "key_lock", "Key Lock"]
] as const;
export type HydrantResultColumn = typeof hydrantResultColumns[number][0];
export type HydrantRow = { rowUuid:string; source:"configured"|"technician"; configuredLocationId:string|null; configuredRowOrdinal:number|null; zoneSnapshot:{id:string;displayName:string}|null; locationSnapshot:{id:string;displayName:string}|null; assetReference:string; locationText:string; canvasHose1Result:HydrantResult|null; canvasHose2Result:HydrantResult|null; diffuserNozzleResult:HydrantResult|null; landingValveResult:HydrantResult|null; landingValveHandleResult:HydrantResult|null; hoseCabinetResult:HydrantResult|null; keyLockResult:HydrantResult|null; remarks:string; fieldRemarks?: Partial<Record<HydrantResultColumn,string>>; sortOrder:number };
export type HydrantResponses = { schemaVersion:1; hydrantType:"pressurize"|"meter"|"public"|null; rows:HydrantRow[]; comments:string };
export type HydrantInspectionRecord = { schemaVersion:1; clientUuid:string; jobSystemKey:string; jobId:string; systemKey:"hydrant"; instanceKey:"primary"; configuredZoneId:null; configuredLocationId:null; displaySequence:1; originalCreatorSnapshot:DeviceReportedCreator|null; masterTemplate:{id:string;code:"MFE-FSSR";version:number}; configuration:{revisionId:string;revisionNumber:number}; inspectionSnapshot:{schemaVersion:1;capturedAt:string;job:{id:string;reference:string;title:string};customer:InspectionJob["configurationSnapshot"]["customer"];configuration:InspectionJob["configurationSnapshot"]["configuration"];template:InspectionJob["configurationSnapshot"]["template"];system:JobSystemSnapshot&{definition:unknown;repetitionMode:"single_with_repeatable_rows"}}; responses:HydrantResponses; performedAt:string; localCreatedAt:string; localUpdatedAt:string;lastSyncedAt?:string;syncStatus:HydrantStatus;lastSyncError?:string };
