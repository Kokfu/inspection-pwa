/**
 * Read-only "form layout" for the Manager's form-shaped label editor.
 *
 * DISPLAY METADATA ONLY. It describes where each label-bearing node of a
 * resolved-controls tree sits on the technician form (section heading, control
 * kind, parent measurement, result vocabulary, unit) so the Manager screen can
 * lay the fields out like the technician form. It never changes a label, a
 * path, a response key, a result option, the override map, validation,
 * versioning or the job freeze. Paths are the canonical label paths produced by
 * `collectResolvedLabelPaths` (see `labelOverrides.ts`); every such path appears
 * in the layout exactly once, and the layout never names a path the tree does
 * not expose.
 *
 * Section headings and order mirror the technician forms:
 *   hose_reel            -> HoseReelInspectionForm.tsx
 *   co2 / wet_chemical   -> Co2InspectionForm.tsx
 *   automatic_sprinkler  -> AutomaticSprinklerInspectionForm.tsx (its `layout`)
 */
import { collectResolvedLabelPaths } from "./labelOverrides.js";

export type FormLayoutControl = "checklist_item" | "measurement" | "measurement_value" | "text" | "result_column";

export type FormLayoutResult = {
  type: "single_select" | "multi_select";
  options: Array<{ value: string; label: string }>;
};

export type FormLayoutField = {
  /** Canonical label path (same grammar as the override map). */
  path: string;
  control: FormLayoutControl;
  /** For a `measurement_value`, the path of its measurement row; otherwise null. */
  parentPath: string | null;
  /** The field's own result control, when it has one. */
  result: FormLayoutResult | null;
  /** Measurement unit for a `measurement_value`; otherwise null. */
  unit: string | null;
  /** Whether the technician sees a Remarks box under this field. */
  remarks: boolean;
};

export type FormLayoutSection = {
  key: string;
  heading: string;
  /** Present when the section is a repeatable row table (technician adds rows). */
  repeatable: { rowHeading: string } | null;
  fields: FormLayoutField[];
};

export type LabelOverrideFormLayout = { sections: FormLayoutSection[] };

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const records = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const stringKey = (value: UnknownRecord): string | null => (typeof value.key === "string" ? value.key : null);

function resultOf(node: UnknownRecord): FormLayoutResult | null {
  const result = node.result;
  if (!isRecord(result) || (result.type !== "single_select" && result.type !== "multi_select")) return null;
  const options = records(result.options)
    .filter((option) => typeof option.value === "string" && typeof option.label === "string")
    .map((option) => ({ value: option.value as string, label: option.label as string }));
  return { type: result.type, options };
}

const remarksOf = (node: UnknownRecord) => isRecord(node.remarks) && node.remarks.policy === "optional";

function checklistFields(items: unknown, base: string): FormLayoutField[] {
  return records(items).flatMap((item) => {
    const key = stringKey(item);
    if (!key) return [];
    return [{ path: `${base}.${key}`, control: "checklist_item" as const, parentPath: null, result: resultOf(item), unit: null, remarks: remarksOf(item) }];
  });
}

function measurementFields(row: UnknownRecord): FormLayoutField[] {
  const key = stringKey(row);
  if (!key) return [];
  const path = `measurements.${key}`;
  return [
    { path, control: "measurement", parentPath: null, result: resultOf(row), unit: null, remarks: remarksOf(row) },
    ...records(row.values).flatMap((value) => {
      const valueKey = stringKey(value);
      if (!valueKey) return [];
      return [{
        path: `${path}.values.${valueKey}`, control: "measurement_value" as const, parentPath: path,
        result: null, unit: typeof value.unit === "string" ? value.unit : null, remarks: false
      }];
    })
  ];
}

const section = (key: string, heading: string, fields: FormLayoutField[], repeatable: FormLayoutSection["repeatable"] = null): FormLayoutSection =>
  ({ key, heading, repeatable, fields });

function hoseReelSections(controls: UnknownRecord): FormLayoutSection[] {
  const checklist = isRecord(controls.checklist) ? controls.checklist : {};
  const repeatableRows = isRecord(controls.repeatableRows) ? controls.repeatableRows : {};
  return [
    section("water_tank", "Water Tank", checklistFields(checklist.waterTank, "checklist.waterTank")),
    section("pump_house", "Pump House", [
      ...checklistFields(checklist.pumpHouse, "checklist.pumpHouse"),
      ...records(controls.measurements).flatMap(measurementFields)
    ]),
    section("test_run_fire_pump", "Test Run Fire Pump 30 Minutes", checklistFields(checklist.testRunFirePump, "checklist.testRunFirePump")),
    section("hose_reel_drums", "Hose Reel Drums", records(repeatableRows.resultColumns).flatMap((column) => {
      const key = stringKey(column);
      if (!key) return [];
      return [{ path: `repeatableRows.resultColumns.${key}`, control: "result_column" as const, parentPath: null, result: resultOf(column), unit: null, remarks: false }];
    }), { rowHeading: "Drum" })
  ];
}

