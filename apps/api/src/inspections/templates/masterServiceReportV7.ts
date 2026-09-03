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
    system.key === "co2_fire_extinguisher" || system.key === "wet_chemical" || system.key === "fire_alarm_detector"
      ? upgradeV7EvidenceSystem(system)
      : system
  )
} as const satisfies MasterServiceReportDefinition;
