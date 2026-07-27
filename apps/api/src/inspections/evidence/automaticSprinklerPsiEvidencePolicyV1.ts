import { createHash } from "node:crypto";

export const automaticSprinklerPsiEvidencePolicyId =
  "00000000-0000-4000-8000-000000000710";
export const automaticSprinklerPsiEvidencePolicyCode =
  "automatic-sprinkler-psi-evidence";

export const automaticSprinklerPsiFieldPaths = [
  "measurements.jockey_pump_pressure.cut_in",
  "measurements.jockey_pump_pressure.cut_out",
  "measurements.duty_pump_cut_in.value",
  "measurements.standby_pump_cut_in.value",
  "measurements.water_supply_gauge.value",
  "measurements.installation_gauge.value"
] as const;

export type AutomaticSprinklerPsiFieldPath =
  (typeof automaticSprinklerPsiFieldPaths)[number];

const points = Object.fromEntries(
  automaticSprinklerPsiFieldPaths.map((fieldPath) => [
    fieldPath,
    { allowed: true, required: false, maxCount: 1 }
  ])
);

export const automaticSprinklerPsiEvidencePolicyV1 = {
  schemaVersion: 1,
  code: automaticSprinklerPsiEvidencePolicyCode,
  version: 1,
  systemKey: "automatic_sprinkler",
  points
} as const;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const automaticSprinklerPsiEvidencePolicySha256 = createHash("sha256")
  .update(canonicalize(automaticSprinklerPsiEvidencePolicyV1))
  .digest("hex");

export function isAutomaticSprinklerPsiFieldPath(
  value: string
): value is AutomaticSprinklerPsiFieldPath {
  return automaticSprinklerPsiFieldPaths.some((fieldPath) => fieldPath === value);
}
