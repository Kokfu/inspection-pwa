import { expect, test, type Page, type Route } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { fingerprint } from "../../api/src/repairs/acceptedSource";

const routeCallbacks = new WeakMap<Page, Set<Promise<void>>>();
async function fixtureRoute(page: Page, url: Parameters<Page["route"]>[0], handler: (route: Route) => unknown | Promise<unknown>) {
  let callbacks = routeCallbacks.get(page);
  if (!callbacks) { callbacks = new Set(); routeCallbacks.set(page, callbacks); }
  const pending = callbacks;
  await page.route(url, async route => {
    let complete!: () => void;
    const done = new Promise<void>(resolve => { complete = resolve; });
    pending.add(done);
    try { await handler(route); }
    finally { pending.delete(done); complete(); }
  });
}
// Removing interception can continue a held request before its callback finishes.
// Block new fetches, then drain callbacks BEFORE removing their route handlers.
async function finishFixtureRoutes(page: Page) {
  await page.evaluate(() => {
    window.fetch = async () => { throw new TypeError("C1 fixture teardown blocks new requests"); };
  });
  const callbacks = routeCallbacks.get(page);
  while (callbacks?.size) await Promise.all([...callbacks]);
  await page.unrouteAll({ behavior: "wait" });
}
test.afterEach(async ({ page }) => { await finishFixtureRoutes(page); });

test("C1 fixture settles a held route before removing interception", async ({ page }) => {
  await page.goto("/tests/result-tap-scroll.html");
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  await fixtureRoute(page, "**/api/c1-drain-probe", async route => {
    entered(); await held;
    await route.fulfill({ json: { settled: true } });
  });
  // This page's harness replaces fetch; use the native fetch in an iframe.
  await page.evaluate(() => {
    const frame = document.createElement("iframe"); document.body.append(frame);
    (window as any).drainResponse = frame.contentWindow!.fetch("/api/c1-drain-probe").then(response => response.json());
  });
  await started;
  let removing = false;
  const unrouteAll = page.unrouteAll.bind(page);
  page.unrouteAll = options => { removing = true; return unrouteAll(options); };
  const finishing = finishFixtureRoutes(page);
  try {
    await page.evaluate(() => true);
    expect(removing, "interception must remain installed while its callback is held").toBe(false);
  }
  finally { release(); }
  await finishing;
  expect(await page.evaluate(() => (window as any).drainResponse)).toEqual({ settled: true });
});

