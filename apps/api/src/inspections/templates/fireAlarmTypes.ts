import type { SystemDefinition } from "./templateTypes.js";

export type DeviceState = "normal" | "test" | "isolation";
export type GoodPoor = "good" | "poor";
export type FireAlarmSyncStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";

export type FireAlarmRowPreset = {
  fireAlarmTable: "primary" | "secondary";
  assetReference?: string;
};

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

export type FireAlarmRowProvenance =
  | ConfiguredFireAlarmRowProvenance
  | TechnicianFireAlarmRowProvenance;

export type FireAlarmPrimaryDeviceRow = FireAlarmRowProvenance & {
  rowUuid: string;
  displaySequence: number;
  assetReference: string;
  alarmZone: string;
  location: string;
  manualCallPoint: DeviceState | null;
  flowSwitch: DeviceState | null;
  heatDetector: DeviceState | null;
  smokeDetector: DeviceState | null;
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
  schemaVersion: 1;
  controlPanelLocation: string;
  primaryDeviceRows: FireAlarmPrimaryDeviceRow[];
  chargerAndBatteries: FireAlarmChargerAndBatteriesResponse;
  mainFunctionKeys: FireAlarmMainFunctionResponse;
  secondaryAlarmDeviceRows: FireAlarmSecondaryAlarmDeviceRow[];
  comments: string;
};

export type FireAlarmDefinition = SystemDefinition & {
  readonly key: "fire_alarm_detector";
  readonly displayName: "Fire Alarm / Detector System";
  readonly sortOrder: 5;
  readonly definitionStatus: "confirmed";
};

export type ResolvedFireAlarmResultOption<T extends string> = {
  value: T;
  label: string;
};

export type ResolvedFireAlarmResult<T extends string> = {
  type: "single_select";
  required: true;
  options: ResolvedFireAlarmResultOption<T>[];
};

export type ResolvedFireAlarmText = {
  key: string;
  label: string;
  required: boolean;
  maxLength: number;
};

export type ResolvedFireAlarmChecklistItem<K extends string> = {
  key: K;
  label: string;
  sortOrder: number;
  result: ResolvedFireAlarmResult<GoodPoor>;
  remarks: { policy: "optional"; maxLength: 2000 };
};

export type ResolvedFireAlarmControls = {
  schemaVersion: 1;
  source: { templateCode: "MFE-FSSR"; templateVersion: 3; systemKey: "fire_alarm_detector" };
  repetitionMode: "single_with_two_repeatable_tables";
  instance: { key: "primary"; displaySequence: 1; zoneId: null; locationId: null };
  controlPanelLocation: ResolvedFireAlarmText & { key: "control_panel_location"; required: true; maxLength: 300 };
  primaryDeviceRows: {
    minimum: 1;
    maximum: 250;
    assetReference: ResolvedFireAlarmText & { key: "asset_reference"; required: false; maxLength: 250 };
    alarmZone: ResolvedFireAlarmText & { key: "alarm_zone"; required: true; maxLength: 200 };
    location: ResolvedFireAlarmText & { key: "location"; required: true; maxLength: 300 };
    manualCallPoint: ResolvedFireAlarmResult<DeviceState>;
    flowSwitch: ResolvedFireAlarmResult<DeviceState>;
    heatDetector: ResolvedFireAlarmResult<DeviceState>;
    smokeDetector: ResolvedFireAlarmResult<DeviceState>;
    remarks: { policy: "optional"; maxLength: 2000 };
  };
  chargerAndBatteries: [
    ResolvedFireAlarmChecklistItem<"main_supply">,
    ResolvedFireAlarmChecklistItem<"battery">,
    ResolvedFireAlarmChecklistItem<"charger">
  ];
  mainFunctionKeys: [
    ResolvedFireAlarmChecklistItem<"main_alarm_reset">,
    ResolvedFireAlarmChecklistItem<"lamp_test">,
    ResolvedFireAlarmChecklistItem<"evacuate">,
    ResolvedFireAlarmChecklistItem<"ac_supply">,
    ResolvedFireAlarmChecklistItem<"dc_supply">,
    ResolvedFireAlarmChecklistItem<"spka_system">,
    ResolvedFireAlarmChecklistItem<"alarm_lift_trip">,
    ResolvedFireAlarmChecklistItem<"signal_gas_discharge">
  ];
  secondaryAlarmDeviceRows: {
    minimum: 0;
    maximum: 250;
    assetReference: ResolvedFireAlarmText & { key: "asset_reference"; required: false; maxLength: 250 };
    location: ResolvedFireAlarmText & { key: "location"; required: true; maxLength: 300 };
    alarmBell: ResolvedFireAlarmResult<GoodPoor>;
    manualCallPoint: ResolvedFireAlarmResult<GoodPoor>;
    remarks: { policy: "optional"; maxLength: 2000 };
  };
  comments: { policy: "optional"; maxLength: 4000 };
};

