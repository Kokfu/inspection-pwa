/**
 * Per-customer `customer_enabled_systems.evidence_policy_id` assignment parser +
 * assignable-system registry.
 *
 * This is the LEGACY pre-V7 per-field photo/PSI evidence lifecycle hook
 * (`automaticSprinklerPsiEvidencePolicyV1.ts`). V7 evidence is contract-driven
 * (`v7EvidenceContracts.ts` / `v7StagedEvidence.ts`) and the V7 acceptance path
 * (`acceptAutomaticSprinklerV7Inspection`) never gates on `system.evidencePolicy`,
 * so assigning a policy is a FUNCTIONAL NO-OP for every customer a Manager can
 * produce today (all on catalog version 7). This module exists so the Manager
 * write path + UI are ready when a V7-era evidence-policy catalog exists.
 *
 * The `evidence_policy_id` column, its FK to `inspection_evidence_policies`, and
 * the `enforce_enabled_system_evidence_policy` BEFORE INSERT/UPDATE trigger have
 * existed since migration 007 — no migration is involved. Storage, forward-copy
 * (`copySelectedConfiguration`) and job freeze (`serviceVisits.ts`) stay
 * system-agnostic, so this set can widen later without a data migration —
 * exactly like `systemConfigurationSystemKeys`.
 */

// Mirrors the `uuidPattern` shape in `apps/api/src/routes/managerCustomers.ts`.
// Duplicated deliberately: an inspections module must not import route code.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const evidencePolicyAssignableSystemKeys: ReadonlySet<string> = new Set(["automatic_sprinkler"]);

/**
 * Parse the `evidencePolicyId` write input for one enabled system.
 * - a valid UUID string -> `{ evidencePolicyId: <uuid> }` (assign)
 * - JSON `null`         -> `{ evidencePolicyId: null }` (explicit clear)
 * - anything else       -> `undefined` (caller turns that into 400 `INVALID_EVIDENCE_POLICY`)
 *
 * A non-null id is only shape-checked here; the caller still verifies it names a
 * published `inspection_evidence_policies` row for the same `system_key` before
 * writing (never relying on the DB trigger to 500).
 */
export function parseEvidencePolicyIdInput(value: unknown): { evidencePolicyId: string | null } | undefined {
  if (value === null) return { evidencePolicyId: null };
  if (typeof value === "string" && uuidPattern.test(value)) return { evidencePolicyId: value };
  return undefined;
}
