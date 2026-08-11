import { masterServiceReportV3 } from "./masterServiceReportV3.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import type { MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";

// V3 was already published with Wet Chemical unavailable.  V4 is therefore
// forward-only: it publishes the exact V1 source definition without rewriting
// historical catalog data.
const { confirmationNotes: _sourcePresentationQuestions, ...wetChemicalSource } =
  masterServiceReportV1.systems.find((system) => system.key === "wet_chemical")!;

export const wetChemicalV4: SystemDefinition = {
  ...wetChemicalSource,
  definitionStatus: "confirmed"
};

export const masterServiceReportV4 = {
  ...masterServiceReportV3,
  id: "00000000-0000-4000-8000-000000000804",
  version: 4,
  systems: masterServiceReportV3.systems.map((system) =>
    system.key === "wet_chemical" ? wetChemicalV4 : system
  )
} as const satisfies MasterServiceReportDefinition;
