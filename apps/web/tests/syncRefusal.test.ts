import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readRefusalBody, syncRefusalMessage } from "../src/sync/syncRefusal.js";

/**
 * I-51: `/api/sync` answered a 401 and a 403 with the same 'Sign in required before server sync'. A 403 is the server
 * refusing; signing in again will not help, so the stored text must not say so.
 */

test("I-51: a 401 keeps the existing sign-in text", () => {
  assert.equal(syncRefusalMessage(401), "Sign in required before server sync");
  assert.equal(syncRefusalMessage(401, { message: "Anything" }), "Sign in required before server sync");
});

test("I-51: a 403 says the server refused the request, with the status, and never 'Sign in'", () => {
  const message = syncRefusalMessage(403);
  assert.match(message, /server refused this sync request/i);
  assert.match(message, /403/);
  assert.doesNotMatch(message, /sign in/i);
});

test("I-51: the server's own message is shown after ours, a blank or non-text one is ignored", () => {
  assert.match(syncRefusalMessage(403, { message: "Cross-origin writes are not allowed." }), /Cross-origin writes are not allowed\./);
  assert.doesNotMatch(syncRefusalMessage(403, { message: "   " }), /\(HTTP 403\)\.\s{2}/);
  assert.doesNotMatch(syncRefusalMessage(403, { message: { nested: true } }), /object/i);
});

test("I-51: a reply body that is not JSON (a gateway page) reads as an empty body", async () => {
  assert.deepEqual(await readRefusalBody(new Response("<html>Forbidden</html>", { status: 403 })), {});
  assert.deepEqual(await readRefusalBody(new Response(JSON.stringify({ message: "No" }), { status: 403 })), { message: "No" });
  assert.deepEqual(await readRefusalBody(new Response("null", { status: 403 })), {});
});

test("I-51 wiring: the sync engine maps the refusal through syncRefusalMessage, not a fixed 401 text", () => {
  const engine = readFileSync(join(import.meta.dirname, "../src/sync/syncEngine.ts"), "utf8");
  assert.match(engine, /syncRefusalMessage\(response\.status, await readRefusalBody\(response\)\)/);
  assert.doesNotMatch(engine, /throw new Error\("Sign in required before server sync"\)/);
});
