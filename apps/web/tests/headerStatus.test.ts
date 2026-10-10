import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { computeOfflineReadiness, offlineReadinessLabel } from "../src/pwa/offlineReadiness.js";
import { probeServerHealth } from "../src/jobs/serverHealth.js";
import { describeUnsyncedWork } from "../src/sync/unsyncedWork.js";

/** I-01 server-unreachable label, I-05 offline-ready indicator, I-06 header sizes, I-10 sign-out warning. */

test("I-05: offline ready only when a service worker controls the page AND the shell is precached", () => {
  assert.equal(computeOfflineReadiness({ supported: false, controlled: true, precached: true }), "unavailable");
  assert.equal(computeOfflineReadiness({ supported: true, controlled: false, precached: true }), "preparing", "first visit, not yet controlled");
  assert.equal(computeOfflineReadiness({ supported: true, controlled: true, precached: false }), "preparing");
  assert.equal(computeOfflineReadiness({ supported: true, controlled: true, precached: true }), "ready");
  assert.equal(offlineReadinessLabel.ready, "Offline ready");
  assert.notEqual(offlineReadinessLabel.preparing, offlineReadinessLabel.ready, "status is text, not colour");
});

test("I-01: probe says unreachable for network errors, timeouts and gateway failures, reachable for any other answer", async () => {
  const answer = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;
  assert.equal(await probeServerHealth(answer(200)), "reachable");
  assert.equal(await probeServerHealth(answer(401)), "reachable");
  assert.equal(await probeServerHealth(answer(500)), "reachable", "the API answered, so it is reachable");
  assert.equal(await probeServerHealth(answer(503)), "reachable");
  assert.equal(await probeServerHealth(answer(502)), "unreachable");
  assert.equal(await probeServerHealth(answer(504)), "unreachable");
  assert.equal(await probeServerHealth((async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch), "unreachable");
  const hang = ((_: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
  assert.equal(await probeServerHealth(hang, 20), "unreachable", "a hung request times out");
});

test("I-10: sign-out warning names the unsynced work, and stays silent when there is none", () => {
  assert.equal(describeUnsyncedWork({ waiting: 0, failed: 0 }, "tech", true), undefined);
  const message = describeUnsyncedWork({ waiting: 2, failed: 1 }, "tech", true)!;
  assert.match(message, /3 submitted items not yet synced \(2 waiting to sync, 1 need attention\)/);
  assert.match(message, /sync after you sign in again as tech/);
  assert.doesNotMatch(message, /offline/);
  assert.match(describeUnsyncedWork({ waiting: 1, failed: 0 }, undefined, false)!, /1 submitted item not yet synced \(1 waiting to sync\)[\s\S]*You are offline, so you will need a connection/);
});

test("App wiring: label, chip, and the sign-out check run before the sign-out", () => {
  const app = readFileSync(join(import.meta.dirname, "../src/App.tsx"), "utf8");
  const chip = readFileSync(join(import.meta.dirname, "../src/pwa/browserOnline.ts"), "utf8");
  assert.match(chip, /label: "Server unreachable"/);
  assert.match(app, /headerConnectionChip\(\{ authStatus: authState\.status, serverUnreachable, connectivityRecoveryActive, browserOnline \}\)/);
  assert.match(app, /offlineReadinessLabel\[offlineReadiness\]/);
  const logout = app.slice(app.indexOf("async function handleLogout()"));
  assert.ok(logout.indexOf("describeUnsyncedWork") > 0 && logout.indexOf("describeUnsyncedWork") < logout.indexOf("beginExplicitAuthOperation()"), "warning precedes the sign-out operation");
  assert.ok(logout.indexOf("window.confirm(warning)") < logout.indexOf("beginExplicitAuthOperation()"));
});

test("I-06: header status text uses >= --text-xs and the header buttons use --tap", () => {
  const css = readFileSync(join(import.meta.dirname, "../src/styles/app.css"), "utf8");
  const block = css.slice(css.lastIndexOf("/* I-06 / I-05"));
  assert.match(block, /\.app-build[^{]*\{ font-size: var\(--text-xs\); \}/);
  assert.match(block, /\.app-account button \{[^}]*min-width: var\(--tap\)[^}]*min-height: var\(--tap\)/);
  assert.match(css, /--tap: 44px;/);
  assert.match(css, /--text-xs: \.75rem;/);
});

test("I-42: the header chip follows the browser's online flag over any auth/server state", async () => {
  const { headerConnectionChip } = await import("../src/pwa/browserOnline.js");
  const base = { serverUnreachable: false, connectivityRecoveryActive: false, browserOnline: true } as const;
  assert.equal(headerConnectionChip({ ...base, authStatus: "verified" }).label, "Online");
  assert.equal(headerConnectionChip({ ...base, authStatus: "verified", serverUnreachable: true }).label, "Server unreachable");
  assert.equal(headerConnectionChip({ ...base, authStatus: "verifying" }).label, "Reconnecting");
  assert.equal(headerConnectionChip({ ...base, authStatus: "online-unavailable" }).label, "Server unavailable");
  assert.equal(headerConnectionChip({ ...base, authStatus: "offline-unverified" }).label, "Offline");
  for (const authStatus of ["verified", "verifying", "online-unavailable", "offline-unverified", "logged-out", "restoring"] as const) {
    assert.equal(headerConnectionChip({ ...base, authStatus, browserOnline: false }).label, "Offline", `${authStatus} while the browser is offline`);
    assert.equal(headerConnectionChip({ ...base, authStatus, browserOnline: false, connectivityRecoveryActive: true }).label, "Offline");
  }
});
