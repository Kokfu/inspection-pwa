import type {
  ResolvedChecklistItem,
  ResolvedRemarksDefinition,
  ResolvedRepeatableResultColumn,
  ResultControlDefinition
} from "./definitionControls.js";
import { isCompatibleSystemContract } from "./systemContractCompatibility.js";

/**
 * FM200 clone of `co2DefinitionControls.ts`. FM200 is a fully independent V7
 * system (own key, own records/evidence/sync) with the exact CO2 field/section
 * structure - see `masterServiceReportV7.ts`'s `fm200FireSuppression` - but,
 * unlike CO2, FM200 has no legacy pre-V7 contract, so this resolver only ever
 * accepts `templateVersion: 7` and never a Wet-Chemical-style variant.
 */
type UnknownRecord = Record<string, unknown>;
export type ResolvedFm200Controls = {
  schemaVersion: 1;
  source: { templateCode: "MFE-FSSR"; templateVersion: 7; systemKey: "fm200_fire_suppression" };
  repetitionMode: "per_location";
  controlPanelLocation: { key: "control_panel_location"; label: string; required: true; maxLength: number };
  detectorRows: {
    minimum: 1;
    maximum: 250;
    alarmZone: { key: "alarm_zone"; label: string; required: true; maxLength: number };
    location: { key: "location"; label: string; required: true; maxLength: number };
    heatDetector: ResolvedRepeatableResultColumn;
    smokeDetector: ResolvedRepeatableResultColumn;
    remarks: ResolvedRemarksDefinition;
  };
  chargerAndBatteries: ResolvedChecklistItem[];
  physicalOutlook: ResolvedChecklistItem[];
  mainFunctionKeys: ResolvedChecklistItem[];
  comments: ResolvedRemarksDefinition;
};

const labels: Readonly<Record<string, string>> = {
  good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "No Need Checking / N.A.",
  poor: "Poor", not_relevant: "Not Relevant", normal: "Normal", test: "Test", isolation: "Isolation"
};
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
function text(value: unknown, name: string) { if (typeof value !== "string" || !value) throw new Error(`FM200 definition has invalid ${name}`); return value; }
function integer(value: unknown, name: string) { if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`FM200 definition has invalid ${name}`); return value; }
function list(value: unknown, name: string): UnknownRecord[] { if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`FM200 definition has invalid ${name}`); return value; }
function named(values: UnknownRecord[], key: string, name: string) { const value = values.find((item) => item.key === key); if (!value) throw new Error(`FM200 definition is missing ${name}`); return value; }
function control(type: unknown, values: unknown, required: boolean): ResultControlDefinition {
  if ((type !== "good_poor" && type !== "normal_test_isolation" && type !== "normal_test_isolation_multi") || !Array.isArray(values)) throw new Error("FM200 result metadata is invalid");
  const options = values.map((value) => text(value, "result option"));
  if (!options.length || new Set(options).size !== options.length) throw new Error("FM200 result options are invalid");
  return { type: type === "normal_test_isolation_multi" ? "multi_select" : "single_select", required, options: options.map((value) => {
    const label = labels[value]; if (!label) throw new Error(`Unknown FM200 result option ${value}`); return { value, label };
  }) };
}
const remarks = (maxLength = 2000): ResolvedRemarksDefinition => ({ policy: "optional", maxLength });
function checklist(item: UnknownRecord): ResolvedChecklistItem {
  return { key: text(item.key, "checklist key"), label: text(item.label, "checklist label"), sortOrder: integer(item.sortOrder, "checklist order"), result: control(item.control, item.allowedValues, true), remarks: remarks() };
}
function detector(item: UnknownRecord): ResolvedRepeatableResultColumn {
  return { key: text(item.key, "detector key"), label: text(item.label, "detector label"), sortOrder: integer(item.sortOrder, "detector order"), result: control(item.control, item.allowedValues, false) };
}
const sorted = <T extends { sortOrder: number }>(items: T[]) => items.sort((a, b) => a.sortOrder - b.sortOrder);

export function resolveFm200Controls(definition: unknown, templateCode = "MFE-FSSR", templateVersion = 7): ResolvedFm200Controls {
  if (templateCode !== "MFE-FSSR" || templateVersion !== 7 || !isRecord(definition)
    || definition.key !== "fm200_fire_suppression"
    || !isCompatibleSystemContract("fm200_fire_suppression", "confirmed", definition)) {
    throw new Error("Unsupported FM200 template definition");
  }
  const sections = list(definition.sections, "sections");
  const panel = named(sections, "control_panel", "Control Panel section");
  const charger = named(sections, "charger_batteries", "Charger section");
  const physical = named(sections, "physical_outlook", "Physical section");
  const functions = named(sections, "main_function_key", "Function section");
  const panelBlocks = list(panel.blocks, "Control Panel blocks");
  const panelLocation = named(panelBlocks, "control_panel_location", "Control Panel Location");
  const panelField = named(list(panelLocation.items, "Control Panel Location items"), "control_panel_location", "Control Panel Location field");
  const rows = named(panelBlocks, "detector_rows", "Detector rows");
  const columns = list(rows.columns, "Detector columns");
  const functionBlocks = list(functions.blocks, "Function blocks");
  const comments = named(functionBlocks, "comments", "Comments");
  if (!isRecord(comments.field) || comments.field.control !== "remarks") throw new Error("FM200 comments metadata is invalid");
  return {
    schemaVersion: 1,
    source: { templateCode: "MFE-FSSR", templateVersion: 7, systemKey: "fm200_fire_suppression" },
    repetitionMode: "per_location",
    controlPanelLocation: { key: "control_panel_location", label: text(panelField.label, "panel label"), required: true, maxLength: 300 },
    detectorRows: {
      minimum: 1,
      maximum: 250,
      alarmZone: { key: "alarm_zone", label: text(named(columns, "alarm_zone", "Alarm Zone").label, "Alarm Zone label"), required: true, maxLength: 200 },
      location: { key: "location", label: text(named(columns, "location", "Location").label, "Location label"), required: true, maxLength: 300 },
      heatDetector: detector(named(columns, "heat_detector", "Heat Detector")),
      smokeDetector: detector(named(columns, "smoke_detector", "Smoke Detector")),
      remarks: remarks()
    },
    chargerAndBatteries: sorted(list(named(list(charger.blocks, "Charger blocks"), "charger_battery_checks", "Charger checks").items, "Charger items").map(checklist)),
    physicalOutlook: sorted(list(named(list(physical.blocks, "Physical blocks"), "physical_outlook_checks", "Physical checks").items, "Physical items").map(checklist)),
    mainFunctionKeys: sorted(list(named(functionBlocks, "function_checks", "Function checks").items, "Function items").map(checklist)),
    comments: remarks(4000)
  };
}
