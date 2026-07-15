import type { InspectionResponseType, InspectionTemplateSnapshot } from "./inspectionTypes";

export type SampleInspectionItem = {
  id: string;
  label: string;
  responseType: InspectionResponseType;
  required: boolean;
};

export const sampleInspectionJob = {
  id: "00000000-0000-4000-8000-000000000410",
  reference: "SAMPLE-JOB-001",
  title: "Sample Inspection Job"
};

export const sampleInspectionTemplate = {
  id: "00000000-0000-4000-8000-000000000401",
  version: 1,
  name: "Sample Inspection Template",
  section: "Sample Inspection Section",
  items: [
    { id: "00000000-0000-4000-8000-000000000403", label: "General condition", responseType: "status", required: true },
    { id: "00000000-0000-4000-8000-000000000404", label: "Sample measurement", responseType: "number", required: true },
    { id: "00000000-0000-4000-8000-000000000405", label: "Safety check", responseType: "status", required: true },
    { id: "00000000-0000-4000-8000-000000000406", label: "Additional observation", responseType: "text", required: false }
  ] satisfies SampleInspectionItem[]
};

export const sampleInspectionTemplateSnapshot: InspectionTemplateSnapshot = {
  templateId: sampleInspectionTemplate.id,
  templateVersion: sampleInspectionTemplate.version,
  templateName: sampleInspectionTemplate.name,
  sections: [{
    sectionId: "00000000-0000-4000-8000-000000000402",
    sectionName: sampleInspectionTemplate.section,
    sortOrder: 1,
    items: sampleInspectionTemplate.items.map((item, index) => ({
      itemId: item.id,
      label: item.label,
      responseType: item.responseType,
      required: item.required,
      sortOrder: index + 1,
      options: item.responseType === "status" ? ["pass", "fail", "not_applicable"] : []
    }))
  }]
};
