import { canonicalJson } from "./repairVisitCanon";
import type {
  LocalRepairVisit, LocalRepairVisitItem, LocalRepairVisitPhoto, RepairCatalogField, RepairVisitFieldIdentity, RepairVisitOutcome, RepairVisitPrevious
} from "./repairVisitTypes";

export const NO_PHOTO_AT_PREVIOUS_VISIT = "No photo recorded at previous visit";
export const NO_PREVIOUS_VISIT = "No previous visit";
export const RV_NUMBER_PLACEHOLDER = "RV number given when synced";

export const outcomeLabel = (outcome: RepairVisitOutcome | null) =>
  outcome === "done_repair" ? "Done Repair" : outcome === "not_done" ? "Not Done" : "Not answered";

/** Wording of a field's earlier result, used for the Before panel and the picker badge. */
export function beforeResultLabel(result: string) {
  switch (result) {
    case "not_good": return "Not Good";
    case "good": return "Good";
    case "na": return "N.A.";
    case "complete_repair": return "Complete Repair";
    case "done_repair": return "Done Repair";
    case "not_done": return "Not Done";
    default: return result;
  }
}
export const needsRepair = (field: Pick<RepairCatalogField, "before">) => field.before?.result === "not_good" || field.before?.result === "not_done";

export const identityKey = (identity: RepairVisitFieldIdentity) => canonicalJson(identity);
export const catalogCacheKey = (customerId: string, siteId: string, previous: RepairVisitPrevious | null) =>
  `${customerId}|${siteId}|${previous?.kind ?? "none"}|${previous?.visitId ?? "none"}`;
export const beforePhotoCacheKey = (previous: RepairVisitPrevious, photoUuid: string) => `${previous.kind}|${previous.visitId}|${photoUuid}`;

// ---- Editing rules ----
/** A visit is editable on this device until it is submitted; a returned visit becomes editable again. */
export function isEditable(visit: LocalRepairVisit) {
  return visit.origin !== "server" && !visit.frozen && (visit.status === "draft" || visit.status === "returned");
}
/** The revision the next Submit will carry (3A: draft = 1, returned at N = N + 1). */
export const nextSubmitRevision = (visit: Pick<LocalRepairVisit, "status" | "revision">) => visit.status === "returned" ? visit.revision + 1 : visit.revision;

export type ItemProblem = "outcome" | "remark" | "photo";
export function itemProblems(item: Pick<LocalRepairVisitItem, "outcome" | "remark" | "photoUuid">, photo: Pick<LocalRepairVisitPhoto, "photoUuid"> | undefined): ItemProblem[] {
  const problems: ItemProblem[] = [];
  if (item.outcome === null) problems.push("outcome");
  if (!item.remark.trim()) problems.push("remark");
  if (!item.photoUuid || !photo || photo.photoUuid !== item.photoUuid) problems.push("photo");
  return problems;
}
export function submitReadiness(items: LocalRepairVisitItem[], photos: Map<string, LocalRepairVisitPhoto>) {
  const incomplete = items.filter(item => itemProblems(item, item.photoUuid ? photos.get(item.photoUuid) : undefined).length > 0);
  return { ready: items.length > 0 && incomplete.length === 0, total: items.length, incomplete: incomplete.length };
}
/** True while the technician has typed or captured nothing: only then may the visit be deleted (plan decision 12). */
export const isUnstarted = (items: LocalRepairVisitItem[]) => items.every(item => item.outcome === null && !item.remark.trim() && !item.photoUuid);

// ---- Cards ----
export type RepairVisitPresentation = {
  label: "Draft" | "Pending sync" | "Syncing" | "Needs attention" | "Awaiting approval" | "Returned" | "Approved";
  tone: "draft" | "pending" | "syncing" | "attention" | "waiting" | "returned" | "approved";
  tab: "in-progress" | "completed";
  reason?: string;
};
export function presentRepairVisit(visit: LocalRepairVisit): RepairVisitPresentation {
  if (visit.status === "approved") return { label: "Approved", tone: "approved", tab: "completed" };
  if (visit.syncStatus === "Failed" || visit.syncStatus === "Conflict") {
    return { label: "Needs attention", tone: "attention", tab: "in-progress", reason: visit.lastSyncError ?? "The server did not confirm this repair visit." };
  }
  if (visit.syncStatus === "Syncing") return { label: "Syncing", tone: "syncing", tab: "in-progress" };
  if (visit.syncStatus === "Pending") return { label: "Pending sync", tone: "pending", tab: "in-progress", reason: visit.lastSyncError };
  if (visit.status === "awaiting_approval") return { label: "Awaiting approval", tone: "waiting", tab: "in-progress" };
  if (visit.status === "returned") return { label: "Returned", tone: "returned", tab: "in-progress" };
  return { label: "Draft", tone: "draft", tab: "in-progress" };
}
export const visitNumberText = (visit: Pick<LocalRepairVisit, "visitNumber">) => visit.visitNumber ?? RV_NUMBER_PLACEHOLDER;

// ---- Picker ----
export type FieldSection = { key: string; label: string; fields: RepairCatalogField[] };
export type FieldUnit = { key: string; label: string; sections: FieldSection[] };
export type FieldSystem = { key: string; label: string; units: FieldUnit[] };

/** System -> Unit -> Section -> Field, in first-appearance order. The catalog arrives with Not Good / Not Done fields first. */
export function groupCatalog(fields: RepairCatalogField[]): FieldSystem[] {
  const systems: FieldSystem[] = [];
  for (const field of fields) {
    const identity = field.identity;
    let system = systems.find(candidate => candidate.key === identity.systemKey);
    if (!system) { system = { key: identity.systemKey, label: field.systemLabel, units: [] }; systems.push(system); }
    const unitKey = `${identity.rowUuid ?? ""}|${identity.locationId ?? ""}|${identity.zoneId ?? ""}|${field.unitLabel}`;
    let unit = system.units.find(candidate => candidate.key === unitKey);
    if (!unit) { unit = { key: unitKey, label: field.unitLabel, sections: [] }; system.units.push(unit); }
    let section = unit.sections.find(candidate => candidate.key === identity.sectionKey);
    if (!section) { section = { key: identity.sectionKey, label: field.sectionLabel, fields: [] }; unit.sections.push(section); }
    section.fields.push(field);
  }
  // Within a section, fields that need repair come first; the sort is stable.
  for (const system of systems) for (const unit of system.units) for (const section of unit.sections) {
    section.fields = [...section.fields.filter(needsRepair), ...section.fields.filter(field => !needsRepair(field))];
  }
  // Groups holding something that needs repair rise above groups that hold none.
  const systemUrgent = (system: FieldSystem) => system.units.some(unit => unit.sections.some(section => section.fields.some(needsRepair)));
  const unitUrgent = (unit: FieldUnit) => unit.sections.some(section => section.fields.some(needsRepair));
  const sectionUrgent = (section: FieldSection) => section.fields.some(needsRepair);
  const stable = <T,>(groups: T[], isUrgent: (group: T) => boolean) => [...groups.filter(isUrgent), ...groups.filter(group => !isUrgent(group))];
  for (const system of systems) {
    for (const unit of system.units) unit.sections = stable(unit.sections, sectionUrgent);
    system.units = stable(system.units, unitUrgent);
  }
  return stable(systems, systemUrgent);
}
