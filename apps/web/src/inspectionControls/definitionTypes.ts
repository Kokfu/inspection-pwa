export type ResultOptionDefinition = {
  value: string;
  label: string;
};

export type ResultControlDefinition = {
  type: "single_select";
  required: boolean;
  options: ResultOptionDefinition[];
};

export type ResolvedRemarksDefinition = {
  policy: "none" | "optional";
  maxLength: number;
};

export type ResolvedChecklistItem = {
  key: string;
  label: string;
  sortOrder: number;
  result: ResultControlDefinition;
  remarks: ResolvedRemarksDefinition;
};

export type ResolvedMeasurementValue = {
  key: string;
  label: string;
  unit: string;
  required: boolean;
};

export type ResolvedMeasurementRow = {
  key: string;
  label: string;
  sortOrder: number;
  values: ResolvedMeasurementValue[];
  result: ResultControlDefinition;
  remarks: ResolvedRemarksDefinition;
};

export type ResolvedRepeatableResultColumn = {
  key: string;
  label: string;
  sortOrder: number;
  result: ResultControlDefinition;
};

export type ResolvedHoseReelControls = {
  schemaVersion: 1;
  source: {
    templateCode: "MFE-FSSR";
    templateVersion: 1;
    systemKey: "hose_reel";
  };
  checklist: {
    waterTank: ResolvedChecklistItem[];
    pumpHouse: ResolvedChecklistItem[];
  };
  measurements: ResolvedMeasurementRow[];
  repeatableRows: {
    resultColumns: ResolvedRepeatableResultColumn[];
    remarks: ResolvedRemarksDefinition;
  };
  comments: ResolvedRemarksDefinition;
};
