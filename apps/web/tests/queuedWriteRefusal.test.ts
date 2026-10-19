import assert from "node:assert/strict";
import test from "node:test";
import { createTechnicianCustomer, submitTechnicianLocationProposal } from "../src/referenceData/referenceDataApi.js";

/**
 * I-44: a queued write the server REFUSED (403) or answered with an expired session (401) was stored as "Connect to the
 * server to submit this location proposal.", which sends the technician looking for a connection problem. The server was
 * reached. "Connect to the server" is now kept for a real network failure only.
 */

const proposalId = "84000000-0000-4000-8000-000000000001";
const input = { id: proposalId, jobId: "20000000-0000-4000-8000-000000000001", patch: { kind: "update-format" as const, locationKey: "general", rows: [{ assetReference: "RS-1", locationText: "Lobby" }] } };
const customerInput = { requestId: "84000000-0000-4000-8000-000000000002", displayName: "Retry Customer", siteDisplayName: "Site", systemKeys: ["hose_reel"] };

async function withFetch<T>(reply: () => Response | Promise<Response>, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => reply()) as never;
  try { return await run(); } finally { globalThis.fetch = original; }
}
const rejection = async (run: () => Promise<unknown>) => { try { await run(); } catch (error) { return error instanceof Error ? error.message : String(error); } return "RESOLVED"; };
const proposal = () => submitTechnicianLocationProposal("10000000-0000-4000-8000-000000000001", "fire_rated_roller_shutter", input, 7);
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("I-44: a 403 says the server refused the proposal, with the status, and never 'Connect to the server'", async () => {
  const message = await withFetch(() => json({ error: "CROSS_ORIGIN_WRITE_DENIED" }, 403), () => rejection(proposal));
  assert.match(message, /server refused this location proposal/i);
  assert.match(message, /403/);
  assert.doesNotMatch(message, /Connect to the server/i);
});

test("I-44: a message the server sends with the 403 is shown after ours", async () => {
  const message = await withFetch(() => json({ message: "Only the technician who owns this visit can propose a format." }, 403), () => rejection(proposal));
  assert.match(message, /server refused this location proposal/i);
  assert.match(message, /Only the technician who owns this visit can propose a format\./);
});

test("I-44: a 403 whose body is not JSON (for example a gateway page) still gives the same plain message", async () => {
  const message = await withFetch(() => new Response("<html>Forbidden</html>", { status: 403, headers: { "content-type": "text/html" } }), () => rejection(proposal));
  assert.match(message, /server refused this location proposal/i);
  assert.doesNotMatch(message, /Unexpected token|JSON/i);
});

test("I-44: a 401 asks the technician to sign in again", async () => {
  const message = await withFetch(() => json({ error: "UNAUTHENTICATED" }, 401), () => rejection(proposal));
  assert.match(message, /sign in again/i);
  assert.doesNotMatch(message, /Connect to the server/i);
});

test("I-44: a real network failure still says to connect to the server", async () => {
  const message = await withFetch(() => { throw new TypeError("Failed to fetch"); }, () => rejection(proposal));
  assert.equal(message, "Connect to the server to submit this location proposal.");
});

test("I-44: another failure keeps its own message, and a non-JSON error page is not reported as a JSON syntax error", async () => {
  assert.equal(await withFetch(() => json({ message: "Proposal already decided." }, 409), () => rejection(proposal)), "Proposal already decided.");
  const html = await withFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }), () => rejection(proposal));
  assert.equal(html, "Location proposal could not be submitted.");
});

test("I-44: the server's exact confirmation is still returned on success", async () => {
  const result = await withFetch(() => json({ proposal: { id: proposalId, status: "pending", customerId: "10000000-0000-4000-8000-000000000001",
    systemKey: "fire_rated_roller_shutter", systemDisplayName: "Roller Shutter", customerDisplayName: "Customer", jobId: input.jobId,
    jobReference: "SV-1", submittedByUserId: 7, submittedBy: "Technician", submittedByRole: "inspector",
    submittedAt: "2026-10-19T00:00:00.000Z", payload: input.patch, decision: null, edited: false } }, 201), proposal);
  assert.deepEqual(result, { id: proposalId, status: "pending" });
});

test("I-44: queued customer creation has the same wording for 401 and 403, and keeps other answers", async () => {
  const create = () => createTechnicianCustomer(customerInput, 7);
  const refused = await withFetch(() => json({ error: "FORBIDDEN" }, 403), () => rejection(create));
  assert.match(refused, /server refused this new customer/i);
  assert.match(refused, /403/);
  assert.doesNotMatch(refused, /Connect to the server/i);
  assert.match(await withFetch(() => json({}, 401), () => rejection(create)), /sign in again/i);
  assert.equal(await withFetch(() => json({ message: "Response unavailable" }, 503), () => rejection(create)), "Response unavailable");
});
