// REPAIR-DISABLED (CR-09): restore Complete Repair choices by uncommenting true below and removing false.
// export const COMPLETE_REPAIR_SELECTABLE = true;
export const COMPLETE_REPAIR_SELECTABLE = false;

/** UI-only policy: frozen definitions, saved values and validators retain all contract values. */
export function selectableResultOptions<T>(options: readonly T[], valueOf: (option: T) => string): T[] {
  return options.filter((option) => COMPLETE_REPAIR_SELECTABLE || valueOf(option) !== "complete_repair");
}

export function isRetiredRepair(value: unknown): boolean {
  return !COMPLETE_REPAIR_SELECTABLE && value === "complete_repair";
}
export const retiredRepairLabel = "Complete Repair (no longer selectable)";
