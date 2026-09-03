import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";

export type DeviceState = "normal" | "test" | "isolation";
export type DeviceStateValue = DeviceState | DeviceState[];
export type GoodPoor = "good" | "poor" | "not_relevant" | "not_good" | "complete_repair" | "na";
export type FireAlarmSyncStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
export type FireAlarmRowPreset = { fireAlarmTable: "primary" | "secondary"; assetReference?: string };

export type ConfiguredFireAlarmRowProvenance = {
  source: "configured";
  configuredLocationId: string;
  configuredRowOrdinal: number;
  zoneSnapshot: { id: string; displayName: string } | null;
  locationSnapshot: { id: string; displayName: string };
};
export type TechnicianFireAlarmRowProvenance = {
  source: "technician";
  configuredLocationId: null;
  configuredRowOrdinal: null;
  zoneSnapshot: null;
  locationSnapshot: null;
};
export type FireAlarmRowProvenance = ConfiguredFireAlarmRowProvenance | TechnicianFireAlarmRowProvenance;

export type FireAlarmPrimaryDeviceRow = FireAlarmRowProvenance & {
  rowUuid: string;
  displaySequence: number;
  assetReference: string;
  alarmZone: string;
  location: string;
  manualCallPoint: DeviceStateValue | null;
  flowSwitch: DeviceStateValue | null;
  heatDetector: DeviceStateValue | null;
  smokeDetector: DeviceStateValue | null;
  remarks: string;
};
export type FireAlarmSecondaryAlarmDeviceRow = FireAlarmRowProvenance & {
  rowUuid: string;
  displaySequence: number;
  assetReference: string;
  location: string;
  alarmBell: GoodPoor | null;
  manualCallPoint: GoodPoor | null;
  remarks: string;
  fieldRemarks?: Partial<Record<"alarmBell" | "manualCallPoint", string>>;
};

export type GoodPoorResponse = { result: GoodPoor | null; remarks: string };
export type FireAlarmChargerAndBatteriesResponse = {
  main_supply: GoodPoorResponse;
  battery: GoodPoorResponse;
  charger: GoodPoorResponse;
};
export type FireAlarmMainFunctionResponse = {
  main_alarm_reset: GoodPoorResponse;
  lamp_test: GoodPoorResponse;
  evacuate: GoodPoorResponse;
  ac_supply: GoodPoorResponse;
  dc_supply: GoodPoorResponse;
  spka_system: GoodPoorResponse;
  alarm_lift_trip: GoodPoorResponse;
  signal_gas_discharge: GoodPoorResponse;
};
export type FireAlarmResponses = {
  schemaVersion: 1 | 2;
  controlPanelLocation: string;
  primaryDeviceRows: FireAlarmPrimaryDeviceRow[];
  chargerAndBatteries: FireAlarmChargerAndBatteriesResponse;
  mainFunctionKeys: FireAlarmMainFunctionResponse;
  secondaryAlarmDeviceRows: FireAlarmSecondaryAlarmDeviceRow[];
  comments: string;
};

export type FireAlarmDefinitionField = {
  key: string;
  label: string;
  control: "text" | "remarks" | "good_poor" | "normal_test_isolation" | "normal_test_isolation_multi";
  required: boolean;
  sortOrder: number;
  allowedValues?: readonly string[];
  remarksPolicy?: "optional";
};
export type FireAlarmDefinitionBlock = {
  key: string;
  title: string;
  type: "checklist" | "repeatable_table" | "comments";
  sortOrder: number;
  supportsZones?: boolean;
  supportsLocations?: boolean;
  items?: readonly FireAlarmDefinitionField[];
  columns?: readonly FireAlarmDefinitionField[];
  field?: FireAlarmDefinitionField;
};
export type FireAlarmSystemDefinition = {
  key: "fire_alarm_detector";
  displayName: "Fire Alarm / Detector System";
  sortOrder: 5;
  definitionStatus: "confirmed";
  configuration: { supportsZones: true; supportsLocations: true; supportsPresetRows: true };
  sections: Array<{ key: string; title: string; sortOrder: number; blocks: FireAlarmDefinitionBlock[] }>;
};

