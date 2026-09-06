import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import { masterServiceReportV2 } from "./masterServiceReportV2.js";
import { masterServiceReportV3 } from "./masterServiceReportV3.js";
import { masterServiceReportV4 } from "./masterServiceReportV4.js";
import { masterServiceReportV5 } from "./masterServiceReportV5.js";
import { masterServiceReportV6 } from "./masterServiceReportV6.js";
import { masterServiceReportV7 } from "./masterServiceReportV7.js";
import type { MasterServiceReportDefinition } from "./templateTypes.js";

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
  "fire_intercom"
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
  fire_intercom: 7
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
  }))
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
