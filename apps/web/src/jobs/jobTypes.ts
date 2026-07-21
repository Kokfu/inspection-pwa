export type JobZoneSnapshot = {
  id: string;
  enabledSystemId: string;
  key: string;
  displayName: string;
  sortOrder: number;
};

export type JobLocationSnapshot = {
  id: string;
  enabledSystemId: string;
  zoneId: string | null;
  key: string;
  displayName: string;
  presetRowCount: number;
  rowPreset: unknown;
  sortOrder: number;
};

export type JobSystemSnapshot = {
  enabledSystemId: string;
  systemKey: string;
  displayName: string;
  sortOrder: number;
  definitionStatus: "confirmed";
  zones: JobZoneSnapshot[];
  locations: JobLocationSnapshot[];
};

export type JobConfigurationSnapshot = {
  schemaVersion: 1;
  customer: { id: string; code: string; displayName: string };
  configuration: { revisionId: string; revisionNumber: number };
  template: { id: string; code: string; name: string; version: number };
  enabledSystems: JobSystemSnapshot[];
};

export type InspectionJob = {
  id: string;
  reference: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
  configurationSnapshot: JobConfigurationSnapshot;
};