const id = () => randomUUID();
function fixture(actor = 71, assigned = true) {
  const jobId = id(), customerId = id(), systemKey = "co2_fire_extinguisher";
  const findings = [0, 1].map(i => ({ findingId: id(), sourceFingerprint: String(i + 1).repeat(64), sourceRevision: "a".repeat(64), eligibility: "eligible", reviewSequence: 0, reviews: [], history: [] as any[],
    original: { jobId, systemKey, fieldPath: `checks.part${i}`, responsePath: `checks.part${i}.result`, result: "poor", remark: `Immutable original remark ${i}`, template: { id: id(), code: "MFE-FSSR", version: 1 }, contractSha256: "b".repeat(64),
      beforePhotoMissing: true, beforePhoto: null as any, beforePhotoLabel: "Historical finding: no original Before photo", formInstanceId: id(), sourceClientUuid: id(), rowUuid: null,
      caption: `Failed part ${i}`, sectionLabel: "Cylinder Checks", fieldLabel: `Failed Part ${i}`, unit: { label: "Unit A" }, sourceJob: { id: jobId, reference: "SV-C1-ORIGINAL", title: "Original accepted visit" },
      instanceKey: "primary", locationId: null, zoneId: null, configuration: { revisionId: id(), revisionNumber: 1 }, customer: { id: customerId, code: "C1", displayName: "C1 Customer" }, site: null, system: "CO2", instance: null } }));
  const workOrders = assigned ? [{ workOrderId: id(), jobId, systemKey, assignedToUserId: actor, revision: 1, status: "active" }] : [];
  return { jobId, systemKey, findings, workOrders };
}
type Service = ReturnType<typeof fixture>;
const summary = (s: Service) => ({ jobId: s.jobId, systemKey: s.systemKey, sourceJob: s.findings[0].original.sourceJob, customer: s.findings[0].original.customer, site: null, systemLabel: "CO2" });
async function boot(page: Page, s: Service, actor = 71, deep = "") {
  await fixtureRoute(page, "**/api/**", async r => {
    if (!(await page.evaluate(() => navigator.onLine))) return r.abort("internetdisconnected");
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/me") return r.fulfill({ json: { user: { id: actor, username: `c1-${actor}`, role: "inspector" } } });
    // The App's ordinary workspace fetches are deliberately empty/unavailable; no production data.
    if (path === "/api/health") return r.fulfill({ json: { status: "ok" } });
    return r.fulfill({ status: 503, json: { error: "C1_FIXTURE_UNAVAILABLE" } });
  });
  await fixtureRoute(page, "**/api/repairs/services", async r => {
    if (!(await page.evaluate(() => navigator.onLine))) return r.abort("internetdisconnected");
    return r.fulfill({ json: { services: [summary(s)] } });
  });
  await fixtureRoute(page, `**/api/repairs/services/${s.jobId}/${s.systemKey}`, async r => {
    if (!(await page.evaluate(() => navigator.onLine))) return r.abort("internetdisconnected");
    return r.fulfill({ json: s });
  });
  await page.goto(`/tests/repair-c1.html${deep}`);
  await page.waitForFunction(() => (window as any).c1Ready && navigator.serviceWorker.controller);
  await page.reload(); // Cache the harness shell/modules under the test worker before offline proof.
  await page.waitForFunction(() => (window as any).c1Ready);
  await chooseTechnician(page);
}
async function chooseTechnician(page: Page) {
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".app-sidebar")).toBeVisible().catch(async () => { await expect(page.locator(".app-mobile-navigation")).toBeVisible(); });
}
async function open(page: Page, s: Service, part?: string) {
  await page.evaluate(({ s, part }) => { location.hash = (window as any).c1.ui.repairServiceHref(s.jobId, s.systemKey, part); }, { s, part });
  await expect(page.getByRole("heading", { name: "C1 Customer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Repair", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download for Offline" })).toBeEnabled();
}
const part = (page: Page, i = 0) => page.getByRole("article", { name: `Failed part: Failed Part ${i}` });
async function start(page: Page, i = 0) { await part(page, i).getByRole("button", { name: "Start Repair", exact: true }).click(); await expect(part(page, i).getByLabel("Repair Remark (Required)")).toBeVisible(); }
async function image(page: Page) { return Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 80; c.height = 60; const x = c.getContext("2d")!; x.fillStyle = "#125788"; x.fillRect(0, 0, 80, 60); return c.toDataURL("image/png").split(",")[1]; }), "base64"); }
async function fill(page: Page, i = 0, remark = "Replaced damaged part") {
  await part(page, i).getByLabel("Repair Remark (Required)").fill(remark);
  await expect(part(page, i).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
  await part(page, i).getByLabel("Choose this part's After photo").setInputFiles({ name: `own-${i}.png`, mimeType: "image/png", buffer: await image(page) });
  await expect(part(page, i).locator(".repair-after").getByRole("status")).toHaveText("After photo saved on this device.");
}
async function records(page: Page) { return page.evaluate(() => (window as any).c1.db.localDatabase.repairRecords.toArray()); }
async function reconnectReceipts(page: Page, actor = 71) {
  const calls: string[] = [];
  await fixtureRoute(page, "**/api/repairs/evidence/stage", async r => {
    const input = JSON.parse(r.request().postDataBuffer()!.toString().match(/name="metadata"\r\n\r\n([^\r]+)/)![1]);
    calls.push(`photo:${input.repairUuid}`);
    await r.fulfill({ json: { photoUuid: input.photoUuid, repairUuid: input.repairUuid, requestFingerprint: fingerprint({ actorId: actor, ...input }), sourceSha256: input.sourceSha256, storedSha256: "f".repeat(64), findingId: input.findingId, workOrderId: input.workOrderId, jobId: input.jobId, systemKey: input.systemKey } });
  });
  await fixtureRoute(page, "**/api/repairs/submissions", async r => {
    const body = r.request().postDataJSON(), p = body.parts[0]; calls.push(`parent:${p.clientUuid}`);
    await r.fulfill({ json: { jobId: body.jobId, systemKey: body.systemKey, results: [{ clientUuid: p.clientUuid, outcome: "submitted", receipt: { clientUuid: p.clientUuid, requestFingerprint: fingerprint({ actorId: actor, ...p }), findingId: p.findingId, workOrderId: p.workOrderId, jobId: p.jobId, systemKey: p.systemKey, cycleSequence: p.cycleSequence, predecessorUuid: p.predecessorUuid, sourceRevision: p.expectedSourceRevision } }] } });
  });
  return calls;
}

for (const size of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`C1 production App navigation, deep links, layout and validation ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size); const s = fixture(72); await boot(page, s, 72);
    if (size.width < 768) { await page.locator(".app-mobile-navigation summary").click(); await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "Repair List", exact: true }).click(); }
    else await page.locator(".app-sidebar").getByRole("button", { name: "Repair List", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open CO2 Repairs" })).toBeVisible();
    await page.getByRole("link", { name: "Open CO2 Repairs" }).click();
    await expect(page.getByRole("heading", { name: "Unit A · Cylinder Checks" })).toBeVisible();
    await expect(page.getByText("Work order assigned to Technician #72", { exact: false })).toBeVisible();
    await start(page); await part(page).getByRole("button", { name: "Submit Locally" }).click();
    await expect(part(page).getByText("Enter a nonblank repair remark for this part.")).toBeVisible();
    await expect(part(page).getByText("Save one own After photo for this part.")).toBeVisible();
    await expect(part(page).getByLabel("Repair Remark (Required)")).toBeFocused();
    expect(await part(page).getByLabel("Repair Remark (Required)").evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
    expect(await part(page).getByLabel("Repair Remark (Required)").evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await part(page).getByLabel("Repair Remark (Required)").fill("  ");
    await part(page).getByRole("button", { name: "Submit Locally" }).click();
    expect((await records(page))[0].syncStatus).toBe("Draft");
    expect(await part(page).locator(".repair-before textarea, .repair-before input").count()).toBe(0);
    await expect(part(page).locator(".repair-before")).toContainText("Immutable original remark 0");
    await expect(part(page).locator(".repair-before")).toContainText("Historical finding: no original Before photo.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const targets = await page.locator(".repair-page button, .repair-page summary, .repair-link").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
    expect(targets.every(t => t.w >= 44 && t.h >= 44)).toBe(true);
    const columns = await page.locator(".repair-comparison").first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(size.width >= 768 ? 2 : 1);
    await page.screenshot({ path: `../../logs/cr09-c1-${size.width}.png`, fullPage: true });
    await part(page, 1).getByRole("link", { name: "Failed Part 1", exact: true }).click();
    await expect(part(page, 0)).toHaveCount(0); await expect(part(page, 1)).toBeVisible();
    await page.reload(); await chooseTechnician(page); await expect(part(page, 1)).toBeVisible();
  });
}

test("C1 offline typing, gallery capture, save/reload/local Submit and evidence-first reconnect use B3", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page); await context.setOffline(true);
  await fill(page); await part(page).getByRole("button", { name: "Save Draft" }).click();
  await expect(part(page).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
  const draft = (await records(page))[0];
  await page.reload(); await chooseTechnician(page);
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(draft.remark);
  await expect(part(page).getByAltText("This repair's own After photo")).toBeVisible();
  await part(page).getByRole("button", { name: "Submit Locally" }).click();
  await expect(part(page)).toContainText("Pending Sync"); await expect(part(page)).toContainText("Not submitted to server");
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveCount(0);
  const frozen = (await records(page))[0];
  await page.reload(); await chooseTechnician(page); expect((await records(page))[0]).toEqual(frozen);
  const calls = await reconnectReceipts(page); await context.setOffline(false);
  // Online event verifies the same actor and resumes the App's coordinator.
  await expect.poll(async () => (await records(page))[0].syncStatus, { timeout: 30000 }).toBe("Synced");
  // Open filter: an awaiting-approval part leaves the default Open list and is reachable with Show completed.
  await expect(part(page)).toHaveCount(0);
  await page.getByLabel("Show completed").check();
  await expect(part(page)).toContainText("Awaiting Approval");
  await expect(part(page)).toContainText("Refresh server history to confirm the latest submitted cycle");
  await expect(part(page).getByRole("button", { name: "Start Repair", exact: true })).toHaveCount(0);
  await expect(part(page).getByRole("button", { name: "Start Another Repair", exact: true })).toHaveCount(0);
  expect(calls.indexOf(`photo:${frozen.clientUuid}`)).toBeLessThan(calls.indexOf(`parent:${frozen.clientUuid}`));
  expect((await records(page))[0].frozen).toEqual(frozen.frozen);
  await expect(part(page).locator(".repair-before")).toContainText("Immutable original remark 0");
});

test("C1 offline camera through the existing dialog saves own After, traps focus and stops streams", async ({ page, context }) => {
  await page.addInitScript(() => {
    (window as any).c1Streams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 60;
      const stream = canvas.captureStream(10); (window as any).c1Streams.push(stream);
      setTimeout(() => { const x = canvas.getContext("2d")!; x.fillStyle = "#416288"; x.fillRect(0, 0, 80, 60); }, 20);
      return stream;
    };
  });
  const s = fixture(); await boot(page, s); await open(page, s); await start(page); await context.setOffline(true);
  await part(page).getByRole("button", { name: "Take After Photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Take Photo", exact: true });
  await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(part(page).getByAltText("This repair's own After photo")).toBeVisible();
  const photo = await page.evaluate(async () => { const db = (window as any).c1.db.localDatabase, a = (await db.repairAttachments.toArray())[0];
    return { source: a.captureSource, size: a.blob.size, stopped: (window as any).c1Streams.every(s => s.getTracks().every(t => t.readyState === "ended")) }; });
  expect(photo.source).toBe("camera"); expect(photo.size).toBeGreaterThan(0); expect(photo.stopped).toBe(true);
  await expect(part(page).getByRole("button", { name: "Take After Photo" })).toBeFocused();
  await part(page).getByRole("button", { name: "Take After Photo" }).click();
  await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeEnabled();
  await context.setOffline(false);
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).c1Streams.every(s => s.getTracks().every(t => t.readyState === "ended")))).toBe(true);
  await expect(part(page).getByAltText("This repair's own After photo")).toBeVisible();
});

test("C1 source Needs Review and revoked/expired cache still allow independent offline local work", async ({ page, context }) => {
  // Drafts are started while the order is active; the order is then revoked in the local cache (new drafts are gated, existing ones are not).
  const s = fixture(); s.findings[0].eligibility = "needs_review";
  await boot(page, s); await open(page, s); await start(page); await start(page, 1);
  await context.setOffline(true);
  await expect(page.locator(".repair-page")).toContainText("Offline or unverified");
  await page.evaluate(async () => { await (window as any).c1.db.localDatabase.repairWorkOrders.toCollection().modify({ status: "revoked", expiresAt: "2020-01-01T00:00:00.000Z" });
    await (window as any).c1.db.localDatabase.repairFindings.toCollection().modify({ expiresAt: "2020-01-01T00:00:00.000Z" }); });
  await expect(part(page)).toContainText("Cache expired"); await fill(page);
  await part(page, 1).getByLabel("Repair Remark (Required)").fill("Own remark without own photo");
  await part(page, 1).getByRole("button", { name: "Submit Locally" }).click();
  await expect(part(page, 1).getByText("Save one own After photo for this part.")).toBeVisible();
  await part(page).getByRole("button", { name: "Submit Locally" }).click();
  await expect(part(page)).toContainText("Pending Sync"); await expect(part(page)).toContainText("Needs Review"); await expect(part(page)).toContainText("Cache expired");
  const all = await records(page); expect(all.find(r => r.findingId === s.findings[0].findingId).syncStatus).toBe("Pending");
  expect(all.find(r => r.findingId === s.findings[1].findingId).syncStatus).toBe("Draft");
  const snapshot = await page.evaluate(() => (window as any).c1.db.localDatabase.syncOutbox.toArray()); expect(snapshot.filter(o => o.entityType.startsWith("repair"))).toHaveLength(2);
});

test("C1 cached revoked order blocks new drafts but existing draft stays editable offline; Start Repairs stays available to ask the server", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s);
  // Active order: unchanged behavior, Start Repair offered, Start Repairs hidden.
  await expect(page.getByRole("button", { name: "Start Repairs", exact: true })).toHaveCount(0);
  await start(page);
  await context.setOffline(true);
  await page.evaluate(async () => { await (window as any).c1.db.localDatabase.repairWorkOrders.toCollection().modify({ status: "revoked" }); });
  const revoked = page.getByRole("alert").filter({ hasText: "Ask Manager to restore access" });
  await expect(revoked).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Repair", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Another Repair", exact: true })).toHaveCount(0);
  await expect(part(page, 1).getByRole("button", { name: "Not Done", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Repairs", exact: true })).toHaveCount(1);
  // Existing local draft stays editable and Save Draft works.
  await part(page).getByLabel("Repair Remark (Required)").fill("Edited after revoke");
  await part(page).getByRole("button", { name: "Save Draft" }).click();
  await expect(part(page).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
  const all = await records(page); expect(all).toHaveLength(1); expect(all[0].remark).toBe("Edited after revoke");
  // Gating survives reload; still no draft for the other part.
  await page.reload(); await chooseTechnician(page);
  await expect(page.getByRole("alert").filter({ hasText: "Ask Manager to restore access" })).toBeVisible();
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue("Edited after revoke");
  await expect(page.getByRole("button", { name: "Start Repair", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Repairs", exact: true })).toHaveCount(1);
});

test("C1 list authority adapter rejects malformed lists and suppresses old in-flight replacement", async ({ page }) => {
  const s = fixture(); await boot(page, s); await open(page, s);
  const prior = await page.evaluate(() => (window as any).c1.ui.refreshRepairList());
  await fixtureRoute(page, "**/api/repairs/services", r => r.fulfill({ json: { services: [{ ...summary(s), customer: { id: true, displayName: ["foreign"], code: "bad" } }] } }));
  const failure = await page.evaluate(async () => { try { await (window as any).c1.ui.refreshRepairList(); } catch(e) { return e.message; } });
  expect(failure).toBe("INVALID_REPAIR_AUTHORITY");
  expect(await page.evaluate(async () => (await (window as any).c1.db.localDatabase.referenceData.get((window as any).c1.ui.REPAIR_LIST_CACHE)).payload.services)).toEqual(prior);
  let release: () => void; const hold = new Promise<void>(resolve => release = resolve); let count = 0;
  await fixtureRoute(page, "**/api/repairs/services", async r => { const first = ++count === 1; if (first) await hold; await r.fulfill({ json: { services: first ? [summary(s)] : [] } }); });
  await page.evaluate(() => { (window as any).c1Slow = (window as any).c1.ui.refreshRepairList().catch(e => e.message); });
  await expect.poll(() => count).toBe(1);
  await page.evaluate(() => (window as any).c1.ui.refreshRepairList()); release!();
  expect(await page.evaluate(() => (window as any).c1Slow)).toBe("REPAIR_REFRESH_SUPERSEDED");
  expect(await page.evaluate(async () => (await (window as any).c1.db.localDatabase.referenceData.get((window as any).c1.ui.REPAIR_LIST_CACHE)).payload.services)).toEqual([]);
});

test("C1 repeated unit groups keep row identity and frozen number/location labels", async ({ page }) => {
  const s = fixture();
  for (const f of s.findings) { const rowUuid = id(); f.original.rowUuid = rowUuid as any; f.original.unit = { rowUuid, displaySequence: 4, assetReference: "Valve A", locationText: "Pump Room" } as any; }
  await boot(page, s, 71, `#/repair-list/${s.jobId}/${s.systemKey}`);
  await expect(page.getByRole("heading", { name: "No. 4 · Valve A · Pump Room · Cylinder Checks", exact: true })).toHaveCount(2);
  expect(await page.locator(".repair-group > .repair-part").count()).toBe(2);
  await expect(part(page, 0)).toBeVisible(); await expect(part(page, 1)).toBeVisible();
});

