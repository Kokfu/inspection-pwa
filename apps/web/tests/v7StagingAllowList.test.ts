import assert from "node:assert/strict";
import test from "node:test";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveV7EvidenceContract, v7EvidenceContractSha256, type V7EvidenceSystemKey } from "../../api/src/inspections/evidence/v7EvidenceContracts";
import { v7StagingSystemKeys } from "../src/attachments/attachmentApi";

test("the web V7 staging allow-list equals the server V7EvidenceSystemKey union", () => {
  const serverKeys = masterServiceReportV7.systems.flatMap((system) => {
    const key = system.key as V7EvidenceSystemKey;
    return resolveV7EvidenceContract({ systemKey: key, templateId: masterServiceReportV7.id, templateVersion: masterServiceReportV7.version, definition: system, contractSha256: v7EvidenceContractSha256(system) }) ? [key] : [];
  }).sort();
  assert.deepEqual([...v7StagingSystemKeys].sort(), serverKeys);
});
