import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";

// Smoke Ventilation has no V1-V6 presence at all (see masterServiceReportV7.ts),
// so unlike Hydrant/Hose Reel/Riser there is no historical result set to keep
// alongside the V7 one - every Smoke Ventilation record is V7 four-state.
export type SmokeVentilationResult = "good" | "not_good" | "complete_repair" | "na";
export type SmokeVentilationStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";

export const smokeVentilationChecklistFields = [
  ["main_power_supply_ac", "Main Power Supply (AC)"],
  ["secondary_essential_supply_dc", "Secondary Essential Supply (DC)"],
  ["cb_battery", "Battery"],
  ["cb_charger", "Charger"],
  ["mfk_main_alarm_reset", "Main Alarm Reset"],
  ["mfk_lamp_test", "Lamp Test"],
  ["mfk_evacuate", "Evacuate"],
  ["mfk_signal_alarm_to_mfap", "Signal Alarm to MFAP"]
] as const;
export type SmokeVentilationChecklistKey = typeof smokeVentilationChecklistFields[number][0];
export type SmokeVentilationChecklistEntry = { result: SmokeVentilationResult | null; remarks: string };
export type SmokeVentilationChecklist = Record<SmokeVentilationChecklistKey, SmokeVentilationChecklistEntry>;

export const smokeVentilationRowColumns = [
  ["autoResult", "auto", "Auto"],
  ["manualResult", "manual", "Manual"]
] as const;
export type SmokeVentilationRowColumn = typeof smokeVentilationRowColumns[number][0];
export type SmokeVentilationRow = {
  rowUuid: string;
  source: "configured" | "technician";
  configuredLocationId: string | null;
  configuredRowOrdinal: number | null;
  zoneSnapshot: null;
  locationSnapshot: { id: string; displayName: string } | null;
  assetReference: string;
  autoResult: SmokeVentilationResult | null;
  manualResult: SmokeVentilationResult | null;
  remarks: string;
  fieldRemarks: Partial<Record<SmokeVentilationRowColumn, string>>;
  sortOrder: number;
};
export type SmokeVentilationResponses = {
  schemaVersion: 1;
  controlPanelNo: string;
  location: string;
  dateTested: string;
  checklist: SmokeVentilationChecklist;
  rows: SmokeVentilationRow[];
  comments: string;
};
export type SmokeVentilationInspectionRecord = {
  schemaVersion: 1;
  clientUuid: string;
  jobSystemKey: string;
  jobId: string;
  systemKey: "smoke_ventilation";
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
  responses: SmokeVentilationResponses;
  performedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: SmokeVentilationStatus;
  lastSyncError?: string;
};
