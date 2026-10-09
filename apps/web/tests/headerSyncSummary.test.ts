import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { headerSyncSummary } from "../src/sync/headerSyncSummary.js";

/** L-5: the header must not say "All submitted changes synced" while a location proposal is unconfirmed. */

const none = { inspectionStatuses: [], attachmentStatuses: [], proposalStatuses: [] } as const;

test("L-5: no unsynced work of any kind keeps the synced message", () => {
  assert.deepEqual(headerSyncSummary(none), { text: "All submitted changes synced", needsAttention: false, running: false });
  assert.equal(headerSyncSummary({ ...none, inspectionStatuses: ["Draft", "Synced"], proposalStatuses: [] }).text, "All submitted changes synced");
});

test("L-5: one Pending location proposal is shown as waiting, not as all synced", () => {
  const result = headerSyncSummary({ ...none, proposalStatuses: ["Pending"] });
  assert.equal(result.text, "1 location proposal waiting to sync");
  assert.equal(result.needsAttention, false);
});

test("L-5: a Failed (or Conflict) location proposal gets the same Sync needs attention treatment", () => {
  for (const status of ["Failed", "Conflict"]) {
    const result = headerSyncSummary({ ...none, proposalStatuses: [status] });
    assert.equal(result.text, "Sync needs attention");
    assert.equal(result.needsAttention, true);
  }
});

test("L-5: a Syncing proposal shows Syncing, and attention outranks everything", () => {
  assert.equal(headerSyncSummary({ ...none, proposalStatuses: ["Syncing"] }).text, "Syncing…");
  assert.equal(headerSyncSummary({ ...none, inspectionStatuses: ["Syncing"], proposalStatuses: ["Failed"] }).text, "Sync needs attention");
});

test("L-5: existing record kinds keep their exact wording", () => {
  assert.equal(headerSyncSummary({ ...none, inspectionStatuses: ["Pending"] }).text, "1 inspection waiting to sync");
  assert.equal(headerSyncSummary({ ...none, inspectionStatuses: ["Pending", "Pending"] }).text, "2 inspections waiting to sync");
  assert.equal(headerSyncSummary({ ...none, inspectionStatuses: ["Synced"], attachmentStatuses: ["Uploading"] }).text, "Syncing…");
  assert.equal(headerSyncSummary({ ...none, attachmentStatuses: ["Failed"] }).text, "Sync needs attention");
  assert.equal(headerSyncSummary({ ...none, attachmentStatuses: ["Conflict"] }).text, "Sync needs attention");
  assert.equal(headerSyncSummary({ ...none, inspectionStatuses: ["Pending", "Pending"], proposalStatuses: ["Pending"] }).text, "2 inspections and 1 location proposal waiting to sync");
});

test("L-5 wiring: the header uses the shared summary and the proposal outbox, and proposals announce sync runs", () => {
  const app = readFileSync(join(import.meta.dirname, "../src/App.tsx"), "utf8");
  assert.match(app, /headerSyncSummary\(\{[\s\S]*proposalStatuses/);
  assert.match(app, /useLocationProposalOutboxStatuses\(/);
  const draft = readFileSync(join(import.meta.dirname, "../src/jobs/technicianLocationProposalDraft.ts"), "utf8");
  assert.ok((draft.match(/announceSyncFinished\(\)/g) ?? []).length >= 2, "queueing and finishing a proposal sync both announce");
  const hook = readFileSync(join(import.meta.dirname, "../src/sync/useLocationProposalOutboxStatuses.ts"), "utf8");
  assert.match(hook, /entityType"\)\.equals\("technicianLocationProposal"\)/);
  assert.match(hook, /status !== "Completed"/, "only unconfirmed items count: Completed means the exact UUID was server-confirmed");
});
