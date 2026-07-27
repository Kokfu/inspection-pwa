import type {
  ResolvedChecklistItem,
  ResolvedMeasurementRow,
  ResolvedRemarksDefinition
} from "../inspectionControls/definitionTypes";
import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";

export type SprinklerResult = "good" | "poor";
export type SprinklerSyncStatus =
  | "Draft"
  | "Pending"
  | "Syncing"
  | "Synced"
  | "Failed"
  | "Conflict";

export type SprinklerRowResponse = {
  result: SprinklerResult | null;
  remarks: string;
};

export type SprinklerMeasurementResponse<T extends string> = {
  values: Record<T, number | null>;
  unit: string;
  result: SprinklerResult | null;
  remarks: string;
};

export type WaterTankKey =
  | "saj_main_water_supply"
  | "water_level"
  | "automatic_refilling_facilities"
  | "drain_and_stop_valve_positions";

export type PumpHouseChecklistKey =
  | "pump_house_clean"
  | "manual_start_pumps"
  | "standby_pump_service_items"
  | "battery_charging_alternator"
  | "battery_serviceable"
  | "pump_phase_failure_alarm"
  | "pumps_auto_start"
  | "test_and_gate_valve_positions";

export type MainAlarmValveChecklistKey =
  | "breaching_inlet"
  | "alarm_gong"
  | "flow_meter_valve_positions";

export type SprinklerMeasurementKey =
  | "jockey_pump_pressure"
  | "duty_pump_cut_in"
  | "standby_pump_cut_in"
  | "water_supply_gauge"
  | "installation_gauge";

export type AutomaticSprinklerResponses = {
  schemaVersion: 1;
  waterTank: Record<WaterTankKey, SprinklerRowResponse>;
  pumpHouse: Record<PumpHouseChecklistKey, SprinklerRowResponse>;
  measurements: {
    jockey_pump_pressure: SprinklerMeasurementResponse<"cut_in" | "cut_out">;
    duty_pump_cut_in: SprinklerMeasurementResponse<"value">;
    standby_pump_cut_in: SprinklerMeasurementResponse<"value">;
    water_supply_gauge: SprinklerMeasurementResponse<"value">;
    installation_gauge: SprinklerMeasurementResponse<"value">;
  };
  mainAlarmValve: Record<MainAlarmValveChecklistKey, SprinklerRowResponse>;
  comments: string;
};

export type SprinklerLayoutRow = {
  kind: "checklist" | "measurement";
  key: string;
};

export type ResolvedAutomaticSprinklerControls = {
  schemaVersion: 1;
  source: {
    templateCode: "MFE-FSSR";
    templateVersion: 1;
    systemKey: "automatic_sprinkler";
  };
  repetitionMode: "single";
  instance: {
    key: "primary";
    displaySequence: 1;
    zoneId: null;
    locationId: null;
  };
  checklist: {
    waterTank: ResolvedChecklistItem[];
    pumpHouse: ResolvedChecklistItem[];
    mainAlarmValve: ResolvedChecklistItem[];
  };
  measurements: ResolvedMeasurementRow[];
  layout: {
    waterTank: SprinklerLayoutRow[];
    pumpHouse: SprinklerLayoutRow[];
    mainAlarmValve: SprinklerLayoutRow[];
  };
  comments: ResolvedRemarksDefinition;
};

export type AutomaticSprinklerInspectionSnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  job: { id: string; reference: string; title: string };
  customer: InspectionJob["configurationSnapshot"]["customer"];
  configuration: InspectionJob["configurationSnapshot"]["configuration"];
  template: InspectionJob["configurationSnapshot"]["template"];
  system: JobSystemSnapshot & {
    definition: unknown;
    resolvedControls: ResolvedAutomaticSprinklerControls;
    repetitionMode: "single";
  };
  instance: {
    instanceKey: "primary";
    displaySequence: 1;
    zone: null;
    location: null;
  };
};

export type AutomaticSprinklerInspectionRecord = {
  schemaVersion: 1;
  clientUuid: string;
  jobSystemKey: string;
  jobId: string;
  systemKey: "automatic_sprinkler";
  instanceKey: "primary";
  configuredZoneId: null;
  configuredLocationId: null;
  displaySequence: 1;
  originalCreatorSnapshot: DeviceReportedCreator | null;
  masterTemplate: { id: string; code: "MFE-FSSR"; version: 1 };
  configuration: { revisionId: string; revisionNumber: number };
  inspectionSnapshot: AutomaticSprinklerInspectionSnapshot;
  responses: AutomaticSprinklerResponses;
  performedAt: string;
  localCreatedAt: string;
  localUpdatedAt: string;
  lastSyncedAt?: string;
  attachmentSetSubmittedAt?: string;
  submittedAttachmentManifest?: Array<{
    photoUuid: string;
    fieldPath: string;
    evidencePolicyId: string;
    evidencePolicyVersion: number;
    captureSource: "camera" | "gallery" | "unknown";
    mimeType: "image/jpeg";
    sizeBytes: number;
    width: number;
    height: number;
    sha256: string;
    capturedAt: string;
  }>;
  syncStatus: SprinklerSyncStatus;
  lastSyncError?: string;
};