test("C1 failed local autosave keeps typed edits with a route recovery guard and Save Draft retry", async ({ page }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page);
  await page.evaluate(() => {
    (window as any).c1FailHook = function(changes) { if (changes.remark) throw new Error("C1_LOCAL_SAVE_FAILURE"); };
    (window as any).c1.db.localDatabase.repairRecords.hook("updating", (window as any).c1FailHook);
  });
  await part(page).getByLabel("Repair Remark (Required)").fill("Keep these unsaved repair edits");
  await expect(part(page)).toContainText("Draft save failed; keep this form open and retry Save Draft.");
  let asked = false; page.once("dialog", async dialog => { asked = true; await dialog.dismiss(); });
  await page.getByRole("link", { name: "Back to Repair List", exact: true }).click();
  await expect.poll(() => asked).toBe(true);
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue("Keep these unsaved repair edits");
  await page.evaluate(() => (window as any).c1.db.localDatabase.repairRecords.hook("updating").unsubscribe((window as any).c1FailHook));
  await part(page).getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(part(page).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
  expect((await records(page))[0].remark).toBe("Keep these unsaved repair edits");
  await page.getByRole("link", { name: "Back to Repair List", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open CO2 Repairs" })).toBeVisible();
});

test("C1 failed-save edits survive offline/online and manual same-actor verification", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page);
  await page.evaluate(() => {
    (window as any).c1FailHook = function(changes) { if (changes.remark) throw new Error("C1_LOCAL_SAVE_FAILURE"); };
    (window as any).c1.db.localDatabase.repairRecords.hook("updating", (window as any).c1FailHook);
  });
  const text = "Keep failed-save edits through session verification";
  await part(page).getByLabel("Repair Remark (Required)").fill(text);
  await expect(part(page)).toContainText("Draft save failed; keep this form open and retry Save Draft.");
  await context.setOffline(true);
  await expect(page.locator(".repair-page")).toBeVisible();
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let verifying = false;
  await fixtureRoute(page, "**/api/auth/me", async r => {
    verifying = true; await hold;
    await r.fulfill({ json: { user: { id: 71, username: "c1-71", role: "inspector" } } });
  });
  await context.setOffline(false);
  await expect.poll(() => verifying).toBe(true);
  await expect(page.locator(".repair-page")).toBeHidden();
  release();
  await expect(page.locator(".repair-page")).toBeVisible();
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
  await expect(part(page)).toContainText("Draft save failed; keep this form open and retry Save Draft.");
  await page.getByRole("button", { name: "Verify Sign-in", exact: true }).click();
  await expect(page.locator(".repair-page")).toBeVisible();
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
  let asked = false; page.once("dialog", async d => { asked = true; await d.dismiss(); });
  await page.getByRole("link", { name: "Back to Repair List", exact: true }).click();
  await expect.poll(() => asked).toBe(true);
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
  await page.evaluate(() => (window as any).c1.db.localDatabase.repairRecords.hook("updating").unsubscribe((window as any).c1FailHook));
  await part(page).getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(part(page).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
  expect((await records(page))[0].remark).toBe(text);
});

for (const failure of ["503", "malformed-json"] as const) {
  for (const recoveredActor of [71, 72]) {
    test(`C1 failed-save edits survive ${failure} verification with account ${recoveredActor} recovery`, async ({ page }) => {
      const s = fixture(); await boot(page, s); await open(page, s); await start(page);
      await page.evaluate(() => {
        (window as any).c1FailHook = function(changes) { if (changes.remark) throw new Error("C1_LOCAL_SAVE_FAILURE"); };
        (window as any).c1.db.localDatabase.repairRecords.hook("updating", (window as any).c1FailHook);
      });
      const text = `Keep failed-save edits through ${failure}`;
      await part(page).getByLabel("Repair Remark (Required)").fill(text);
      await expect(part(page)).toContainText("Draft save failed; keep this form open and retry Save Draft.");
      await fixtureRoute(page, "**/api/auth/me", r => failure === "503"
        ? r.fulfill({ status: 503, json: { error: "AUTH_UNAVAILABLE" } })
        : r.fulfill({ status: 200, contentType: "application/json", body: "{broken" }));
      let repairRequests = 0;
      await fixtureRoute(page, "**/api/repairs/**", async r => { repairRequests++; await r.fulfill({ status: 403, json: { error: "FORBIDDEN" } }); });
      await page.getByRole("button", { name: "Verify Sign-in", exact: true }).click();
      await expect(page.getByRole("button", { name: "Try Again", exact: true })).toBeVisible();
      await expect(page.locator(".repair-page")).toBeHidden();
      await expect(page.locator(".repair-page").getByLabel("Repair Remark (Required)").first()).toHaveValue(text);
      expect(await page.locator(".app-shell-split").first().getAttribute("inert")).not.toBeNull();
      expect(repairRequests).toBe(0);
      expect((await records(page))[0].remark).toBe("");
      await fixtureRoute(page, "**/api/auth/me", r => r.fulfill({ json: { user: { id: recoveredActor, username: `c1-${recoveredActor}`, role: "inspector" } } }));
      await page.getByRole("button", { name: "Try Again", exact: true }).click();
      await expect(page.locator(".repair-page")).toBeVisible();
      expect(await page.evaluate(() => (window as any).c1.db.currentWorkspaceUserId())).toBe(recoveredActor);
      if (recoveredActor !== 71) {
        await expect(part(page)).toHaveCount(0);
        expect(await records(page)).toEqual([]);
        await expect(page.getByText(text, { exact: true })).toHaveCount(0);
        return;
      }
      await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
      let asked = false; page.once("dialog", async d => { asked = true; await d.dismiss(); });
      await page.getByRole("link", { name: "Back to Repair List", exact: true }).click();
      await expect.poll(() => asked).toBe(true);
      await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
      await page.evaluate(() => (window as any).c1.db.localDatabase.repairRecords.hook("updating").unsubscribe((window as any).c1FailHook));
      await part(page).getByRole("button", { name: "Save Draft", exact: true }).click();
      await expect(part(page).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
      expect((await records(page))[0].remark).toBe(text);
    });
  }
}

test("C1 cancelled second sign-out confirmation retains the failed-save navigation guard", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page); await start(page, 1);
  await context.setOffline(true); await fill(page, 1);
  await part(page, 1).getByRole("button", { name: "Submit Locally" }).click();
  await expect(part(page, 1)).toContainText("Pending Sync");
  await page.evaluate(() => {
    (window as any).c1FailHook = function(changes) { if (changes.remark) throw new Error("C1_LOCAL_SAVE_FAILURE"); };
    (window as any).c1.db.localDatabase.repairRecords.hook("updating", (window as any).c1FailHook);
  });
  const text = "Keep edits after cancelling sign-out";
  await part(page).getByLabel("Repair Remark (Required)").fill(text);
  await expect(part(page)).toContainText("Draft save failed; keep this form open and retry Save Draft.");
  const dialogs: string[] = [];
  const answer = async (d: import("@playwright/test").Dialog) => {
    dialogs.push(d.message()); if (dialogs.length === 1) await d.accept(); else await d.dismiss();
  };
  page.on("dialog", answer);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[0]).toContain("Repair edits have not saved");
  expect(dialogs[1]).toContain("submitted");
  await page.getByRole("link", { name: "Back to Repair List", exact: true }).click();
  await expect.poll(() => dialogs.length).toBe(3);
  await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue(text);
  expect((await records(page)).find(r => r.findingId === s.findings[0].findingId).remark).toBe("");
  page.off("dialog", answer);
  await page.evaluate(() => (window as any).c1.db.localDatabase.repairRecords.hook("updating").unsubscribe((window as any).c1FailHook));
  await part(page).getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(part(page).locator(".repair-after").getByRole("status")).toHaveText("Saved on this device.");
  page.on("dialog", async d => { await d.accept(); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Choose sign-in role", { exact: true })).toBeVisible();
  await expect(page.locator(".repair-page")).toHaveCount(0);
});

test("C1 verification hides retained editors and a different actor cannot inherit them", async ({ page }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page);
  await fill(page, 0, "Account 71 private repair text");
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let verifying = false;
  await fixtureRoute(page, "**/api/auth/me", async r => {
    verifying = true; await hold;
    await r.fulfill({ json: { user: { id: 72, username: "c1-72", role: "inspector" } } });
  });
  let repairRequests = 0;
  await fixtureRoute(page, "**/api/repairs/**", async r => { repairRequests++; await r.fulfill({ status: 403, json: { error: "FORBIDDEN" } }); });
  await page.getByRole("button", { name: "Verify Sign-in", exact: true }).click();
  await expect.poll(() => verifying).toBe(true);
  await expect(page.locator(".repair-page")).toBeHidden();
  expect(await page.locator(".app-shell-split").first().getAttribute("inert")).not.toBeNull();
  expect(repairRequests).toBe(0);
  release();
  await expect(page.locator(".repair-page")).toBeVisible();
  await expect(part(page)).toHaveCount(0);
  expect(await records(page)).toEqual([]);
  expect(await page.evaluate(() => (window as any).c1.db.currentWorkspaceUserId())).toBe(72);
  await expect(page.getByText("Account 71 private repair text", { exact: true })).toHaveCount(0);
});

