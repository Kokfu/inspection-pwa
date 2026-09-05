import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { resolveV7EvidenceContract, v7EvidenceContractSha256, type V7EvidenceSystemKey } from "../inspections/evidence/v7EvidenceContracts.js";

/**
 * `stagedEvidence.ts` filtered its `system_key IN (...)` list to three systems
 * for two commits and silently returned empty accepted-evidence for the rest —
 * neither the server nor the browser proofs noticed. This derives the ground
 * truth from the same adapter registry every V7 acceptance path already trusts
 * (`resolveV7EvidenceContract`), then checks every `system_key IN (...)`
 * occurrence in the route file against it, so a system newly wired into the
 * adapter registry but forgotten here fails loudly instead of returning empty.
 */
test("every system_key IN (...) allow-list in stagedEvidence.ts equals the V7 adapter registry", () => {
  const groundTruth = masterServiceReportV7.systems.flatMap((system) => {
    const key = system.key as V7EvidenceSystemKey;
    return resolveV7EvidenceContract({
      systemKey: key,
      templateId: masterServiceReportV7.id,
      templateVersion: masterServiceReportV7.version,
      definition: system,
      contractSha256: v7EvidenceContractSha256(system)
    })
      ? [key]
      : [];
  }).sort();
  assert.ok(groundTruth.length >= 6, `expected at least 6 V7 evidence systems, found ${groundTruth.length}`);

  const routeFilePath = fileURLToPath(new URL("./stagedEvidence.ts", import.meta.url));
  const source = readFileSync(routeFilePath, "utf8");
  const occurrences = [...source.matchAll(/system_key IN \(([^)]+)\)/g)];
  assert.ok(occurrences.length >= 2, `expected at least 2 system_key IN (...) occurrences, found ${occurrences.length}`);

  for (const [index, match] of occurrences.entries()) {
    const keys = match[1]!.split(",").map((value) => value.trim().replace(/^'|'$/g, "")).sort();
    assert.deepEqual(keys, groundTruth, `stagedEvidence.ts system_key IN (...) occurrence #${index + 1} does not match the V7 adapter registry`);
  }
});