export type FireAlarmConfiguredSystemSnapshot = {
  enabledSystemId: string;
  systemKey: "fire_alarm_detector";
  displayName: "Fire Alarm / Detector System";
  sortOrder: number;
  definitionStatus: "confirmed";
  zones: Array<{ id: string; enabledSystemId: string; key: string; displayName: string; sortOrder: number }>;
  locations: Array<{
    id: string;
    enabledSystemId: string;
    zoneId: string | null;
    key: string;
    displayName: string;
    presetRowCount: number;
    rowPreset: FireAlarmRowPreset;
    sortOrder: number;
  }>;
  definition: FireAlarmDefinition;
  resolvedControls: ResolvedFireAlarmControls;
  repetitionMode: "single_with_two_repeatable_tables";
};

export type FireAlarmInspectionSnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  job: { id: string; reference: string; title: string };
  customer: { id: string; code: string; displayName: string };
  configuration: { revisionId: string; revisionNumber: number };
  template: { id: string; code: "MFE-FSSR"; name: string; version: 3 };
  system: FireAlarmConfiguredSystemSnapshot;
};

export type FireAlarmInspectionRecord = {
  schemaVersion: 1;
  clientUuid: string;
  jobSystemKey: string;
  jobId: string;
  systemKey: "fire_alarm_detector";
  instanceKey: "primary";
  configuredZoneId: null;
  configuredLocationId: null;
  displaySequence: 1;
  originalCreatorSnapshot: {
    source: "device_reported";
    userId: number;
    username: string;
    role: "admin" | "inspector";
    capturedAt: string;
  } | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: 3 };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: FireAlarmInspectionSnapshot;
  responses: FireAlarmResponses;
  performedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  syncStatus: FireAlarmSyncStatus;
  lastSyncError?: string;
};

export type FireAlarmSyncPayload = Pick<FireAlarmInspectionRecord,
  "clientUuid" | "jobId" | "systemKey" | "instanceKey" | "configuredZoneId"
  | "configuredLocationId" | "displaySequence" | "originalCreatorSnapshot"
  | "masterTemplate" | "configuration" | "inspectionSnapshot" | "responses" | "performedAt">;

export type ServerFireAlarmDetail = {
  clientUuid: string;
  serverFormInstanceId: string;
  jobId: string;
  jobReference: string;
  jobTitle: string;
  customer: { id: string; code: string; displayName: string };
  systemKey: "fire_alarm_detector";
  systemLabel: "Fire Alarm / Detector System";
  instanceKey: "primary";
  status: "submitted";
  performedAt: string;
  receivedAt: string;
  template: { id: string; code: "MFE-FSSR"; version: 3 };
  configuration: { revisionId: string; revisionNumber: number };
  responses: FireAlarmResponses;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
};

export type ServerFireAlarmSummary = {
  clientUuid: string;
  jobId: string;
  systemKey: "fire_alarm_detector";
  instanceKey: "primary";
  zoneId: null;
  locationId: null;
  displaySequence: 1;
  status: "submitted";
  performedAt: string;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
};
