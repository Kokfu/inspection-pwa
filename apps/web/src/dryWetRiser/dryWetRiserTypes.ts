import type { DeviceReportedCreator } from "../hoseReel/hoseReelTypes";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type {
  ResolvedChecklistItem,
  ResolvedMeasurementRow,
  ResolvedRemarksDefinition,
  ResolvedRepeatableResultColumn
} from "../inspectionControls/definitionTypes";

export type HistoricalRiserResult = "good" | "poor";
export type DryWetRiserV7Result = "good" | "not_good" | "complete_repair" | "na";
export type RiserResult = HistoricalRiserResult | DryWetRiserV7Result;
export type RiserStatus = "Draft" | "Pending" | "Syncing" | "Synced" | "Failed" | "Conflict";
export type RiserRow = { result: RiserResult | null; remarks: string };
export type RiserOutletResultColumn = "canvasHoseAt2Result" | "diffuserNozzleResult" | "landingValveResult" | "crandleResult" | "doorResult";
export type RiserOutlet = { rowUuid:string; source:"configured"|"technician"; configuredLocationId:string|null; configuredRowOrdinal:number|null; zoneSnapshot:{id:string;displayName:string}|null; locationSnapshot:{id:string;displayName:string}|null; assetReference:string; locationText:string; canvasHoseAt2Result:RiserResult|null; diffuserNozzleResult:RiserResult|null; landingValveResult:RiserResult|null; crandleResult:RiserResult|null; doorResult:RiserResult|null; remarks:string; fieldRemarks?:Partial<Record<RiserOutletResultColumn,string>>; sortOrder:number };

/** V1-V6 shape: unchanged. Water Tank / Pump House are split objects, PSI is
 * four flat scalar readings, and the Jockey/Duty/Standby judgement lives only
 * on the Pump House checklist copy (see masterServiceReportV7.ts). */
export type LegacyDryWetRiserResponses = { schemaVersion:1; mode:"dry"|"wet"; waterTank:Record<string,RiserRow>; pumpHouse:Record<string,RiserRow>; measurements:{jockeyCutIn:number|null;jockeyCutOut:number|null;dutyCutIn:number|null;standbyCutIn:number|null;unit:"PSI"}; riserOutlets:RiserOutlet[]; comments:string };

export type DryWetRiserV7ChecklistKey =
  | "saj_main_water_supply" | "water_level" | "automatic_refilling_facilities" | "drain_and_stop_valve_positions"
  | "pump_house_clean" | "manual_start_pumps" | "standby_pump_service_items" | "battery_charging_alternator"
  | "battery_charger_failure_alarm" | "battery_serviceable" | "pump_phase_failure_alarm" | "pumps_auto_start"
  | "test_and_gate_valve_positions";
export type DryWetRiserV7MeasurementKey = "jockey_psi" | "duty_psi" | "standby_psi";
export type DryWetRiserV7MeasurementResponse<T extends string> = { values: Record<T, number | null>; unit: "PSI"; result: DryWetRiserV7Result | null; remarks: string };

/** V7 shape: the flat four-state model, with the three duplicate Pump House
 * checklist items dropped and each PSI measurement row owning its own
 * values+result+remarks (see dryWetRiserV7Acceptance.ts). */
export type V7DryWetRiserResponses = {
  schemaVersion: 2;
  mode: "dry" | "wet";
  checklist: Record<DryWetRiserV7ChecklistKey, { result: DryWetRiserV7Result | null; remarks: string }>;
  measurements: {
    jockey_psi: DryWetRiserV7MeasurementResponse<"cut_in" | "cut_out">;
    duty_psi: DryWetRiserV7MeasurementResponse<"cut_in">;
    standby_psi: DryWetRiserV7MeasurementResponse<"cut_in">;
  };
  riserOutlets: RiserOutlet[];
  comments: string;
};

export type DryWetRiserResponses = LegacyDryWetRiserResponses | V7DryWetRiserResponses;

export type ResolvedDryWetRiserControls = {
  schemaVersion: 1;
  source: { templateCode: "MFE-FSSR"; templateVersion: 7; systemKey: "dry_wet_riser" };
  checklist: { waterTank: ResolvedChecklistItem[]; pumpHouse: ResolvedChecklistItem[] };
  measurements: ResolvedMeasurementRow[];
  repeatableRows: { resultColumns: ResolvedRepeatableResultColumn[]; remarks: ResolvedRemarksDefinition };
  comments: ResolvedRemarksDefinition;
};

export type DryWetRiserInspectionRecord = { schemaVersion:1; clientUuid:string;jobSystemKey:string;jobId:string;systemKey:"dry_wet_riser";instanceKey:"primary";configuredZoneId:null;configuredLocationId:null;displaySequence:1;originalCreatorSnapshot:DeviceReportedCreator|null;masterTemplate:{id:string;code:"MFE-FSSR";version:number};configuration:{revisionId:string;revisionNumber:number};inspectionSnapshot:{schemaVersion:1;capturedAt:string;job:{id:string;reference:string;title:string};customer:InspectionJob["configurationSnapshot"]["customer"];configuration:InspectionJob["configurationSnapshot"]["configuration"];template:InspectionJob["configurationSnapshot"]["template"];system:JobSystemSnapshot & {definition:unknown;repetitionMode:"single_with_repeatable_rows"}};responses:DryWetRiserResponses;performedAt:string;localCreatedAt:string;localUpdatedAt:string;lastSyncedAt?:string;syncStatus:RiserStatus;lastSyncError?:string };
