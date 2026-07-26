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

export type ResolvedCo2Controls = {
  schemaVersion: 1;
  source: {
    templateCode: "MFE-FSSR";
    templateVersion: 1;
    systemKey: "co2_fire_extinguisher";
  };
  repetitionMode: "per_location";
  controlPanelLocation: {
    key: "control_panel_location";
    label: string;
    required: true;
    maxLength: number;
  };
  detectorRows: {
    minimum: 1;
    maximum: 250;
    alarmZone: { key: "alarm_zone"; label: string; required: true; maxLength: number };
    location: { key: "location"; label: string; required: true; maxLength: number };
    heatDetector: ResolvedRepeatableResultColumn;
    smokeDetector: ResolvedRepeatableResultColumn;
    remarks: ResolvedRemarksDefinition;
  };
  chargerAndBatteries: ResolvedChecklistItem[];
  physicalOutlook: ResolvedChecklistItem[];
  mainFunctionKeys: ResolvedChecklistItem[];
  comments: ResolvedRemarksDefinition;
};
