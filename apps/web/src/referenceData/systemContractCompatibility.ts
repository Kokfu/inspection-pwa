import type { InspectionCatalog, CatalogSystem, CatalogTemplate } from "./referenceDataTypes";

export const implementedSystemKeys = [
  "automatic_sprinkler", "dry_wet_riser", "hose_reel", "fire_alarm_detector",
  "hydrant", "co2_fire_extinguisher", "wet_chemical", "portable_fire_extinguisher"
] as const;
export type ImplementedSystemKey = typeof implementedSystemKeys[number];

const contractVersions: Readonly<Record<ImplementedSystemKey, number>> = {
  automatic_sprinkler: 1, dry_wet_riser: 2, hose_reel: 1, fire_alarm_detector: 3,
  hydrant: 1, co2_fire_extinguisher: 1, wet_chemical: 4, portable_fire_extinguisher: 5
};

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
): { template: CatalogTemplate; system: CatalogSystem } | undefined {
  const template = templateForJob(catalog, templateIdentity);
  const contractTemplate = catalog.templates.find((candidate) => candidate.code === "MFE-FSSR"
    && candidate.version === contractVersions[systemKey]);
  const system = template?.systems.find((candidate) => candidate.key === systemKey);
  const contract = contractTemplate?.systems.find((candidate) => candidate.key === systemKey);
  if (!template || template.code !== "MFE-FSSR" || !system || !contract
    || system.definitionStatus !== "confirmed" || contract.definitionStatus !== "confirmed"
    || canonicalize(runtimeContract(system.definition)) !== canonicalize(runtimeContract(contract.definition))) return undefined;
  return { template, system };
}
