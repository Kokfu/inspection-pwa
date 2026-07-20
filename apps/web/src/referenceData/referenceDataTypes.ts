export type CatalogSystem = {
  key: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: "confirmed" | "requires_confirmation";
  definition: unknown;
};

export type InspectionCatalog = {
  id: string;
  code: string;
  name: string;
  version: number;
  selectionPolicy: "preset_only";
  headerDefinition: unknown;
  reportBoilerplate: unknown;
  systems: CatalogSystem[];
};

export type ReferenceCustomer = {
  id: string;
  code: string;
  displayName: string;
  isDemo: boolean;
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
    zones: CustomerSystemZone[];
    locations: CustomerSystemLocation[];
  }>;
};

export type CustomerConfigurationResponse = {
  customer: ReferenceCustomer;
  configuration: CustomerConfiguration;
};
