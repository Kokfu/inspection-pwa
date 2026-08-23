import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const dist = path.resolve("dist");
const file = (name) => path.join(dist, name);

test("production build uses explicit prompt registration and preserves the offline shell", () => {
  assert.equal(existsSync(file("index.html")), true, "missing production index.html");
  assert.equal(existsSync(file("sw.js")), true, "missing generated service worker");
  assert.equal(existsSync(file("registerSW.js")), false, "legacy injected registration must not be emitted");

  const index = readFileSync(file("index.html"), "utf8");
  const serviceWorker = readFileSync(file("sw.js"), "utf8");
  assert.doesNotMatch(index, /vite-plugin-pwa:register-sw|registerSW\.js/);
  assert.match(serviceWorker, /SKIP_WAITING/);
  assert.doesNotMatch(serviceWorker, /self\.skipWaiting\(\),/);
  assert.doesNotMatch(serviceWorker, /\.clientsClaim\(\)/);
  assert.match(serviceWorker, /precacheAndRoute/);
  assert.match(serviceWorker, /NavigationRoute/);
  assert.match(serviceWorker, /cleanupOutdatedCaches/);
});

test("coordinator owns controller-change reload policy instead of the plugin prompt callback", () => {
  const coordinator = readFileSync(path.resolve("src/pwa/updateCoordinator.ts"), "utf8");
  const appBundle = readFileSync(path.join(dist, "assets", readdirSync(path.join(dist, "assets"))
    .find((name) => /^index-.*\.js$/.test(name))), "utf8");
  assert.doesNotMatch(coordinator, /virtual:pwa-register/);
  assert.match(coordinator, /from "workbox-window"/);
  assert.match(coordinator, /messageSkipWaiting/);
  assert.match(coordinator, /addEventListener\("controllerchange"/);
  assert.match(coordinator, /activationRequestedByThisClient/);
  assert.doesNotMatch(appBundle, /onNeedRefresh/);
  assert.equal((appBundle.match(/location\.reload/g) ?? []).length, 1, "only the coordinator's guarded reload may be bundled");
});
