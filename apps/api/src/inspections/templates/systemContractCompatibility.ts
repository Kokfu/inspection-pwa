import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV2 } from "./masterServiceReportV2.js";
import { masterServiceReportV3 } from "./masterServiceReportV3.js";
import { masterServiceReportV4 } from "./masterServiceReportV4.js";
import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import { masterServiceReportV7 } from "./masterServiceReportV7.js";
import type { FieldDefinition, MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";

export const implementedSystemKeys = [
  "automatic_sprinkler",
  "dry_wet_riser",
  "hose_reel",
  "fire_alarm_detector",
  "hydrant",
  "co2_fire_extinguisher",
  "wet_chemical",
  "portable_fire_extinguisher",
  "smoke_ventilation",
  "fire_intercom",
  "fm200_fire_suppression",
  "fire_rated_roller_shutter"
] as const;

export type ImplementedSystemKey = typeof implementedSystemKeys[number];

// Smoke Ventilation and Fire Intercom have no confirmed definition before V7 -
// there is no legacy template version to point at, so their "legacy" version is
// 7 itself.
// This is a deliberate self-reference, not a typo: it gives the system
// exactly one contract variant (computed below from `masterServiceReportV7`)
// instead of the two variants (legacy + V7) every STEP 1 system gets.
const legacyContractTemplateVersion: Readonly<Record<ImplementedSystemKey, number>> = {
  automatic_sprinkler: 1,
  dry_wet_riser: 2,
  hose_reel: 1,
  fire_alarm_detector: 3,
  hydrant: 1,
  co2_fire_extinguisher: 1,
  wet_chemical: 4,
  portable_fire_extinguisher: 5,
  smoke_ventilation: 7,
  fire_intercom: 7,
  // FM200 is a fully independent V7-only system (own key, own records/evidence/
  // sync), cloned from CO2's data-entry structure but with no legacy pre-V7
  // contract of its own - same self-reference treatment as Smoke Ventilation /
  // Fire Intercom above, not CO2's own `co2_fire_extinguisher: 1` entry.
  fm200_fire_suppression: 7,
  fire_rated_roller_shutter: 7
};

const templates = new Map<number, MasterServiceReportDefinition>([
  [1, masterServiceReportV1],
  [2, masterServiceReportV2],
  [3, masterServiceReportV3],
  [4, masterServiceReportV4],
  [5, masterServiceReportV5],
  [6, masterServiceReportV6],
  [7, masterServiceReportV7]
]);

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // PostgreSQL JSONB cannot retain JavaScript undefined properties. Normalize
    // the in-memory catalog to that persisted representation before comparing
    // an immutable definition restored from JSONB.
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Catalog placement may move when a later template adds systems. It is not a
// runtime control contract; nested sortOrder values remain part of the exact
// form definition and are intentionally retained.
function runtimeContract(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { sortOrder: _catalogPlacement, ...contract } = value as Record<string, unknown>;
  return contract;
}

export type SystemContractVariant = {
  masterTemplateId: string;
  masterTemplateVersion: number;
  systemKey: ImplementedSystemKey;
  contract: string;
};

/**
 * Frozen historical reconstruction of the V7 `fire_alarm_detector` contract as
 * it existed between the shared-evidence foundation landing (`5bc968d`) and the
 * Normal/Test/Isolation multi-select + four-state refinement (`0e04a64`,
 * 2026-09-03), which mutated fields under the SAME masterTemplateId/version
 * (807/7) in place instead of minting a new template identity. A record
 * accepted in that window (e.g. `fire_alarm_detector` jobs frozen before
 * 2026-09-03 20:38 +08) is frozen to this exact shape forever
 * (`.agents/skills/v7-evidence-acceptance/SKILL.md`: "A frozen inspection is
 * interpreted only by the exact template/contract it was frozen against") and
 * must remain interpretable by the Final Report / dashboard reader
 * (`resolveFireAlarmV6Controls` in `fireAlarmDefinitionControls.ts`), which
 * re-validates the frozen contract on every read.
 *
 * Never edit this: it mirrors the pre-`0e04a64` `v7ResultValues` /
 * `upgradeV7EvidenceSystem` from `masterServiceReportV7.ts` at that commit,
 * applied to the still-frozen V6 source (`masterServiceReportV6.ts` has not
 * changed since it was written). `co2_fire_extinguisher` / `wet_chemical` need
 * no equivalent entry: their Final Report/dashboard rendering flattens the
 * response generically and never re-validates the frozen definition's exact
 * contract shape, so the same-day refinement never made their older accepted
 * records unreadable the way it did Fire Alarm's.
 */
const preMultiselectV7ResultValues = ["good", "poor", "not_relevant"] as const;
function preMultiselectUpgradeV7EvidenceSystem(system: SystemDefinition): SystemDefinition {
  return {
    ...system,
    sections: system.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => block.type !== "checklist" ? block : {
        ...block,
        items: block.items.map((field: FieldDefinition) => field.control === "good_poor"
          ? { ...field, allowedValues: preMultiselectV7ResultValues }
          : field)
      })
    }))
  };
}
const preMultiselectFireAlarmV7System = preMultiselectUpgradeV7EvidenceSystem(
  masterServiceReportV6.systems.find((system) => system.key === "fire_alarm_detector")!
);

