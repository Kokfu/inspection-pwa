export type CatalogSystem = {
  key: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: "confirmed" | "requires_confirmation";
  definition: Record<string, unknown>;
  resolvedRuntimeControls?: unknown;
};

export type CatalogTemplate = {
  id: string;
  code: string;
  name: string;
  version: number;
  selectionPolicy: "preset_only";
  headerDefinition: Record<string, unknown>;
  reportBoilerplate: Record<string, unknown>;
  systems: CatalogSystem[];
};

export type InspectionCatalog = {
  // `template` remains the V1 default for legacy V1 systems.
  template: CatalogTemplate;
  templates: CatalogTemplate[];
};

export type InspectionCatalogInput = InspectionCatalog | CatalogTemplate;

export function defaultCatalogTemplate(catalog: InspectionCatalogInput): CatalogTemplate {
  return "template" in catalog ? catalog.template : catalog;
}

type UnknownRecord = Record<string, unknown>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function exactKeys(value: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function parseCatalogSystem(value: unknown): CatalogSystem | undefined {
  if (!record(value)) return undefined;
  const baseKeys = ["key", "displayName", "sortOrder", "definitionStatus", "definition"];
  const keys = Object.keys(value);
  if (
    !keys.every((key) => baseKeys.includes(key) || key === "resolvedRuntimeControls")
    || !baseKeys.every((key) => key in value)
    || !nonEmptyText(value.key)
    || !nonEmptyText(value.displayName)
    || !positiveInteger(value.sortOrder)
    || (value.definitionStatus !== "confirmed" && value.definitionStatus !== "requires_confirmation")
    || !record(value.definition)
  ) {
    return undefined;
  }
  return {
    key: value.key,
    displayName: value.displayName,
    sortOrder: value.sortOrder,
    definitionStatus: value.definitionStatus,
    definition: value.definition,
    ...("resolvedRuntimeControls" in value
      ? { resolvedRuntimeControls: value.resolvedRuntimeControls }
      : {})
  };
}

function parseCatalogTemplate(value: unknown): CatalogTemplate | undefined {
  if (
    !record(value)
    || !exactKeys(value, [
      "id",
      "code",
      "name",
      "version",
      "selectionPolicy",
      "headerDefinition",
      "reportBoilerplate",
      "systems"
    ])
    || !nonEmptyText(value.id)
    || !uuidPattern.test(value.id)
    || !nonEmptyText(value.code)
    || !nonEmptyText(value.name)
    || !positiveInteger(value.version)
    || value.selectionPolicy !== "preset_only"
    || !record(value.headerDefinition)
    || !record(value.reportBoilerplate)
    || !Array.isArray(value.systems)
  ) {
    return undefined;
  }

  const systems = value.systems.map(parseCatalogSystem);
  if (systems.some((system): system is undefined => system === undefined)) return undefined;
  const parsedSystems = systems.filter((system): system is CatalogSystem => system !== undefined);
  if (
    new Set(parsedSystems.map((system) => system.key)).size !== parsedSystems.length
    || new Set(parsedSystems.map((system) => system.sortOrder)).size !== parsedSystems.length
  ) {
    return undefined;
  }

  return {
    id: value.id,
    code: value.code,
    name: value.name,
    version: value.version,
    selectionPolicy: "preset_only",
    headerDefinition: value.headerDefinition,
    reportBoilerplate: value.reportBoilerplate,
    systems: parsedSystems
  };
}

export function parseInspectionCatalog(
  value: unknown,
  options: { allowLegacyV1Only?: boolean } = {}
): InspectionCatalog | undefined {
  if (!record(value) || !("template" in value)) return undefined;
  const template = parseCatalogTemplate(value.template);
  if (!template || template.version !== 1) return undefined;

  if (!("templates" in value)) {
    return options.allowLegacyV1Only && exactKeys(value, ["template"])
      ? { template, templates: [template] }
      : undefined;
  }
  if (!exactKeys(value, ["template", "templates"]) || !Array.isArray(value.templates)) {
    return undefined;
  }

  const templates = value.templates.map(parseCatalogTemplate);
  if (templates.some((candidate): candidate is undefined => candidate === undefined)) return undefined;
  const parsedTemplates = templates.filter(
    (candidate): candidate is CatalogTemplate => candidate !== undefined
  );
  const identity = (candidate: CatalogTemplate) => `${candidate.code}:${candidate.version}`;
  if (
    parsedTemplates.length === 0
    || new Set(parsedTemplates.map((candidate) => candidate.id)).size !== parsedTemplates.length
    || new Set(parsedTemplates.map(identity)).size !== parsedTemplates.length
    || parsedTemplates.some((candidate) => candidate.code !== template.code)
    || !parsedTemplates.some((candidate) =>
      candidate.id === template.id
      && candidate.code === template.code
      && candidate.version === template.version)
  ) {
    return undefined;
  }
  return { template, templates: parsedTemplates };
}

export type ReferenceCustomer = {
  id: string;
  code: string;
  displayName: string;
  isDemo: boolean;
};

export type ReferenceSite = {
  id: string;
  customerId: string;
  code: string;
  displayName: string;
};

export type CustomerSystemZone = {
  id: string;
  enabledSystemId: string;
  key: string;
  displayName: string;
  sortOrder: number;
};

export type CustomerSystemLocation = {
  id: string;
  enabledSystemId: string;
  zoneId: string | null;
  key: string;
  displayName: string;
  presetRowCount: number;
  rowPreset: unknown;
  sortOrder: number;
};

export type CustomerConfiguration = {
  configurationId: string;
  revision: number;
  templateId: string;
  templateCode: string;
  templateName: string;
  templateVersion: number;
  selectionPolicy: "preset_only";
  enabledSystems: Array<{
    id: string;
    key: string;
    displayName: string;
    sortOrder: number;
    definitionStatus: "confirmed";
    evidencePolicy?: import("../jobs/jobTypes").EvidencePolicySnapshot;
    systemConfiguration?: { riserMode: "dry" | "wet" };
    zones: CustomerSystemZone[];
    locations: CustomerSystemLocation[];
  }>;
};

export type CustomerConfigurationResponse = {
  customer: ReferenceCustomer;
  configuration: CustomerConfiguration;
};
