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
  evidencePolicy?: EvidencePolicySnapshot;
  systemConfiguration?: { riserMode: "dry" | "wet" };
};

export type EvidencePolicyPoint = {
  allowed: boolean;
  required: boolean;
  maxCount: number;
};

export type EvidencePolicySnapshot = {
  id: string;
  code: string;
  version: number;
  schemaVersion: number;
  definition: {
    schemaVersion: number;
    code: string;
    version: number;
    systemKey: string;
    points: Record<string, EvidencePolicyPoint>;
  };
  definitionSha256: string;
};

export type JobConfigurationSnapshot = {
  schemaVersion: 1;
  customer: { id: string; code: string; displayName: string };
  site?: { id: string; displayName: string };
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
  serviceDate: string | null;
  site: { id: string; displayName: string } | null;
  configurationSnapshot: JobConfigurationSnapshot;
  completion?: JobCompletion;
};

export type JobCompletionUnit = {
  authorityKey: string;
  label: string;
  status: "accepted" | "incomplete";
  reason?: "ACCEPTED_INSPECTION_MISSING" | "EVIDENCE_PENDING" | "EVIDENCE_INVALID" | "CONFIGURATION_INVALID" | "SYSTEM_NOT_SUPPORTED";
};

export type JobCompletion = {
  jobId: string;
  jobStatus: "open" | "closed";
  eligible: boolean;
  checkedAt: string;
  requiredUnitCount: number;
  acceptedUnitCount: number;
  completedAt: string | null;
  completedBy: { id: number; username: string } | null;
  systems: Array<{
    systemKey: string;
    systemLabel: string;
    status: "accepted" | "incomplete";
    units: JobCompletionUnit[];
  }>;
};
