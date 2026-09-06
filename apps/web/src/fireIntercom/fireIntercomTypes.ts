import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";

// Fire Intercom has no V1-V6 presence at all (see masterServiceReportV7.ts),
// so like Smoke Ventilation - and unlike Hydrant/Hose Reel/Riser - there is no
// historical result set to keep alongside the V7 one: every Fire Intercom
// record is V7 four-state.
export type FireIntercomResult = "good" | "not_good" | "complete_repair" | "na";
export type FireIntercomStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";

// The paper's `Condition Yes` / `Condition No` x `1`/`2` box grid is collapsed
// to ONE four-state result plus that row's own remark (2026-09-04 owner
// decision); the original box structure is deliberately not modelled.
export const fireIntercomRowColumns = [
  ["conditionResult", "condition", "Condition"]
] as const;
export type FireIntercomRowColumn = typeof fireIntercomRowColumns[number][0];
export type FireIntercomRow = {
  rowUuid: string;
  source: "configured" | "technician";
  configuredLocationId: string | null;
  configuredRowOrdinal: number | null;
  zoneSnapshot: null;
  locationSnapshot: { id: string; displayName: string } | null;
  assetReference: string;
  conditionResult: FireIntercomResult | null;
  remarks: string;
  fieldRemarks: Partial<Record<FireIntercomRowColumn, string>>;
  sortOrder: number;
};
// No header fields: the paper page carries no Date Tested, no panel or control
// number and no location line, and none were invented.
export type FireIntercomResponses = {
  schemaVersion: 1;
  rows: FireIntercomRow[];
  comments: string;
};
export type FireIntercomInspectionRecord = {
  schemaVersion: 1;
  clientUuid: string;
  jobSystemKey: string;
  jobId: string;
  systemKey: "fire_intercom";
  instanceKey: "primary";
  configuredZoneId: null;
  configuredLocationId: null;
  displaySequence: 1;
  originalCreatorSnapshot: DeviceReportedCreator | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: 7 };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: {
    schemaVersion: 1;
    capturedAt: string;
    job: { id: string; reference: string; title: string };
    customer: InspectionJob["configurationSnapshot"]["customer"];
    configuration: InspectionJob["configurationSnapshot"]["configuration"];
    template: InspectionJob["configurationSnapshot"]["template"];
    system: JobSystemSnapshot & { definition: unknown; repetitionMode: "single_with_repeatable_rows" };
  };
  responses: FireIntercomResponses;
  performedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: FireIntercomStatus;
  lastSyncError?: string;
};