test("C1 immutable remote history verifies After identity/bytes and displays the rejection reason", async ({ page }) => {
  const s = fixture(), f = s.findings[0], u = id(), workOrderId = s.workOrders[0].workOrderId;
  const at = "2026-10-13T01:02:03.123Z";
  const h = { client_uuid: u, cycle_sequence: 1, predecessor_uuid: null, remark: "Previous repair", performed_at: at, submitted_by_user_id: 72, review_state: "rejected" }; f.history.push(h);
  await boot(page, s, 71, `#/repair-list/${s.jobId}/${s.systemKey}`);
  const jpeg = await page.evaluate(async () => { const c = document.createElement("canvas"); c.width = 80; c.height = 60; const b = await new Promise<Blob>(resolve => c.toBlob(x => resolve(x!), "image/jpeg")); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  const bytes = Buffer.from(jpeg), digest = createHash("sha256").update(bytes).digest("hex"), photoUuid = id();
  const detail = { receipt: { clientUuid: u, findingId: f.findingId, workOrderId, jobId: s.jobId, systemKey: s.systemKey, cycleSequence: 1, predecessorUuid: null, requestFingerprint: "d".repeat(64), sourceRevision: f.sourceRevision },
    remark: h.remark, performedAt: at, submittedAt: at, submittedByUserId: 72, reviewState: "rejected", manifest: [{ photoUuid, fieldPath: f.original.fieldPath, sourceSha256: digest }],
    evidence: { photoUuid, repairUuid: u, findingId: f.findingId, workOrderId, jobId: s.jobId, systemKey: s.systemKey, requestFingerprint: "e".repeat(64), sourceSha256: digest, storedSha256: digest },
    decisions: [{ requestId: id(), requestFingerprint: "c".repeat(64), decisionId: id(), clientUuid: u, sequence: 1, decision: "rejected", reason: "Replace the leaking seal", decidedAt: at, decidedByUserId: 9, decidedByRole: "admin" }] };
  let corrupt = true;
  await fixtureRoute(page, `**/api/repairs/records/${u}`, r => r.fulfill({ json: corrupt ? { ...detail, receipt: { ...detail.receipt, findingId: id() } } : detail }));
  await fixtureRoute(page, `**/api/repairs/records/${u}/after/content`, r => r.fulfill({ body: bytes, contentType: "image/jpeg" }));
  await part(page).locator(".repair-history summary").click();
  await part(page).getByRole("button", { name: "View Submitted Detail / After Online" }).click();
  await expect(part(page).locator(".repair-history")).toContainText("INVALID_REPAIR_HISTORY"); await expect(part(page).getByAltText("Submitted After photo for cycle 1")).toHaveCount(0);
  corrupt = false; await part(page).getByRole("button", { name: "View Submitted Detail / After Online" }).click();
  await expect(part(page).getByAltText("Submitted After photo for cycle 1")).toBeVisible(); await expect(part(page).locator(".repair-history")).toContainText("Replace the leaking seal");
  detail.reviewState = "approved"; detail.decisions[0].decision = "approved"; detail.decisions[0].reason = null as any;
  await part(page).getByRole("button", { name: "View Submitted Detail / After Online" }).click();
  await expect(part(page).locator(".repair-history")).toContainText("Approved · Reviewer #9");
  expect(await records(page)).toEqual([]);
});

test("C1 self-service Start Repairs persists mutation UUIDs across response loss and validates receipt", async ({ page }) => {
  const s = fixture(71, false); await boot(page, s, 71, `#/repair-list/${s.jobId}/${s.systemKey}`);
  await expect(page.getByRole("button", { name: "Start Repairs", exact: true })).toBeEnabled();
  const requests: any[] = []; let lose = true;
  await fixtureRoute(page, "**/api/repairs/work-orders/self-start", async r => {
    const b = r.request().postDataJSON(); requests.push(b);
    if (lose) { lose = false; return r.abort("timedout"); }
    s.workOrders.push({ workOrderId: b.workOrderId, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: 71, revision: 1, status: "active" });
    await r.fulfill({ json: { ...b, requestFingerprint: fingerprint({ actorId: 71, mode: "self", ...b }), assignedToUserId: 71, revision: 1, status: "active" } });
  });
  await page.getByRole("button", { name: "Start Repairs", exact: true }).click();
  await expect(page.locator(".repair-page")).toContainText("Authority refresh failed");
  await page.getByRole("button", { name: "Start Repairs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Repair", exact: true }).first()).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  await start(page); expect((await records(page))[0].workOrderId).toBe(requests[0].workOrderId);
});

test("C1 download labels distinguish legitimate history, not downloaded, verified cache and corruption", async ({ page }) => {
  const s = fixture(); await boot(page, s); await open(page, s);
  const jpeg = await page.evaluate(async () => { const c = document.createElement("canvas"); c.width = 80; c.height = 60;
    const b = await new Promise<Blob>(resolve => c.toBlob(x => resolve(x!), "image/jpeg")); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  const bytes = Buffer.from(jpeg), hash = createHash("sha256").update(bytes).digest("hex");
  const f = s.findings[0]; f.original.beforePhotoMissing = false; f.original.beforePhoto = { photoUuid: id(), fieldPath: f.original.fieldPath, sourceSha256: hash, storedSha256: hash, sizeBytes: bytes.length, width: 80, height: 60 };
  await page.getByRole("button", { name: "Refresh Authority", exact: true }).click();
  await expect(part(page).locator(".repair-before")).toContainText("Original Before photo not downloaded.");
  await expect(part(page, 1).locator(".repair-before")).toContainText("Historical finding: no original Before photo.");
  await fixtureRoute(page, `**/api/repairs/findings/${f.findingId}/before/content`, r => r.fulfill({ body: bytes, contentType: "image/jpeg" }));
  await page.getByRole("button", { name: "Download for Offline" }).click();
  await expect(part(page).getByAltText("Original accepted Before photo")).toBeVisible();
  await page.evaluate(async fid => { await (window as any).c1.db.localDatabase.repairBeforePhotos.update(fid, { photoUuid: crypto.randomUUID() }); }, f.findingId);
  await page.getByRole("button", { name: "Refresh Authority", exact: true }).click();
  await expect(part(page).locator(".repair-before")).toContainText("Original Before photo integrity failure.");
  expect(await page.evaluate(async fid => (await (window as any).c1.db.localDatabase.repairBeforePhotos.get(fid)).blob.size, f.findingId)).toBe(bytes.length);
  await page.getByRole("button", { name: "Download for Offline" }).click(); await expect(part(page).getByAltText("Original accepted Before photo")).toBeVisible();
});

test("C1 assignment/source/auth failures preserve drafts, frozen records, operations and Blobs with recovery", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page); await start(page, 1);
  await context.setOffline(true); await fill(page); await fill(page, 1, "Second part remains a draft");
  await part(page).getByRole("button", { name: "Submit Locally" }).click();
  await expect(part(page)).toContainText("Pending Sync");
  const before = await page.evaluate(async () => { const db = (window as any).c1.db.localDatabase; return { records: await db.repairRecords.toArray(), ops: await db.syncOutbox.toArray(), blobs: (await db.repairAttachments.toArray()).map(a => ({ id: a.photoUuid, size: a.blob.size, hash: a.sourceSha256 })) }; });
  await context.setOffline(false);
  for (const code of ["STALE_WORK_ORDER", "STALE_SOURCE_REVIEW", "AUTH_REQUIRED"]) {
    await fixtureRoute(page, "**/api/repairs/evidence/stage", r => r.fulfill({ status: code === "AUTH_REQUIRED" ? 401 : 409, json: { error: code } }));
    await expect(page.getByRole("button", { name: "Sync / Retry" })).toBeEnabled(); await page.getByRole("button", { name: "Sync / Retry" }).click();
    await expect(part(page)).toContainText(code); await expect(part(page)).toContainText("retained");
  }
  await fixtureRoute(page, `**/api/repairs/services/${s.jobId}/${s.systemKey}`, r => r.fulfill({ status: 404, json: { error: "REPAIR_NOT_FOUND" } }));
  await page.getByRole("button", { name: "Refresh Authority", exact: true }).click();
  await expect(page.locator(".repair-page")).toContainText("Cached authority is informational");
  await expect(part(page, 1).getByLabel("Repair Remark (Required)")).toBeEnabled();
  await expect(part(page, 1).getByRole("button", { name: "Submit Locally" })).toBeEnabled();
  const after = await page.evaluate(async () => { const db = (window as any).c1.db.localDatabase; return { records: await db.repairRecords.toArray(), ops: await db.syncOutbox.toArray(), blobs: (await db.repairAttachments.toArray()).map(a => ({ id: a.photoUuid, size: a.blob.size, hash: a.sourceSha256 })) }; });
  expect(after.records.map(r => ({ id: r.clientUuid, remark: r.remark, frozen: r.frozen, photo: r.photoUuid }))).toEqual(before.records.map(r => ({ id: r.clientUuid, remark: r.remark, frozen: r.frozen, photo: r.photoUuid })));
  expect(after.ops.map(o => ({ id: o.operationId, payload: o.payload }))).toEqual(before.ops.map(o => ({ id: o.operationId, payload: o.payload })));
  expect(after.blobs).toEqual(before.blobs);
  await page.getByRole("button", { name: "Verify Sign-in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repair List", exact: true })).toBeVisible();
  await expect(part(page, 1).getByLabel("Repair Remark (Required)")).toHaveValue("Second part remains a draft");
});

