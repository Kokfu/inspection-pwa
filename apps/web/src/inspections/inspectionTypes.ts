import type { InspectionResponseType, SampleInspectionItem } from "./sampleInspection";

export type InspectionFormValues = {
  title: string;
  locationNotes: string;
  performedAt: string;
  responses: Record<string, { value: string; remarks: string }>;
};

export type InspectionResponse = {
  templateItemId: string;
  label: string;
  responseType: InspectionResponseType;
  value: string;
  remarks: string;
  sortOrder: number;
};

export type InspectionTemplateSnapshot = {
  name: string;
  version: number;
  section: string;
  items: SampleInspectionItem[];
};
