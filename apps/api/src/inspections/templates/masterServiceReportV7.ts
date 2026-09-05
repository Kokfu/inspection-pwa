import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import type { FieldDefinition, MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";

const v7ResultValues = ["good", "not_good", "complete_repair", "na"] as const;

function v7GoodPoor(key: string, label: string, sortOrder: number): FieldDefinition {
  return { key, label, control: "good_poor", required: false, sortOrder, allowedValues: v7ResultValues, remarksPolicy: "optional" };
}

function v7TextField(key: string, label: string, sortOrder: number): FieldDefinition {
  return { key, label, control: "text", required: false, sortOrder };
}

function v7Comments(sortOrder: number) {
  return {
    key: "comments",
    title: "Comments",
    type: "comments" as const,
    sortOrder,
    field: { key: "comments", label: "Comments", control: "remarks" as const, required: false, sortOrder: 1 }
  };
}

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
 * Dry / Wet Riser reaches V7 after six systems were published, from its V2
 * catalog entry (`masterServiceReportV6.systems` already carries V2's shape
 * forward - V1's is retained only for jobs created before V2 shipped and is
 * never this transform's input).
 *
 * V2's Pump House block declares the Jockey/Duty/Standby pressure judgement
 * twice: once as a plain good/poor checklist item (jockey_pump_pressure,
 * duty_pump_cut_in, standby_pump_cut_in) and again as the `result` on the
 * separate pump_measurements block's raw-PSI rows (jockey_psi, duty_psi,
 * standby_psi). The deployed V1-V6 response schema only ever populates the
 * checklist copy, leaving the measurement rows' own `result` permanently
 * unset. V7 resolves that split by dropping the three duplicate checklist
 * items and making each measurement row's own values+result+remarks the
 * single source of truth, exactly like Automatic Sprinkler's PSI rows.
 */
function upgradeV7DryWetRiser(system: SystemDefinition): SystemDefinition {
  const duplicateMeasurementChecklistKeys = new Set(["jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in"]);
  const source = fourState(system) as SystemDefinition;
  return {
    ...source,
    sections: source.sections.map((section) => section.key !== "pump_house"
      ? section
      : {
        ...section,
        blocks: section.blocks.map((block) => block.type === "checklist" && block.key === "pump_house_checks"
          ? { ...block, items: block.items.filter((item) => !duplicateMeasurementChecklistKeys.has(item.key)) }
          : block)
      })
  };
}

/**
 * STEP 2.2: Smoke Ventilation has no V1-V6 presence at all - unlike the
 * STEP 1 systems above, there is no earlier confirmed definition to upgrade,
 * so this system is composed fresh rather than derived from
 * `masterServiceReportV6.systems`. It is V7-only from the start and carries
 * the four-state result model natively (no `fourState`/`upgradeV7*` rewrite
 * is needed because there is no legacy shape to preserve).
 *
 * Source: `docs/paper-forms/smoke-ventilation.md`. Two paper revisions exist
 * with real structural differences; this definition follows the blank
 * master (Revision A) - a single Control Panel No. / Location, one 10-row
 * Fan Schedule table - consistent with how every other base system in this
 * template is built from the blank master rather than a customer-specific
 * Hokuden layout. The Hokuden 3-zone/8-row-per-zone revision and its
 * free-text (not oval) AC/DC power-supply fields are not modeled; flagged
 * below via `confirmationNotes` per the project's standing rule against
 * inventing unconfirmed fields.
 *
 * The Fan Schedule's "No." rows (1-10) are fixed asset identities, not
 * customer-varying physical locations, but this template reuses the same
 * `repeatable_table` + `customer_system_locations` machinery Hydrant/Hose
 * Reel/Riser already use (`supportsLocations: true`, no zone dimension -
 * `customer_system_locations.zone_id` is already nullable) rather than
 * inventing a new "fixed row count, no location" mechanism. Every customer
 * enabling Smoke Ventilation is configured with the same 10 preset rows.
 */
const smokeVentilation: SystemDefinition = {
  key: "smoke_ventilation",
  displayName: "Smoke Ventilation System",
  sortOrder: 10,
  definitionStatus: "confirmed",
  configuration: { supportsZones: false, supportsLocations: true, supportsPresetRows: true },
  confirmationNotes: [
    "Source has two paper revisions with structural differences (docs/paper-forms/smoke-ventilation.md). This definition follows the blank master (Revision A): one Control Panel No. / Location, a single 10-row Fan Schedule. The Hokuden revision's 3 separate zone panels (8 rows each) and free-text (not oval) AC/DC power-supply fields are not modeled.",
    "The Fan Schedule's Auto/Manual ovals carry no page-local legend of their own. This definition treats them as two independent V7 four-state results under the page's general Good/Poor legend, consistent with every other checklist item on this form. Confirm with the client if Auto/Manual instead denote a fixed operating-mode selection rather than a pass/fail judgement."
  ],
  sections: [
    {
      key: "panel_identity",
      title: "Smoke Ventilation Control Panel",
      sortOrder: 1,
      blocks: [{
        key: "panel_identity_fields",
        title: "Control Panel",
        type: "checklist",
        sortOrder: 1,
        items: [
          v7TextField("control_panel_no", "Smoke Ventilation Control Panel No.", 1),
          v7TextField("location", "Location", 2),
          v7TextField("date_tested", "Date Tested", 3)
        ]
      }]
    },
    {
      key: "fan_schedule",
      title: "Fan Schedule",
      sortOrder: 2,
      blocks: [
        {
          key: "fan_schedule_rows",
          title: "Fan Schedule Rows",
          type: "repeatable_table",
          sortOrder: 1,
          supportsZones: false,
          supportsLocations: true,
          columns: [
            v7TextField("asset_reference", "No.", 1),
            v7GoodPoor("auto", "Auto", 2),
            v7GoodPoor("manual", "Manual", 3),
            { ...v7TextField("remarks", "Remarks", 4), control: "remarks" }
          ]
        },
        v7Comments(2)
      ]
    },
    {
      key: "power_supply",
      title: "Power Supply",
      sortOrder: 3,
      blocks: [{
        key: "power_supply_checks",
        title: "Power Supply",
        type: "checklist",
        sortOrder: 1,
        items: [
          v7GoodPoor("main_power_supply_ac", "Main Power Supply (AC)", 1),
          v7GoodPoor("secondary_essential_supply_dc", "Secondary Essential Supply (DC)", 2)
        ]
      }]
    },
    {
      key: "charger_batteries",
      title: "Charger & Batteries",
      sortOrder: 4,
      blocks: [{
        key: "charger_battery_checks",
        title: "Charger & Batteries",
        type: "checklist",
        sortOrder: 1,
        items: [
          v7GoodPoor("cb_battery", "Battery", 1),
          v7GoodPoor("cb_charger", "Charger", 2)
        ]
      }]
    },
    {
      key: "main_function_key",
      title: "Main Function Key",
      sortOrder: 5,
      blocks: [
        {
          key: "function_checks",
          title: "Main Function Key",
          type: "checklist",
          sortOrder: 1,
          items: [
            v7GoodPoor("mfk_main_alarm_reset", "Main Alarm Reset", 1),
            v7GoodPoor("mfk_lamp_test", "Lamp Test", 2),
            v7GoodPoor("mfk_evacuate", "Evacuate", 3),
            v7GoodPoor("mfk_signal_alarm_to_mfap", "Signal Alarm to MFAP", 4)
          ]
        },
        v7Comments(2)
      ]
    }
  ]
};

/**
 * The first multi-system shared-evidence template. Fire Alarm is structurally
 * retains its independent detector-state control; Good/Poor fields use the
 * four-state Hokuden checklist legend.
 */
export const masterServiceReportV7 = {
  ...masterServiceReportV6,
  id: "00000000-0000-4000-8000-000000000807",
  version: 7,
  systems: [
    ...masterServiceReportV6.systems.map((system) =>
      system.key === "co2_fire_extinguisher" || system.key === "wet_chemical" || system.key === "fire_alarm_detector" || system.key === "hydrant"
        ? upgradeV7EvidenceSystem(system)
        : system.key === "hose_reel"
          ? upgradeV7HoseReel(system)
        : system.key === "automatic_sprinkler"
          ? upgradeV7AutomaticSprinkler(system)
        : system.key === "dry_wet_riser"
          ? upgradeV7DryWetRiser(system)
        : system
    ),
    smokeVentilation
  ]
} as const satisfies MasterServiceReportDefinition;
