import type { EvidencePolicySnapshot } from "../jobs/jobTypes";

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

export function resolveAutomaticSprinklerEvidencePolicy(
  value: EvidencePolicySnapshot | undefined
) {
  if (!value) return undefined;
  if (
    value.code !== "automatic-sprinkler-psi-evidence"
    || value.version !== 1
    || value.schemaVersion !== 1
    || value.definition.code !== value.code
    || value.definition.version !== value.version
    || value.definition.schemaVersion !== 1
    || value.definition.systemKey !== "automatic_sprinkler"
    || !/^[0-9a-f]{64}$/.test(value.definitionSha256)
  ) {
    throw new Error("Unsupported Automatic Sprinkler evidence policy");
  }
  const actualPaths = Object.keys(value.definition.points).sort();
  const expectedPaths = [...automaticSprinklerPsiFieldPaths].sort();
  if (
    actualPaths.length !== expectedPaths.length
    || expectedPaths.some((fieldPath, index) => actualPaths[index] !== fieldPath)
    || automaticSprinklerPsiFieldPaths.some((fieldPath) => {
      const point = value.definition.points[fieldPath];
      return point?.allowed !== true || point.required !== false || point.maxCount !== 1;
    })
  ) {
    throw new Error("Automatic Sprinkler evidence policy points are invalid");
  }
  return value;
}
