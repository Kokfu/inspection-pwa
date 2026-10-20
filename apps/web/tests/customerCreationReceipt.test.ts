import assert from "node:assert/strict";
import test from "node:test";
import { createTechnicianCustomer } from "../src/referenceData/referenceDataApi.js";

/**
 * AGENTS.md: "Mark a record Synced only when the server confirms that exact UUID." POST /customers now echoes the
 * request UUID; the helper must refuse any 2xx that does not carry it, so the outbox item stays retryable.
 */

const requestId = "85000000-0000-4000-8000-000000000001";
const customerId = "85000000-0000-4000-8000-000000000002";
const input = { requestId, displayName: "Receipt Customer", siteDisplayName: "Site", systemKeys: ["hose_reel"] };
const customer = { id: customerId, code: "TEST", displayName: "Receipt Customer" };
const confirmation = "The server did not confirm this customer request. It will be retried.";

const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
async function run(reply: () => Response) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => reply()) as never;
  try { return await createTechnicianCustomer(input, 7); } finally { globalThis.fetch = original; }
}
const failure = async (reply: () => Response) => { try { await run(reply); } catch (error) { return error instanceof Error ? error.message : String(error); } return "RESOLVED"; };

test("a 201 and a 200 replay carrying the exact requestId return the customer", async () => {
  assert.deepEqual(await run(() => json({ requestId, customer: { customer } }, 201)), customer);
  assert.deepEqual(await run(() => json({ requestId, customer: { customer } }, 200)), customer);
});

test("the receipt is compared case-insensitively", async () => {
  assert.deepEqual(await run(() => json({ requestId: requestId.toUpperCase(), customer: { customer } })), customer);
});

test("a missing, null, malformed, non-string or different requestId is refused even with a valid same-name customer", async () => {
  const body = { customer: { customer } };
  for (const reply of [
    body, { ...body, requestId: null }, { ...body, requestId: "" }, { ...body, requestId: "not-a-uuid" },
    { ...body, requestId: 12 }, { ...body, requestId: ["x"] }, { ...body, requestId: "85000000-0000-4000-8000-0000000000ff" }
  ]) {
    assert.equal(await failure(() => json(reply)), confirmation, JSON.stringify(reply));
    assert.equal(await failure(() => json(reply, 200)), confirmation, JSON.stringify(reply));
  }
});

test("a correct receipt does not excuse a malformed customer", async () => {
  assert.notEqual(await failure(() => json({ requestId, customer: { customer: { ...customer, id: "nope" } } })), "RESOLVED");
  assert.notEqual(await failure(() => json({ requestId, customer: { customer: { ...customer, displayName: "Someone Else" } } })), "RESOLVED");
  assert.notEqual(await failure(() => json({ requestId })), "RESOLVED");
});

test("auth refusals and server errors keep their existing messages", async () => {
  assert.match(await failure(() => json({}, 401)), /sign in again/i);
  assert.match(await failure(() => json({ requestId, customer: { customer } }, 403)), /server refused this new customer/i);
  assert.equal(await failure(() => json({ message: "Response unavailable" }, 503)), "Response unavailable");
});
