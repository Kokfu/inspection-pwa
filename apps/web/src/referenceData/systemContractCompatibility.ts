import type { InspectionCatalog, CatalogSystem, CatalogTemplate } from "./referenceDataTypes";

export const implementedSystemKeys = [
  "automatic_sprinkler", "dry_wet_riser", "hose_reel", "fire_alarm_detector",
  "hydrant", "co2_fire_extinguisher", "wet_chemical", "portable_fire_extinguisher"
] as const;
export type ImplementedSystemKey = typeof implementedSystemKeys[number];
/** Every non-Fire-Alarm system that owns the shared V7 evidence contract.
 * Future rollout systems add one key here rather than another version branch. */
export const v7SharedEvidenceSystemKeys = ["co2_fire_extinguisher", "wet_chemical", "hydrant"] as const;

const contractVersions: Readonly<Record<ImplementedSystemKey, number>> = {
  automatic_sprinkler: 1, dry_wet_riser: 2, hose_reel: 1, fire_alarm_detector: 3,
  hydrant: 1, co2_fire_extinguisher: 1, wet_chemical: 4, portable_fire_extinguisher: 5
};

export type FireAlarmClientDispatch = "historical" | "v6" | "v7";
type FrozenTemplateIdentity = { id: string; code: string; version: number };
export type FireAlarmAcceptedDetailTuple = FrozenTemplateIdentity & {
  responseSchemaVersion: number;
  snapshotSchemaVersion: number;
  systemContractSha256: string | null;
};

// These are the immutable published MFE-FSSR identities.  Versions 4 and 5
// retain V3's Fire Alarm definition; only V6 owns the evidence-first protocol.
const fireAlarmClientDispatches: readonly (FireAlarmAcceptedDetailTuple & { dispatch: FireAlarmClientDispatch })[] = [
  { id: "00000000-0000-4000-8000-000000000803", code: "MFE-FSSR", version: 3, dispatch: "historical", responseSchemaVersion: 1, snapshotSchemaVersion: 1, systemContractSha256: null },
  { id: "00000000-0000-4000-8000-000000000804", code: "MFE-FSSR", version: 4, dispatch: "historical", responseSchemaVersion: 1, snapshotSchemaVersion: 1, systemContractSha256: null },
  { id: "00000000-0000-4000-8000-000000000805", code: "MFE-FSSR", version: 5, dispatch: "historical", responseSchemaVersion: 1, snapshotSchemaVersion: 1, systemContractSha256: null },
  { id: "00000000-0000-4000-8000-000000000806", code: "MFE-FSSR", version: 6, dispatch: "v6", responseSchemaVersion: 2, snapshotSchemaVersion: 2, systemContractSha256: "deec720d8b9bebd4cca552748bfda24a5e4d99f5c13f22c0eee7e50f5cc8755d" }
  ,{ id: "00000000-0000-4000-8000-000000000807", code: "MFE-FSSR", version: 7, dispatch: "v7", responseSchemaVersion: 2, snapshotSchemaVersion: 2, systemContractSha256: "3dafe01f42efd7d9ca8adfdfd288356d212406c38e82ad33c21bcd327a29e3b0" }
];

export function fireAlarmClientDispatch(templateIdentity: FrozenTemplateIdentity): FireAlarmClientDispatch | undefined {
  return fireAlarmClientDispatches.find((candidate) => candidate.id === templateIdentity.id
    && candidate.code === templateIdentity.code && candidate.version === templateIdentity.version)?.dispatch;
}

export function fireAlarmAcceptedDetailDispatch(tuple: FireAlarmAcceptedDetailTuple): FireAlarmClientDispatch | undefined {
  return fireAlarmClientDispatches.find((candidate) => candidate.id === tuple.id
    && candidate.code === tuple.code && candidate.version === tuple.version
    && candidate.responseSchemaVersion === tuple.responseSchemaVersion
    && candidate.snapshotSchemaVersion === tuple.snapshotSchemaVersion
    && candidate.systemContractSha256 === tuple.systemContractSha256)?.dispatch;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function runtimeContract(value: Record<string, unknown>) {
  const { sortOrder: _catalogPlacement, ...contract } = value;
  return contract;
}

function templateForJob(catalog: InspectionCatalog, templateIdentity: { id: string; code: string; version: number }) {
  return catalog.templates.find((template) => template.id === templateIdentity.id
    && template.code === templateIdentity.code && template.version === templateIdentity.version);
}

export function compatibleCatalogSystem(
  catalog: InspectionCatalog,
  templateIdentity: { id: string; code: string; version: number },
  systemKey: ImplementedSystemKey
): { template: CatalogTemplate; system: CatalogSystem; fireAlarmDispatch?: FireAlarmClientDispatch } | undefined {
  const template = templateForJob(catalog, templateIdentity);
  const fireAlarmDispatch = systemKey === "fire_alarm_detector" ? fireAlarmClientDispatch(templateIdentity) : undefined;
  // V7 owns its own CO2 / Wet Chemical contract.  The contract version is chosen
  // from the job's frozen identity rather than scanned for: the catalog is ordered
  // by version, so a bare `find` over `version === contractVersions[key] || version === 7`
  // always returns the older row and compares a V7 definition against a V1/V4 contract.
  const contractVersion = templateIdentity.version === 7
    && v7SharedEvidenceSystemKeys.includes(systemKey as typeof v7SharedEvidenceSystemKeys[number])
    ? 7
    : contractVersions[systemKey];
  const contractTemplate = catalog.templates.find((candidate) => candidate.code === "MFE-FSSR"
    && (systemKey === "fire_alarm_detector"
      ? candidate.id === templateIdentity.id && candidate.version === templateIdentity.version && fireAlarmDispatch !== undefined
      : candidate.version === contractVersion));
  const system = template?.systems.find((candidate) => candidate.key === systemKey);
  const contract = contractTemplate?.systems.find((candidate) => candidate.key === systemKey);
  if (!template || template.code !== "MFE-FSSR" || !system || !contract
    || system.definitionStatus !== "confirmed" || contract.definitionStatus !== "confirmed"
    || canonicalize(runtimeContract(system.definition)) !== canonicalize(runtimeContract(contract.definition))) return undefined;
  return { template, system, ...(fireAlarmDispatch ? { fireAlarmDispatch } : {}) };
}
