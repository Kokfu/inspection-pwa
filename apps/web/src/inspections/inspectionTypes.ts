export type InspectionResponseType = "status" | "number" | "text";

export type InspectionTemplateSnapshotItem = {
  itemId: string;
  label: string;
  responseType: InspectionResponseType;
  required: boolean;
  sortOrder: number;
  options: string[];
};

export type InspectionTemplateSnapshotSection = {
  sectionId: string;
  sectionName: string;
  sortOrder: number;
  items: InspectionTemplateSnapshotItem[];
};

export type InspectionTemplateSnapshot = {
  templateId: string;
  templateVersion: number;
  templateName: string;
  sections: InspectionTemplateSnapshotSection[];
};

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

type LegacyInspectionTemplateSnapshot = {
  name: string;
  version: number;
  section: string;
  items: Array<{
    id: string;
    label: string;
    responseType: InspectionResponseType;
    required: boolean;
  }>;
};

function isLegacySnapshot(value: unknown): value is LegacyInspectionTemplateSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Partial<LegacyInspectionTemplateSnapshot>;
  return typeof snapshot.name === "string" &&
    typeof snapshot.version === "number" &&
    typeof snapshot.section === "string" &&
    Array.isArray(snapshot.items);
}

/** Converts Phase 4A device snapshots without consulting the current template. */
export function normalizeInspectionTemplateSnapshot(
  snapshot: unknown,
  templateId: string,
  templateVersion: number
): InspectionTemplateSnapshot {
  if (typeof snapshot === "object" && snapshot !== null && Array.isArray((snapshot as InspectionTemplateSnapshot).sections)) {
    return snapshot as InspectionTemplateSnapshot;
  }

  if (!isLegacySnapshot(snapshot)) {
    throw new Error("Inspection template snapshot is invalid");
  }

  return {
    templateId,
    templateVersion,
    templateName: snapshot.name,
    sections: [{
      sectionId: `${templateId}:legacy-section`,
      sectionName: snapshot.section,
      sortOrder: 1,
      items: snapshot.items.map((item, index) => ({
        itemId: item.id,
        label: item.label,
        responseType: item.responseType,
        required: item.required,
        sortOrder: index + 1,
        options: item.responseType === "status" ? ["pass", "fail", "not_applicable"] : []
      }))
    }]
  };
}

export function snapshotItems(snapshot: InspectionTemplateSnapshot) {
  return snapshot.sections
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((section) => section.items.slice().sort((left, right) => left.sortOrder - right.sortOrder));
}
