import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import type { MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";

const legacyFireAlarm = masterServiceReportV5.systems.find(
  (system) => system.key === "fire_alarm_detector"
)!;

function v6FireAlarmDefinition(): SystemDefinition {
  return {
    ...legacyFireAlarm,
    sections: legacyFireAlarm.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => {
        if (block.type !== "checklist" && block.type !== "repeatable_table") return block;
        const fields = block.type === "checklist" ? block.items : block.columns;
        const upgraded = fields.map((field) => field.control === "good_poor"
          ? { ...field, allowedValues: ["good", "poor", "not_relevant"] as const }
          : field
        );
        return block.type === "checklist"
          ? { ...block, items: upgraded }
          : { ...block, columns: upgraded };
      })
    }))
  };
}

/** One forward-only global report template.  V6 behavior is selected from the
 * frozen master-template identity, never by the Fire Alarm system key alone. */
export const masterServiceReportV6 = {
  ...masterServiceReportV5,
  id: "00000000-0000-4000-8000-000000000806",
  version: 6,
  systems: masterServiceReportV5.systems.map((system) =>
    system.key === "fire_alarm_detector" ? v6FireAlarmDefinition() : system
  )
} as const satisfies MasterServiceReportDefinition;
