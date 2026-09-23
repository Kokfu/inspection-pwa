import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import { suppressionPanelSystem } from "./masterServiceReportV1.js";
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
 * The Fan Schedule's "No." rows (1-10 on the paper page) are fixed asset
 * identities, not customer-varying physical locations, but this template
 * reuses the same `repeatable_table` + `customer_system_locations` machinery
 * Hydrant/Hose Reel/Riser already use (`supportsLocations: true`, no zone
 * dimension - `customer_system_locations.zone_id` is already nullable) rather
 * than inventing a new "fixed row count, no location" mechanism.
 *
 * Row supply behaves exactly like Hydrant/Hose Reel/Riser and is NOT enforced
 * by this template: configured preset rows are carried onto the form and must
 * be retained when a customer has them, and a technician may add further rows;
 * a customer configured with no locations simply starts with an empty table
 * that the technician fills. Pre-seeding every customer with the paper page's
 * ten rows is a Manager-configuration concern (STEP 3.1 / Phase 8H), not a
 * guarantee this definition makes - do not read `1-10` here as an invariant.
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
 * STEP 2.3: Fire Intercom, like Smoke Ventilation, has no V1-V6 presence at
 * all - there is no earlier confirmed definition to upgrade, so this system is
 * composed fresh rather than derived from `masterServiceReportV6.systems`, and
 * carries the four-state result model natively (no `fourState`/`upgradeV7*`
 * rewrite is needed because there is no legacy shape to preserve).
 *
 * Source: `docs/paper-forms/fire-intercom.md` (SERVICE REPORT SAMPLE.pdf p.10,
 * blank master; no Revision-B example exists). Structurally this is the
 * simplest system on the form: one grid of station rows, one result per row,
 * one Comments area for the whole page, and no header fields at all.
 *
 * The station rows are pre-printed identities (`9`...`1`, `Grd Floor`,
 * `Basement`, `Genset`, `Pump Room`, plus one blank write-in row), not
 * customer-varying physical locations, but this template reuses the same
 * `repeatable_table` + `customer_system_locations` machinery Hydrant / Hose
 * Reel / Riser / Smoke Ventilation already use (`supportsLocations: true`, no
 * zone dimension - `customer_system_locations.zone_id` is already nullable)
 * rather than inventing a new "fixed row count, no location" mechanism.
 */
const fireIntercom: SystemDefinition = {
  key: "fire_intercom",
  displayName: "Fire Intercom System",
  sortOrder: 11,
  definitionStatus: "confirmed",
  configuration: { supportsZones: false, supportsLocations: true, supportsPresetRows: true },
  confirmationNotes: [
    "The paper grid marks each station row with unlabelled `1` / `2` boxes under a `Condition Yes` and a `Condition No` column group; page 10 carries no legend at all, so what `1` and `2` mean is not printed anywhere (docs/paper-forms/fire-intercom.md). Per the 2026-09-04 owner decision that box grid is collapsed to ONE V7 four-state result plus that row's own remark, under the same Hokuden legend every other system on this form uses. The original four-box structure is deliberately not modelled.",
    "The pre-printed station labels (`9`...`1`, `Grd Floor`, `Basement`, `Genset`, `Pump Room`, and one blank write-in row) are carried as preset configured rows, which is a Manager-configuration concern (STEP 3.1 / Phase 8H) rather than a template one. This definition guarantees no particular rows: a customer configured with none starts with an empty table, and technician write-in rows are always allowed.",
    "The page has no header fields whatsoever - no Date Tested, no panel or control number, no location line. None were invented. The single `Comments :` area spans the whole grid height, so it is modelled as one section-level comments block, not a per-row note.",
    "The per-row `remarks` column has NO source on this paper page (which prints no Remarks column at all, unlike the Smoke Ventilation Fan Schedule). It is present because it is part of the frozen shared repeatable-row envelope every C3 service carries (`.agents/skills/repeatable-row-model/SKILL.md`: `remarks` is the row's general note), and because the task brief specified this column. It is therefore a shared-model field, not a reading of this page, and it is distinct from the field-owned per-finding remark the V7 evidence contract requires. If the client would rather this page carry no per-row note, dropping the column is safe while Fire Intercom has no accepted data - but it would make Fire Intercom the only C3 service that deviates from the shared envelope."
  ],
  sections: [
    {
      key: "station_schedule",
      title: "Station Schedule",
      sortOrder: 1,
      blocks: [
        {
          key: "station_schedule_rows",
          title: "Station Schedule Rows",
          type: "repeatable_table",
          sortOrder: 1,
          supportsZones: false,
          supportsLocations: true,
          columns: [
            v7TextField("asset_reference", "Station", 1),
            v7GoodPoor("condition", "Condition", 2),
            { ...v7TextField("remarks", "Remarks", 3), control: "remarks" }
          ]
        },
        v7Comments(2)
      ]
    }
  ]
};

/**
 * STEP 2.4: FM200 has no V1-V6 presence at all (the `fm200` placeholder key in
 * `masterServiceReportV1.ts` is `definitionStatus: "requires_confirmation"`
 * and deliberately left unimplemented - a DIFFERENT, still-unconfirmed system
 * key from this one). Like Smoke Ventilation / Fire Intercom above, FM200 is
 * therefore composed fresh rather than derived from `masterServiceReportV6.systems`,
 * and is V7-only from the start.
 *
 * Unlike Smoke Ventilation / Fire Intercom, FM200's data-entry structure is not
 * a fresh reading of a paper form - it is confirmed to be IDENTICAL to CO2's
 * (`suppressionPanelSystem("co2_fire_extinguisher", ...)`), so it reuses that
 * factory directly rather than being hand-built. Only the top-level
 * `displayName` differs ("FM200 System"); every internal section/field label
 * stays worded exactly as CO2's (e.g. "CO2 Control Panel", "CO2 Cylinder") per
 * the confirmed label-scope decision. `upgradeV7EvidenceSystem` is applied
 * explicitly (rather than inherited from a V6 source, since there is none) to
 * carry the same four-state V7 result model CO2's own V7 entry gets.
 */
const fm200FireSuppression: SystemDefinition = upgradeV7EvidenceSystem(
  suppressionPanelSystem("fm200_fire_suppression", "FM200 System", 12)
);

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
    smokeVentilation,
    fireIntercom,
    fm200FireSuppression
  ]
} as const satisfies MasterServiceReportDefinition;
