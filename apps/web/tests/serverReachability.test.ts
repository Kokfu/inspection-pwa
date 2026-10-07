import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import { findServerMasterSystemInspection, loadAllPages } from "../src/hoseReel/serverMasterSystemInspectionApi.js";
import {
  isServerUnreachable,
  noteServerReachable,
  noteServerUnreachable,
  SERVER_CHECK_TIMEOUT_MS,
  serverRecentlyUnreachable,
  ServerUnreachableError,
  UNREACHABLE_MEMORY_MS
} from "../src/jobs/serverReachability.js";

/**
 * Opening a saved draft while the server is unreachable used to take about 8 seconds, because the server is
 * asked twice in a row (when the system is tapped, then again when the form route loads) and each failed
 * request waited 2-4 seconds to give up. The second check now skips the wait when the first has just found the
 * server unreachable, and every check has a bounded wait.
 */

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; noteServerReachable(); });

const emptyPage = () => new Response(JSON.stringify({ inspections: [], hasMore: false, nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } });

test("unreachable memory: remembered briefly, then forgotten; reachable clears it", () => {
  noteServerReachable();
  assert.equal(serverRecentlyUnreachable(1_000), false, "nothing remembered initially");
  noteServerUnreachable(1_000);
  assert.equal(serverRecentlyUnreachable(1_000), true);
  assert.equal(serverRecentlyUnreachable(1_000 + UNREACHABLE_MEMORY_MS - 1), true);
  assert.equal(serverRecentlyUnreachable(1_000 + UNREACHABLE_MEMORY_MS), false, "expires");
  assert.equal(serverRecentlyUnreachable(500), false, "a clock that went backwards never counts as recent");
  noteServerUnreachable(2_000);
  noteServerReachable();
  assert.equal(serverRecentlyUnreachable(2_001), false, "reachable clears the memory");
});

test("the follow-up inspection check does not wait through the same failure again", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new TypeError("Failed to fetch"); }) as never;

  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"), (e: unknown) => e instanceof TypeError);
  assert.equal(calls, 1);

  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"), (e: unknown) => e instanceof ServerUnreachableError && isServerUnreachable(e));
  assert.equal(calls, 1, "the second check must not make a request");
});

test("once the network is back (or the memory is cleared) the check asks the server again", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new TypeError("Failed to fetch"); }) as never;
  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"));
  noteServerReachable();
  globalThis.fetch = (async () => { calls += 1; return emptyPage(); }) as never;
  assert.equal(await findServerMasterSystemInspection("job-1", "smoke_ventilation"), undefined);
  assert.equal(calls, 2);
  assert.equal(serverRecentlyUnreachable(), false, "a successful check leaves nothing remembered");
});

test("a server that answers with an error is reachable: nothing is remembered, and the error is not softened", async () => {
  globalThis.fetch = (async () => new Response("", { status: 500 })) as never;
  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"), (e: unknown) => e instanceof Error && !isServerUnreachable(e) && e.message === "Server inspection listing failed: 500");
  assert.equal(serverRecentlyUnreachable(), false);
  globalThis.fetch = (async () => new Response("", { status: 503 })) as never;
  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"), (e: unknown) => e instanceof Error && !isServerUnreachable(e) && e.message === "Server inspection listing failed: 503");
  assert.equal(serverRecentlyUnreachable(), false, "a deliberate 503 is an answer, not unreachable");
});

test("a gateway failure (502) is remembered like a network failure", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response("", { status: 502 }); }) as never;
  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"), (e: unknown) => e instanceof ServerUnreachableError);
  await assert.rejects(findServerMasterSystemInspection("job-1", "smoke_ventilation"), (e: unknown) => e instanceof ServerUnreachableError);
  assert.equal(calls, 1);
});

test("every inspection check has a bounded wait", async () => {
  let signal: AbortSignal | undefined | null;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { signal = init?.signal; return emptyPage(); }) as never;
  await findServerMasterSystemInspection("job-1", "smoke_ventilation");
  assert.ok(signal, "the request must carry an abort signal");
  assert.equal(SERVER_CHECK_TIMEOUT_MS, 3000);
});

test("a hung connection becomes an unreachable server instead of an endless wait", async () => {
  const hanging = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as never;
  const started = Date.now();
  await assert.rejects(loadAllPages(new URLSearchParams(), "check server inspections", hanging, { timeoutMs: 40 }),
    (e: unknown) => e instanceof ServerUnreachableError && isServerUnreachable(e) && /timed out/.test(e.message));
  assert.ok(Date.now() - started < 2000, "gave up promptly");
});

test("the general listing used by other screens is not given a timeout", async () => {
  let signal: AbortSignal | undefined | null = null;
  const request = (async (_url: unknown, init?: RequestInit) => { signal = init?.signal; return emptyPage(); }) as never;
  await loadAllPages(new URLSearchParams(), "load server inspections", request);
  assert.equal(signal, undefined);
});

/**
 * The placeholder shown while a system route resolves used to carry the heading "<System> inspection
 * unavailable" even while it was only loading, so a technician saw "unavailable" for the whole wait.
 * Every placeholder that has a loading state must now say "Opening ..." while loading. The Hydrant screen is
 * rendered for real in route-loading-heading.spec.ts; this guards the other systems against regressing.
 */
test("no system placeholder shows an unconditional 'inspection unavailable' heading while loading", () => {
  const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
  const unconditional = [...app.matchAll(/<h2>([^<{]+?) inspection unavailable<\/h2>/g)].map((m) => m[1]);
  // Wet Chemical's placeholder has no loading state, so its heading is correctly unconditional.
  assert.deepEqual(unconditional.filter((name) => name !== "Wet Chemical"), [], "these placeholders still claim 'unavailable' while loading");
  const conditional = [...app.matchAll(/<h2>\{[^}]*?\?\s*"Opening ([^"]+?) inspection…"\s*:\s*"([^"]+?) inspection unavailable"\}<\/h2>/g)].map((m) => m[1]).sort();
  assert.deepEqual(conditional, ["Automatic Sprinkler", "Dry/Wet Riser", "Fire Alarm", "Fire Intercom", "Fire Rated Roller Shutter", "Hydrant", "Portable Fire Extinguisher", "Smoke Ventilation"]);
});