export type ResolvedFireAlarmResult<T extends string> = {
  type: "single_select" | "multi_select";
  required: true;
  options: Array<{ value: T; label: string }>;
};
export type ResolvedFireAlarmText = { key: string; label: string; required: boolean; maxLength: number };
export type ResolvedFireAlarmChecklistItem<K extends string> = {
  key: K;
  label: string;
  sortOrder: number;
  result: ResolvedFireAlarmResult<GoodPoor>;
  remarks: { policy: "optional"; maxLength: 2000 };
};
export type ResolvedFireAlarmControls = {
  schemaVersion: 1 | 2;
  source: { templateCode: "MFE-FSSR"; templateVersion: 3 | 6 | 7; systemKey: "fire_alarm_detector" };
  repetitionMode: "single_with_two_repeatable_tables";
  instance: { key: "primary"; displaySequence: 1; zoneId: null; locationId: null };
  controlPanelLocation: ResolvedFireAlarmText & { key: "control_panel_location"; required: true; maxLength: 300 };
  primaryDeviceRows: {
    minimum: 1; maximum: 250;
    assetReference: ResolvedFireAlarmText & { key: "asset_reference"; required: false; maxLength: 250 };
    alarmZone: ResolvedFireAlarmText & { key: "alarm_zone"; required: true; maxLength: 200 };
    location: ResolvedFireAlarmText & { key: "location"; required: true; maxLength: 300 };
    manualCallPoint: ResolvedFireAlarmResult<DeviceState>;
    flowSwitch: ResolvedFireAlarmResult<DeviceState>;
    heatDetector: ResolvedFireAlarmResult<DeviceState>;
    smokeDetector: ResolvedFireAlarmResult<DeviceState>;
    remarks: { policy: "optional"; maxLength: 2000 };
  };
  chargerAndBatteries: [ResolvedFireAlarmChecklistItem<"main_supply">, ResolvedFireAlarmChecklistItem<"battery">, ResolvedFireAlarmChecklistItem<"charger">];
  mainFunctionKeys: [
    ResolvedFireAlarmChecklistItem<"main_alarm_reset">, ResolvedFireAlarmChecklistItem<"lamp_test">,
    ResolvedFireAlarmChecklistItem<"evacuate">, ResolvedFireAlarmChecklistItem<"ac_supply">,
    ResolvedFireAlarmChecklistItem<"dc_supply">, ResolvedFireAlarmChecklistItem<"spka_system">,
    ResolvedFireAlarmChecklistItem<"alarm_lift_trip">, ResolvedFireAlarmChecklistItem<"signal_gas_discharge">
  ];
  secondaryAlarmDeviceRows: {
    minimum: 0; maximum: 250;
    assetReference: ResolvedFireAlarmText & { key: "asset_reference"; required: false; maxLength: 250 };
    location: ResolvedFireAlarmText & { key: "location"; required: true; maxLength: 300 };
    alarmBell: ResolvedFireAlarmResult<GoodPoor>;
    manualCallPoint: ResolvedFireAlarmResult<GoodPoor>;
    remarks: { policy: "optional"; maxLength: 2000 };
  };
  comments: { policy: "optional"; maxLength: 4000 };
};

export type FireAlarmInspectionSnapshot = {
  schemaVersion: 1 | 2;
  capturedAt: string;
  contractSha256: string | null;
  job: { id: string; reference: string; title: string };
  customer: InspectionJob["configurationSnapshot"]["customer"];
  configuration: InspectionJob["configurationSnapshot"]["configuration"];
  template: InspectionJob["configurationSnapshot"]["template"] & { code: "MFE-FSSR" };
  system: JobSystemSnapshot & {
    systemKey: "fire_alarm_detector";
    definition: FireAlarmSystemDefinition;
    resolvedControls: ResolvedFireAlarmControls;
    repetitionMode: "single_with_two_repeatable_tables";
  };
};
export type FireAlarmInspectionRecord = {
  schemaVersion: 1; clientUuid: string; jobSystemKey: string; jobId: string;
  systemKey: "fire_alarm_detector"; instanceKey: "primary";
  configuredZoneId: null; configuredLocationId: null; displaySequence: 1;
  originalCreatorSnapshot: DeviceReportedCreator | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: number };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: FireAlarmInspectionSnapshot;
  responses: FireAlarmResponses; performedAt: string; localCreatedAt: string; localUpdatedAt: string;
  lastSyncedAt?: string; syncStatus: FireAlarmSyncStatus; lastSyncError?: string;
};
/** Frozen before upload; source hash is the client-known immutable hash.  The
 * server-owned stored hash is bound authoritatively during staging. */
export type FireAlarmEvidenceManifestEntry = { photoUuid: string; fieldPath: string; sourceSha256: string };
export type FireAlarmSyncPayload = Pick<FireAlarmInspectionRecord,
  "clientUuid" | "jobId" | "systemKey" | "instanceKey" | "configuredZoneId" | "configuredLocationId"
  | "displaySequence" | "originalCreatorSnapshot" | "masterTemplate" | "configuration"
  | "inspectionSnapshot" | "responses" | "performedAt"> & { evidenceManifest?: FireAlarmEvidenceManifestEntry[] };
export type ServerFireAlarmDetail = {
  clientUuid: string; serverFormInstanceId: string; jobId: string; jobReference: string; jobTitle: string;
  customer: { id: string; code: string; displayName: string };
  systemKey: "fire_alarm_detector"; systemLabel: "Fire Alarm / Detector System"; instanceKey: "primary";
  status: "submitted"; performedAt: string; receivedAt: string;
  template: { id: string; code: "MFE-FSSR"; version: number };
  contract: { masterTemplateId: string; masterTemplateVersion: number; responseSchemaVersion: 1 | 2; snapshotSchemaVersion: 1 | 2; systemContractSha256: string | null };
  configuration: { revisionId: string; revisionNumber: number }; responses: FireAlarmResponses;
  deviceReportedCreatorUsername: string | null; verifiedOriginalCreatorUsername: string | null; syncedByUsername: string;
};
export type ServerFireAlarmSummary = {
  clientUuid: string; jobId: string; systemKey: "fire_alarm_detector"; instanceKey: "primary";
  zoneId: null; locationId: null; displaySequence: 1; status: "submitted"; performedAt: string;
  deviceReportedCreatorUsername: string | null; verifiedOriginalCreatorUsername: string | null; syncedByUsername: string;
};