test("C1 rejected revision and approved repeat use explicit new UUID lineage and retained immutable history", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s); await start(page);
  await context.setOffline(true); await fill(page); await part(page).getByRole("button", { name: "Submit Locally" }).click();
  await reconnectReceipts(page); await context.setOffline(false);
  await expect.poll(async () => (await records(page))[0].syncStatus, { timeout: 30000 }).toBe("Synced");
  let prior = (await records(page))[0]; const originals: any[] = [];
  for (const decision of ["rejected", "approved"]) {
    originals.push(prior);
    s.findings[0].history.push({ client_uuid: prior.clientUuid, cycle_sequence: prior.cycleSequence, predecessor_uuid: prior.predecessorUuid, remark: prior.remark, performed_at: prior.performedAt, submitted_by_user_id: 71, review_state: decision });
    await page.getByRole("button", { name: "Refresh Authority", exact: true }).click();
    // A rejected part is Open again; an approved part is completed and shown only with Show completed.
    if (decision === "approved") await page.getByLabel("Show completed").check();
    await expect(part(page).getByRole("button", { name: "Start Another Repair" })).toBeVisible();
    await part(page).getByRole("button", { name: "Start Another Repair" }).click();
    await expect(part(page).getByLabel("Repair Remark (Required)")).toHaveValue("");
    const next = (await records(page)).find(r => r.syncStatus === "Draft"); expect(next.clientUuid).not.toBe(prior.clientUuid); expect(next.predecessorUuid).toBe(prior.clientUuid); expect(next.cycleSequence).toBe(prior.cycleSequence + 1); expect(next.photoUuid).toBeUndefined();
    await part(page).locator(".repair-history summary").click();
    await expect(part(page).locator(".repair-history")).toContainText(prior.remark);
    await expect(part(page).locator(".repair-before")).toContainText("Immutable original remark 0");
    if (decision === "rejected") {
      await context.setOffline(true); await fill(page, 0, "Revision repaired after rejection"); await part(page).getByRole("button", { name: "Submit Locally" }).click(); await context.setOffline(false);
      await expect.poll(async () => (await records(page)).find(r => r.clientUuid === next.clientUuid).syncStatus, { timeout: 30000 }).toBe("Synced");
      prior = (await records(page)).find(r => r.clientUuid === next.clientUuid);
    }
  }
  const all = await records(page); for (const old of originals) expect(all.find(r => r.clientUuid === old.clientUuid).frozen).toEqual(old.frozen);
  expect(await page.evaluate(() => (window as any).c1.db.localDatabase.repairAttachments.count())).toBe(2);
});