function co2Sections(controls: UnknownRecord): FormLayoutSection[] {
  const detectorRows = isRecord(controls.detectorRows) ? controls.detectorRows : {};
  const text = (path: string): FormLayoutField => ({ path, control: "text", parentPath: null, result: null, unit: null, remarks: false });
  const column = (path: string, node: unknown): FormLayoutField =>
    ({ path, control: "result_column", parentPath: null, result: isRecord(node) ? resultOf(node) : null, unit: null, remarks: false });
  return [
    section("control_panel", "Control Panel", isRecord(controls.controlPanelLocation) ? [text("controlPanelLocation")] : []),
    section("detector_table", "Detector Table", [
      ...(isRecord(detectorRows.alarmZone) ? [text("detectorRows.alarmZone")] : []),
      ...(isRecord(detectorRows.location) ? [text("detectorRows.location")] : []),
      ...(isRecord(detectorRows.heatDetector) ? [column("detectorRows.heatDetector", detectorRows.heatDetector)] : []),
      ...(isRecord(detectorRows.smokeDetector) ? [column("detectorRows.smokeDetector", detectorRows.smokeDetector)] : [])
    ], { rowHeading: "Detector Row" }),
    section("charger_batteries", "Charger & Batteries", checklistFields(controls.chargerAndBatteries, "chargerAndBatteries")),
    section("physical_outlook", "Physical Outlook", checklistFields(controls.physicalOutlook, "physicalOutlook")),
    section("main_function_keys", "Main Function Keys", checklistFields(controls.mainFunctionKeys, "mainFunctionKeys"))
  ];
}

function automaticSprinklerSections(controls: UnknownRecord): FormLayoutSection[] {
  const checklist = isRecord(controls.checklist) ? controls.checklist : {};
  const layout = isRecord(controls.layout) ? controls.layout : {};
  const measurements = records(controls.measurements);
  const sectionFields = (name: string): FormLayoutField[] => {
    const items = records(checklist[name]);
    const rows = Array.isArray(layout[name])
      ? records(layout[name])
      : items.map((item) => ({ kind: "checklist", key: item.key }));
    return rows.flatMap((row) => {
      if (row.kind === "measurement") {
        const measurement = measurements.find((candidate) => candidate.key === row.key);
        return measurement ? measurementFields(measurement) : [];
      }
      const item = items.find((candidate) => candidate.key === row.key);
      return item ? checklistFields([item], `checklist.${name}`) : [];
    });
  };
  return [
    section("water_tank", "Water Tank", sectionFields("waterTank")),
    section("pump_house", "Pump House", sectionFields("pumpHouse")),
    section("main_alarm_valve", "Main Alarm Valve", sectionFields("mainAlarmValve")),
    section("test_run_fire_pump", "Test Run Fire Pump 30 Minutes", sectionFields("testRunFirePump"))
  ];
}

/**
 * Build the layout for one supported system's resolved-controls tree. Sections
 * with no fields are dropped. Any label path the per-system layout did not place
 * (defensive — should never happen for the published trees) is appended to an
 * "Other fields" section so the Manager can still see and edit it; any layout
 * entry whose path is not a real label path is dropped.
 */
export function buildLabelOverrideFormLayout(systemKey: string, controls: unknown): LabelOverrideFormLayout {
  const tree = isRecord(controls) ? controls : {};
  const drafted = systemKey === "hose_reel" ? hoseReelSections(tree)
    : systemKey === "co2_fire_extinguisher" || systemKey === "wet_chemical" ? co2Sections(tree)
      : systemKey === "automatic_sprinkler" ? automaticSprinklerSections(tree)
        : [];
  const labelPaths = collectResolvedLabelPaths(controls).map((entry) => entry.path);
  const valid = new Set(labelPaths);
  const placed = new Set<string>();
  const sections = drafted.map((candidate) => ({
    ...candidate,
    fields: candidate.fields.filter((field) => {
      if (!valid.has(field.path) || placed.has(field.path)) return false;
      placed.add(field.path);
      return true;
    })
  })).filter((candidate) => candidate.fields.length > 0);
  const leftovers = labelPaths.filter((path) => !placed.has(path));
  if (leftovers.length > 0) {
    sections.push(section("other", "Other fields", leftovers.map((path) =>
      ({ path, control: "text" as const, parentPath: null, result: null, unit: null, remarks: false }))));
  }
  return { sections };
}
