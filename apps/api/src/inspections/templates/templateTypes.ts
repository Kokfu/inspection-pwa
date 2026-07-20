export type DefinitionStatus = "confirmed" | "requires_confirmation";

export type FieldControl =
  | "boolean_status"
  | "good_poor"
  | "normal_test_isolation"
  | "text"
  | "number"
  | "measurement"
  | "select"
  | "date"
  | "time"
  | "remarks"
  | "count"
  | "future_signature";

export type RemarksPolicy = "none" | "optional" | "required_when_poor";

export type FieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly control: FieldControl;
  readonly required: boolean;
  readonly sortOrder: number;
  readonly unit?: string;
  readonly allowedValues?: readonly string[];
  readonly remarksPolicy?: RemarksPolicy;
  readonly confirmationNote?: string;
};

export type MeasurementValueDefinition = {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly unit: string;
};

export type MeasurementRowDefinition = {
  readonly key: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly measurements: readonly MeasurementValueDefinition[];
  readonly result: {
    readonly control: "good_poor";
    readonly required: boolean;
    readonly allowedValues: readonly ["good", "poor"];
  };
  readonly remarksPolicy: "optional";
};

type BlockBase = {
  readonly key: string;
  readonly title: string;
  readonly sortOrder: number;
  readonly confirmationNote?: string;
};

export type ChecklistBlock = BlockBase & {
  readonly type: "checklist";
  readonly items: readonly FieldDefinition[];
};

export type MeasurementBlock = BlockBase & {
  readonly type: "measurement";
  readonly items: readonly MeasurementRowDefinition[];
};

export type RepeatableTableBlock = BlockBase & {
  readonly type: "repeatable_table";
  readonly supportsZones: boolean;
  readonly supportsLocations: boolean;
  readonly columns: readonly FieldDefinition[];
};

export type QuantitySummaryBlock = BlockBase & {
  readonly type: "quantity_summary";
  readonly items: readonly FieldDefinition[];
};

export type CommentsBlock = BlockBase & {
  readonly type: "comments";
  readonly field: FieldDefinition;
};

export type TemplateBlock =
  | ChecklistBlock
  | MeasurementBlock
  | RepeatableTableBlock
  | QuantitySummaryBlock
  | CommentsBlock;

export type SystemSectionDefinition = {
  readonly key: string;
  readonly title: string;
  readonly sortOrder: number;
  readonly blocks: readonly TemplateBlock[];
};

export type SystemDefinition = {
  readonly key: string;
  readonly displayName: string;
  readonly sortOrder: number;
  readonly definitionStatus: DefinitionStatus;
  readonly configuration: {
    readonly supportsZones: boolean;
    readonly supportsLocations: boolean;
    readonly supportsPresetRows: boolean;
  };
  readonly sections: readonly SystemSectionDefinition[];
  readonly confirmationNotes?: readonly string[];
};

export type HeaderDefinition = {
  readonly fields: readonly FieldDefinition[];
};

export type MasterServiceReportDefinition = {
  readonly id: string;
  readonly code: "MFE-FSSR";
  readonly name: "MFE Fire System Service Report Template";
  readonly version: 1;
  readonly selectionPolicy: "preset_only";
  readonly header: HeaderDefinition;
  readonly reportBoilerplate: {
    readonly conditions: readonly string[];
    readonly resultLegend: Readonly<Record<string, string>>;
    readonly footerKey: string;
  };
  readonly systems: readonly SystemDefinition[];
};
