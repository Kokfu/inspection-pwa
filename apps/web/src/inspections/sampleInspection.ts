export type InspectionResponseType = "status" | "number" | "text";

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
