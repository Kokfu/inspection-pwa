import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { ResolvedCo2Controls } from "../inspectionControls/definitionTypes";
import type { InspectionJob, JobLocationSnapshot, JobSystemSnapshot, JobZoneSnapshot } from "../jobs/jobTypes";

export type Co2Result = "good" | "poor" | "not_relevant" | "not_good" | "complete_repair" | "na";
export type SuppressionSystemKey = "co2_fire_extinguisher" | "wet_chemical";
export type DetectorStatus = "normal" | "test" | "isolation";
export type DetectorStatusValue = DetectorStatus | DetectorStatus[];
export type Co2SyncStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
export type Co2ChecklistResponse = { result: Co2Result | null; remarks: string };
export type Co2DetectorRow = {
  rowUuid: string;
  displaySequence: number;
  alarmZone: string;
  location: string;
  heatDetectorStatus: DetectorStatusValue | null;
  smokeDetectorStatus: DetectorStatusValue | null;
  remarks: string;
};
export type Co2Responses = {
  controlPanelLocation: string;
  detectorRows: Co2DetectorRow[];
  chargerAndBatteries: Record<string, Co2ChecklistResponse>;
  physicalOutlook: Record<string, Co2ChecklistResponse>;
  mainFunctionKeys: Record<string, Co2ChecklistResponse>;
  comments: string;
};
export type Co2ConfiguredInstance = {
  instanceKey: string;
  displaySequence: number;
  zone: Pick<JobZoneSnapshot, "id" | "key" | "displayName" | "sortOrder"> | null;
  location: Pick<JobLocationSnapshot, "id" | "key" | "displayName" | "sortOrder">;
};
export type MasterSystemInspectionGroupRecord = {
  groupKey: string;
  jobId: string;
  systemKey: SuppressionSystemKey;
  jobReference: string;
  jobTitle: string;
  customer: InspectionJob["configurationSnapshot"]["customer"];
  expectedInstances: Co2ConfiguredInstance[];
  initializedAt: string;
  localUpdatedAt: string;
};
export type Co2InspectionSnapshot = {
  schemaVersion: 1 | 2;
  capturedAt: string;
  job: { id: string; reference: string; title: string };
  customer: InspectionJob["configurationSnapshot"]["customer"];
  configuration: InspectionJob["configurationSnapshot"]["configuration"];
  template: InspectionJob["configurationSnapshot"]["template"];
  system: JobSystemSnapshot & {
    definition: unknown;
    resolvedControls: ResolvedCo2Controls;
    repetitionMode: "per_location";
  };
  instance: Co2ConfiguredInstance;
};
export type MasterSystemFormInstanceRecord = {
  schemaVersion: 1;
  clientUuid: string;
  groupKey: string;
  instanceKey: string;
  jobId: string;
  systemKey: SuppressionSystemKey;
  configuredZoneId: string | null;
  configuredLocationId: string;
  displaySequence: number;
  originalCreatorSnapshot: DeviceReportedCreator | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: number };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: Co2InspectionSnapshot;
  /**
   * Frozen per-customer display-label overrides for this system, copied from the
   * job snapshot at record creation. Present ONLY when the customer had a
   * non-empty map — so a no-override record is byte-identical to before this
   * feature. Display strings only, keyed by canonical resolved-controls path
   * (see apps/web/src/inspections/labelOverrides.ts). **Never synced** — it is
   * absent from every `payload()` builder — and never enters `inspectionSnapshot`.
   */
  displayLabelOverrides?: Readonly<Record<string, string>>;
  responses: Co2Responses;
  startedAt: string | null;
  performedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: Co2SyncStatus;
  lastSyncError?: string;
};
