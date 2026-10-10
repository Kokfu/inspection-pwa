import assert from "node:assert/strict";
import test from "node:test";
import { LocationProposalAlreadyPendingError, proposalAlreadyPendingMessage, submitTechnicianLocationProposal } from "../src/referenceData/referenceDataApi.js";
import { layoutProposalNote } from "../src/fireRatedRollerShutter/fireRatedRollerShutterSetup.js";

/** I-49 (typed 409) and I-50 (the layout note is derived from the stored proposal, so it survives a reload). */

const input = { id: "85000000-0000-4000-8000-000000000001", jobId: "job-1", patch: { kind: "update-format" as const, locationKey: "general", rows: [] } };
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
async function withFetch<T>(reply: () => Response, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => reply()) as never;
  try { return await run(); } finally { globalThis.fetch = original; }
}
const failure = async () => { try { await submitTechnicianLocationProposal("customer-1", "fire_rated_roller_shutter", input, 7); } catch (error) { return error; } return undefined; };

test("I-49: 409 LOCATION_PROPOSAL_ALREADY_PENDING is the typed, calm error", async () => {
  const error = await withFetch(() => json({ error: "LOCATION_PROPOSAL_ALREADY_PENDING", message: "A location proposal for this location is already awaiting review." }, 409), failure);
  assert.ok(error instanceof LocationProposalAlreadyPendingError);
  assert.equal((error as Error).message, proposalAlreadyPendingMessage);
  assert.match(proposalAlreadyPendingMessage, /already waiting for Admin review/);
});

test("I-49: any other 409, and the same code on another status, stay ordinary failures with the server's message", async () => {
  const decided = await withFetch(() => json({ error: "LOCATION_PROPOSAL_ALREADY_DECIDED", message: "This location proposal has already been decided." }, 409), failure);
  assert.ok(!(decided instanceof LocationProposalAlreadyPendingError));
  assert.equal((decided as Error).message, "This location proposal has already been decided.");
  const wrongStatus = await withFetch(() => json({ error: "LOCATION_PROPOSAL_ALREADY_PENDING", message: "x" }, 500), failure);
  assert.ok(!(wrongStatus instanceof LocationProposalAlreadyPendingError));
});

test("I-50: the layout note follows the stored proposal status", () => {
  assert.equal(layoutProposalNote(undefined, false), "");
  assert.equal(layoutProposalNote({ status: "Draft" }, false), "");
  assert.match(layoutProposalNote({ status: "Pending" }, false), /saved on this device/);
  assert.match(layoutProposalNote({ status: "Synced" }, false), /sent to an Admin for approval/);
  assert.match(layoutProposalNote({ status: "Failed", lastError: "x" }, false), /needs attention/);
  const held = layoutProposalNote({ status: "Failed", lastError: proposalAlreadyPendingMessage }, true);
  assert.match(held, /already waiting for Admin review/);
  assert.doesNotMatch(held, /needs attention/);
});