// ---- Technician self-service Repair List (no manager assignment needed) ----
const otherTechHistory = (state: string, n = 1) => ({ client_uuid: id(), cycle_sequence: n, predecessor_uuid: null, remark: "Repaired earlier by another technician", performed_at: "2026-10-15T01:02:03.000Z", submitted_by_user_id: 99, review_state: state });

test("Self-service: Open filter hides approved/awaiting parts, rejected stays Open, counters follow the same rule", async ({ page }) => {
  const s = fixture(); s.findings[0].history.push(otherTechHistory("rejected")); s.findings[1].history.push(otherTechHistory("approved"));
  await boot(page, s);
  await page.evaluate(() => { location.hash = "#/repair-list"; });
  await expect(page.getByRole("link", { name: "Open CO2 Repairs" })).toBeVisible();
  await page.evaluate(async s => { await (window as any).c1.repo.downloadRepairService(s.jobId, s.systemKey, false); }, s);
  await expect(page.locator(".repair-service-card")).toContainText("Open: 1 of 2");
  await expect(page.locator(".repair-service-card")).toContainText("Rejected: 1");
  await expect(page.locator(".repair-service-card")).toContainText("Approved: 1");
  await page.getByRole("link", { name: "Open CO2 Repairs" }).click();
  await expect(part(page, 0)).toBeVisible();
  await expect(part(page, 1)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Open parts: 1 of 2" })).toBeVisible();
  await page.getByLabel("Show completed").check();
  await expect(part(page, 1)).toBeVisible();
  await expect(part(page, 1)).toContainText("Approved");
  await expect(part(page, 1).getByText("Original visit: SV-C1-ORIGINAL")).toBeVisible();
  await page.getByLabel("Show completed").uncheck();
  await expect(part(page, 1)).toHaveCount(0);
});

test("Self-service: Not Done is local-only, keeps the part Open, survives reload and sign-out, is scoped to its actor and never calls the server", async ({ page }) => {
  const s = fixture(); const writes: string[] = [];
  await boot(page, s); await open(page, s);
  page.on("request", r => { if (r.method() !== "GET" && r.url().includes("/api/repairs/")) writes.push(r.url()); });
  await part(page, 0).getByRole("button", { name: "Not Done", exact: true }).click();
  await part(page, 0).getByLabel("Reason not repaired (optional)").fill("No ladder on site");
  await part(page, 0).getByRole("button", { name: "Save Not Done" }).click();
  await expect(part(page, 0)).toContainText("Not Done — No ladder on site");
  await expect(part(page, 0).getByRole("button", { name: "Start Repair", exact: true })).toBeVisible();
  const key = `repair-ui:status:${s.findings[0].findingId}`, key1 = `repair-ui:status:${s.findings[1].findingId}`;
  const stored = await page.evaluate(k => (window as any).c1.db.localDatabase.referenceData.get(k), key);
  expect(stored.payload).toMatchObject({ actorId: 71, findingId: s.findings[0].findingId, status: "not_done", reason: "No ladder on site" });
  // A marker written by another account for part 1 must never display for this actor.
  await page.evaluate(async f => { await (window as any).c1.db.localDatabase.referenceData.put({ key: `repair-ui:status:${f}`, version: "1", fetchedAt: "x", expiresAt: "x",
    payload: { actorId: 999, findingId: f, status: "not_done", reason: "Someone else", markedAt: "2026-10-15T00:00:00.000Z" } }); }, s.findings[1].findingId);
  await page.reload(); await chooseTechnician(page); await open(page, s);
  await expect(part(page, 0)).toContainText("Not Done — No ladder on site");
  await expect(part(page, 1)).not.toContainText("Not Done —");
  await expect(part(page, 1).getByRole("button", { name: "Not Done", exact: true })).toBeVisible();
  // Starting the repair (Done) clears the Not Done mark.
  await start(page, 0);
  await expect(part(page, 0)).not.toContainText("Not Done —");
  expect(await page.evaluate(k => (window as any).c1.db.localDatabase.referenceData.get(k), key)).toBeUndefined();
  // Part 1 gets a fresh marker, which must survive sign-out below.
  await part(page, 1).getByRole("button", { name: "Not Done", exact: true }).click();
  await part(page, 1).getByLabel("Reason not repaired (optional)").fill("No ladder on site");
  await part(page, 1).getByRole("button", { name: "Save Not Done" }).click();
  await expect(part(page, 1)).toContainText("Not Done — No ladder on site");
  // Signing out must not clear the actor's local marker: read the raw IndexedDB after sign-out.
  const dbName = await page.evaluate(() => (window as any).c1.db.localDatabase.name);
  page.on("dialog", async d => { await d.accept(); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Choose sign-in role", { exact: true })).toBeVisible();
  const raw = await page.evaluate(({ name, k }) => new Promise<any>((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const get = open.result.transaction("referenceData").objectStore("referenceData").get(k); get.onsuccess = () => { open.result.close(); resolve(get.result); }; get.onerror = () => reject(get.error); };
  }), { name: dbName, k: key1 });
  expect(raw.payload).toMatchObject({ actorId: 71, reason: "No ladder on site" });
  expect(writes).toEqual([]);
});

test("Self-service: a second device reuses the technician ACTIVE order; a receipt for another account is refused", async ({ page }) => {
  const s = fixture(71, false); const existing = id();
  await boot(page, s, 71, `#/repair-list/${s.jobId}/${s.systemKey}`);
  let override: Record<string, unknown> | undefined;
  await fixtureRoute(page, "**/api/repairs/work-orders/self-start", async r => {
    const b = r.request().postDataJSON();
    await r.fulfill({ json: { requestId: id(), workOrderId: existing, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: 71, revision: 1, status: "active", requestFingerprint: "c".repeat(64), ...override } });
  });
  override = { assignedToUserId: 72 };
  await expect(page.getByRole("button", { name: "Start Repairs", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start Repairs", exact: true }).click();
  await expect(page.locator(".repair-page")).toContainText("INVALID_REPAIR_RECEIPT");
  override = undefined; s.workOrders.push({ workOrderId: existing, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: 71, revision: 1, status: "active" });
  await page.getByRole("button", { name: "Start Repairs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Repair", exact: true }).first()).toBeVisible();
  await start(page); expect((await records(page))[0].workOrderId).toBe(existing);
});

test("Self-service: comparison sheet renders from IndexedDB with the network blocked and prints", async ({ page, context }) => {
  const s = fixture(); await boot(page, s); await open(page, s);
  await start(page, 0); await fill(page, 0, "Replaced the damaged hose");
  await part(page, 0).getByRole("button", { name: "Submit Locally" }).click();
  await expect(part(page, 0)).toContainText("Pending Sync");
  await part(page, 1).getByRole("button", { name: "Not Done", exact: true }).click();
  await part(page, 1).getByLabel("Reason not repaired (optional)").fill("Part on back-order");
  await part(page, 1).getByRole("button", { name: "Save Not Done" }).click();
  await expect(part(page, 1)).toContainText("Not Done — Part on back-order");
  await context.setOffline(true);
  const requests: string[] = []; page.on("request", r => { if (r.url().includes("/api/repairs/")) requests.push(r.url()); });
  await page.getByRole("link", { name: /Before \/ After Comparison/ }).click();
  await expect(page.getByRole("heading", { name: "Repair Comparison — Before / After" })).toBeVisible();
  const a = page.getByRole("article", { name: "Comparison: Failed Part 0" }), b = page.getByRole("article", { name: "Comparison: Failed Part 1" });
  await expect(a).toContainText("Local draft (not synced)");
  await expect(a).toContainText("Immutable original remark 0");
  await expect(a).toContainText("Repair remark: Replaced the damaged hose");
  await expect(a.getByAltText("This repair's own After photo")).toBeVisible();
  await expect(b).toContainText("Not repaired");
  await expect(b).toContainText("Reason: Part on back-order");
  await expect(page.getByText("Original visit SV-C1-ORIGINAL")).toBeVisible();
  await page.getByRole("checkbox", { name: /Failed Part 1/ }).uncheck();
  await expect(b).toHaveCount(0);
  await page.getByRole("checkbox", { name: /Failed Part 1/ }).check();
  await page.evaluate(() => { (window as any).printed = 0; window.print = () => { (window as any).printed++; }; });
  await page.getByRole("button", { name: "Print / Save as PDF" }).click();
  expect(await page.evaluate(() => (window as any).printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-header")).toBeHidden();
  await expect(page.locator(".app-sidebar")).toBeHidden();
  await expect(page.locator(".no-print").first()).toBeHidden();
  await expect(a).toBeVisible();
  expect(await a.evaluate(el => getComputedStyle(el).breakInside)).toBe("avoid");
  await page.emulateMedia({ media: "screen" });
  expect(requests).toEqual([]);
});

test("Self-service: a technician whose order was only reassigned away can start repairs again; a truly revoked one is refused by the server", async ({ page }) => {
  const s = fixture(); await boot(page, s); await open(page, s);
  await start(page, 0);
  s.workOrders.length = 0; // the server no longer lists the order for this technician
  await page.getByRole("button", { name: "Refresh Authority", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ask Manager to restore access" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Repair", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Repairs", exact: true })).toBeEnabled();
  // First the server refuses (a real revocation): the technician is told to ask the Manager and nothing is created.
  let revoked = true; const requests: any[] = [];
  await fixtureRoute(page, "**/api/repairs/work-orders/self-start", async r => {
    const b = r.request().postDataJSON(); requests.push(b);
    if (revoked) return r.fulfill({ status: 403, json: { error: "WORK_ORDER_REVOKED" } });
    s.workOrders.push({ workOrderId: b.workOrderId, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: 71, revision: 1, status: "active" });
    await r.fulfill({ json: { ...b, requestFingerprint: fingerprint({ actorId: 71, mode: "self", ...b }), assignedToUserId: 71, revision: 1, status: "active" } });
  });
  await page.getByRole("button", { name: "Start Repairs", exact: true }).click();
  await expect(page.locator(".repair-page")).toContainText("WORK_ORDER_REVOKED");
  await expect(page.getByRole("button", { name: "Start Repair", exact: true })).toHaveCount(0);
  // Then it was only a reassignment: the server accepts, the same persisted request is reused, and drafting works again.
  revoked = false;
  await page.getByRole("button", { name: "Start Repairs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Repair", exact: true }).first()).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
});
