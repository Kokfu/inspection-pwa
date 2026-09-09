import {
  parseDryWetRiserSystemConfiguration,
  type DryWetRiserSystemConfiguration
} from "./dryWetRiserConfiguration.js";

/**
 * Per-customer `customer_enabled_systems.system_configuration` parser + schema
 * registry.
 *
 * The column and its `jsonb_typeof(system_configuration) = 'object'` CHECK have
 * existed since migration 008. Only ONE payload shape is understood today:
 * `dry_wet_riser -> { riserMode: "dry" | "wet" }`
 * (`dryWetRiserConfiguration.ts`). This module is the single place that maps a
 * `systemKey` to (a) a server-authoritative validator and (b) a
 * server-authoritative form descriptor the Manager web UI renders — mirroring
 * how `labelOverrideSystemKeys` / the resolved-controls tree bound the
 * label-override editor.
 *
 * Storage, forward-copy (`copySelectedConfiguration`) and job freeze
 * (`serviceVisits.ts`) stay system-agnostic, so this set can widen later with no
 * data migration.
 */
export const systemConfigurationSystemKeys: ReadonlySet<string> = new Set(["dry_wet_riser"]);

export type SystemConfigurationFieldOption = { value: string; label: string };

export type SystemConfigurationField = {
  key: string;
  label: string;
  control: "select";
  required: boolean;
  options: SystemConfigurationFieldOption[];
};

export type SystemConfigurationSchema = { fields: SystemConfigurationField[] };

const dryWetRiserSchema: SystemConfigurationSchema = {
  fields: [
    {
      key: "riserMode",
      label: "Riser mode",
      control: "select",
      required: true,
      options: [
        { value: "dry", label: "Dry" },
        { value: "wet", label: "Wet" }
      ]
    }
  ]
};

/**
 * Validate a client-supplied `system_configuration` payload for one system.
 * Returns the normalised object to persist, or `undefined` when the payload is
 * not a shape this system understands (the caller turns that into a
 * `400 INVALID_SYSTEM_CONFIGURATION`).
 */
export function parseSystemConfiguration(
  systemKey: string,
  value: unknown
): DryWetRiserSystemConfiguration | undefined {
  if (systemKey === "dry_wet_riser") return parseDryWetRiserSystemConfiguration(value);
  return undefined;
}

/**
 * The server-authoritative form descriptor for one system, or `undefined` for a
 * system with no per-customer configuration. The web renders its controls purely
 * from this — it never hard-codes the field list.
 */
export function systemConfigurationSchema(systemKey: string): SystemConfigurationSchema | undefined {
  if (systemKey === "dry_wet_riser") return dryWetRiserSchema;
  return undefined;
}