/** Immutable registry indexed by frozen master identity.  The same system key
 * can intentionally resolve to a different parser in a later template. */
export const systemContractVariants: readonly SystemContractVariant[] = [
  ...implementedSystemKeys.map((systemKey) => {
    const version = legacyContractTemplateVersion[systemKey];
    const template = templates.get(version)!;
    const system = template.systems.find((candidate) => candidate.key === systemKey);
    if (!system || system.definitionStatus !== "confirmed") throw new Error(`Missing authoritative ${systemKey} runtime contract`);
    return { masterTemplateId: template.id, masterTemplateVersion: version, systemKey, contract: canonicalize(runtimeContract(system)) };
  }),
  {
    masterTemplateId: masterServiceReportV6.id,
    masterTemplateVersion: 6,
    systemKey: "fire_alarm_detector",
    contract: canonicalize(runtimeContract(masterServiceReportV6.systems.find((system) => system.key === "fire_alarm_detector")!))
  },
  ...(["co2_fire_extinguisher", "wet_chemical", "fire_alarm_detector", "hydrant", "hose_reel", "automatic_sprinkler", "dry_wet_riser"] as const).map((systemKey) => ({
    masterTemplateId: masterServiceReportV7.id,
    masterTemplateVersion: 7,
    systemKey,
    contract: canonicalize(runtimeContract(masterServiceReportV7.systems.find((system) => system.key === systemKey)!))
  })),
  {
    masterTemplateId: masterServiceReportV7.id,
    masterTemplateVersion: 7,
    systemKey: "fire_alarm_detector",
    contract: canonicalize(runtimeContract(preMultiselectFireAlarmV7System))
  }
];

export function isImplementedSystemKey(value: string): value is ImplementedSystemKey {
  return (implementedSystemKeys as readonly string[]).includes(value);
}

/**
 * Compatibility belongs to the immutable system definition, not to the
 * enclosing report-template version. Exact identity includes the system key,
 * definitionStatus, configuration flags, labels, controls and source wording.
 */
export function isCompatibleSystemContract(
  systemKey: ImplementedSystemKey,
  definitionStatus: unknown,
  definition: unknown,
  frozenMasterTemplate?: { id: string; version: number }
): boolean {
  if (definitionStatus !== "confirmed" || !definition || typeof definition !== "object") return false;
  const variants = systemContractVariants.filter((variant) => variant.systemKey === systemKey
    && (!frozenMasterTemplate || (variant.masterTemplateId === frozenMasterTemplate.id && variant.masterTemplateVersion === frozenMasterTemplate.version)));
  const candidate = canonicalize(runtimeContract({ ...(definition as Record<string, unknown>), definitionStatus }));
  return variants.some((variant) => variant.contract === candidate);
}

export function systemContractVersion(systemKey: ImplementedSystemKey, frozenMasterTemplateVersion?: number) {
  return frozenMasterTemplateVersion ?? legacyContractTemplateVersion[systemKey];
}
