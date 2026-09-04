import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import type { MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";

const v7ResultValues = ["good", "not_good", "complete_repair", "na"] as const;

/** V7 is forward-only.  Earlier template objects are never mutated. */
function upgradeV7EvidenceSystem(system: SystemDefinition): SystemDefinition {
  return {
    ...system,
    sections: system.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        if (block.type === "checklist") return {
          ...block,
          items: block.items.map((field) => field.control === "good_poor"
            ? { ...field, allowedValues: v7ResultValues }
            : field)
        };
        if (block.type === "repeatable_table") return {
          ...block,
          columns: block.columns.map((field) => field.control === "normal_test_isolation"
            ? { ...field, control: "normal_test_isolation_multi" as const }
            : field.control === "good_poor" ? { ...field, allowedValues: v7ResultValues } : field)
        };
        return block;
      })
    }))
  };
}

/** Deep four-state rewrite.  Unlike `upgradeV7EvidenceSystem` this also reaches
 * a measurement row's nested `result`, which is a `good_poor` control that is
 * not a checklist item or a repeatable-table column. */
const fourState = (value: unknown): unknown => Array.isArray(value)
  ? value.map(fourState)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, key === "allowedValues" && (value as Record<string, unknown>).control === "good_poor" ? v7ResultValues : fourState(child)]))
    : value;

/** Hose Reel reaches V7 after the first four systems were published.  Keep its
 * expansion separate so those already-shipped contracts remain byte-identical.
 * The source paper form specifies only Duty and Standby in this test-run block;
 * it gives no Jockey row, duration semantics, or extra readings to model. */
function upgradeV7HoseReel(system: SystemDefinition): SystemDefinition {
  const testRun = {
    key: "test_run_fire_pump_30_minutes",
    title: "Test Run Fire Pump 30 Minutes",
    sortOrder: 3,
    blocks: [{
      key: "test_run_fire_pump_checks",
      title: "Test Run Fire Pump 30 Minutes",
      type: "checklist" as const,
      sortOrder: 1,
      items: [
        { key: "trfp_duty_pump", label: "Duty Pump", control: "good_poor" as const, required: false, sortOrder: 1, allowedValues: v7ResultValues, remarksPolicy: "optional" as const },
        { key: "trfp_standby_pump", label: "Standby Pump", control: "good_poor" as const, required: false, sortOrder: 2, allowedValues: v7ResultValues, remarksPolicy: "optional" as const }
      ]
    }]
  };
  const source = fourState(system) as SystemDefinition;
  return {
    ...source,
    sections: source.sections.flatMap((section) => section.key === "hose_reel_drum"
      ? [testRun, { ...section, sortOrder: 4 }]
      : [section])
  };
}

/** Automatic Sprinkler reaches V7 after five systems were published, so its
 * expansion is separate for the same reason Hose Reel's is.
 *
 * Two shape differences from Hose Reel are real and form-specific, not errors:
 * the paper's TEST RUN FIRE PUMP 30 MINUTES block has THREE rows here (Jockey,
 * Duty, Standby); and Comments lives inside the Main Alarm Valve section rather
 * than in a trailing section of its own, so the new block is appended to that
 * section immediately before Comments — which is exactly where the paper form
 * places it (after MAIN ALARM VALVE, before Comments). */
function upgradeV7AutomaticSprinkler(system: SystemDefinition): SystemDefinition {
  const testRun = {
    key: "test_run_fire_pump_checks",
    title: "Test Run Fire Pump 30 Minutes",
    type: "checklist" as const,
    sortOrder: 3,
    items: [
      { key: "trfp_jockey_pump", label: "Jockey Pump", control: "good_poor" as const, required: false, sortOrder: 1, allowedValues: v7ResultValues, remarksPolicy: "optional" as const },
      { key: "trfp_duty_pump", label: "Duty Pump", control: "good_poor" as const, required: false, sortOrder: 2, allowedValues: v7ResultValues, remarksPolicy: "optional" as const },
      { key: "trfp_standby_pump", label: "Standby Pump", control: "good_poor" as const, required: false, sortOrder: 3, allowedValues: v7ResultValues, remarksPolicy: "optional" as const }
    ]
  };
  const source = fourState(system) as SystemDefinition;
  return {
    ...source,
    sections: source.sections.map((section) => section.key === "main_alarm_valve"
      ? {
        ...section,
        blocks: [
          ...section.blocks.filter((block) => block.type !== "comments"),
          testRun,
          ...section.blocks.filter((block) => block.type === "comments").map((block) => ({ ...block, sortOrder: 4 }))
        ]
      }
      : section)
  };
}

/**
 * The first multi-system shared-evidence template. Fire Alarm is structurally
 * retains its independent detector-state control; Good/Poor fields use the
 * four-state Hokuden checklist legend.
 */
export const masterServiceReportV7 = {
  ...masterServiceReportV6,
  id: "00000000-0000-4000-8000-000000000807",
  version: 7,
  systems: masterServiceReportV6.systems.map((system) =>
    system.key === "co2_fire_extinguisher" || system.key === "wet_chemical" || system.key === "fire_alarm_detector" || system.key === "hydrant"
      ? upgradeV7EvidenceSystem(system)
      : system.key === "hose_reel"
        ? upgradeV7HoseReel(system)
      : system.key === "automatic_sprinkler"
        ? upgradeV7AutomaticSprinkler(system)
      : system
  )
} as const satisfies MasterServiceReportDefinition;
