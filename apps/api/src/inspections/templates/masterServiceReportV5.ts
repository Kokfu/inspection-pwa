import { masterServiceReportV4 } from "./masterServiceReportV4.js";
import { masterServiceReportV1 } from "./masterServiceReportV1.js";
import type { MasterServiceReportDefinition, SystemDefinition } from "./templateTypes.js";

// V4 is published.  Portable Fire Extinguisher therefore becomes available in
// a new immutable catalog version, using the already-confirmed V1 definition.
const { confirmationNotes: _presentationQuestion, ...portableSource } =
  masterServiceReportV1.systems.find((system) => system.key === "portable_fire_extinguisher")!;

export const portableFireExtinguisherV5: SystemDefinition = {
  ...portableSource,
  definitionStatus: "confirmed"
};

export const masterServiceReportV5 = {
  ...masterServiceReportV4,
  id: "00000000-0000-4000-8000-000000000805",
  version: 5,
  systems: masterServiceReportV4.systems.map((system) =>
    system.key === "portable_fire_extinguisher" ? portableFireExtinguisherV5 : system
  )
} as const satisfies MasterServiceReportDefinition;
