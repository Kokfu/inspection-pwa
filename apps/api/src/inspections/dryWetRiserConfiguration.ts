export type DryWetRiserSystemConfiguration = { riserMode: "dry" | "wet" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDryWetRiserSystemConfiguration(value: unknown): DryWetRiserSystemConfiguration | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !("riserMode" in value)) return undefined;
  return value.riserMode === "dry" || value.riserMode === "wet" ? { riserMode: value.riserMode } : undefined;
}
