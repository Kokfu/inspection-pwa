import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";

// Fire Rated Roller Shutter has no V1-V6 presence at all (see masterServiceReportV7.ts),
// so like Smoke Ventilation - and unlike Hydrant/Hose Reel/Riser - there is no
// historical result set to keep alongside the V7 one: every Fire Rated Roller Shutter
// record is V7 four-state.
export type FireRatedRollerShutterResult = "good" | "not_good" | "complete_repair" | "na";
export type FireRatedRollerShutterStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";

// The paper has two independent result boxes per shutter.
export const fireRatedRollerShutterRowColumns = [
  ["autoAlarmModeResult", "auto_alarm_mode", "Auto Alarm Mode"],
  ["manualModeResult", "manual_mode", "Manual Mode"]
] as const;
export type FireRatedRollerShutterRowColumn = typeof fireRatedRollerShutterRowColumns[number][0];
export type FireRatedRollerShutterRow = {
  rowUuid: string;
  source: "configured" | "technician";
  configuredLocationId: string | null;
  configuredRowOrdinal: number | null;
  zoneSnapshot: null;
  locationSnapshot: { id: string; displayName: string } | null;
  assetReference: string;
  locationText: string;
  /** Free-text zone heading. Present on schema-2 rows only (schema 1 predates zone headings). */
  zoneText?: string;
  autoAlarmModeResult: FireRatedRollerShutterResult | null;
  manualModeResult: FireRatedRollerShutterResult | null;
  remarks: string;
  fieldRemarks: Partial<Record<FireRatedRollerShutterRowColumn, string>>;
  sortOrder: number;
};
export type FireRatedRollerShutterResponses = {
  schemaVersion: 1 | 2;
  dateTested: string;
  zone: string;
  inspectedBy: string;
  rows: FireRatedRollerShutterRow[];
  comments: string;
};
export type FireRatedRollerShutterInspectionRecord = {
  schemaVersion: 1;
  clientUuid: string;
  jobSystemKey: string;
  jobId: string;
  systemKey: "fire_rated_roller_shutter";
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
  responses: FireRatedRollerShutterResponses;
  performedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: FireRatedRollerShutterStatus;
  lastSyncError?: string;
};
