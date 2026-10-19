import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Offline service visit creation through the real app: create with the server unreachable, open the visit and its
 * forms from the device, reload, reconnect and see the server's SV number replace the placeholder (exact UUID).
 * Also: a server refusal shows "Needs attention", and online creation is unchanged.
 */
const ids = {
  customer: "00000000-0000-4000-8000-000000009201", site: "00000000-0000-4000-8000-000000009202",
  revision: "00000000-0000-4000-8000-000000009203", template: "00000000-0000-4000-8000-000000009204",
  enabled: "00000000-0000-4000-8000-000000009205", zone: "00000000-0000-4000-8000-000000009206",
  location: "00000000-0000-4000-8000-000000009207", catalog: "00000000-0000-4000-8000-000000009208"
};
const customer = { id: ids.customer, code: "C-9201", displayName: "Phone Test Customer", isDemo: false };
const configuration = {
  customer,
  configuration: {
    configurationId: ids.revision, revision: 3, templateId: ids.template, templateCode: "MFE-FSSR", templateName: "Service Report",
    templateVersion: 7, selectionPolicy: "preset_only",
    enabledSystems: [{
      id: ids.enabled, key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed",
      zones: [{ id: ids.zone, enabledSystemId: ids.enabled, key: "z1", displayName: "Zone 1", sortOrder: 1 }],
      locations: [{ id: ids.location, enabledSystemId: ids.enabled, zoneId: ids.zone, key: "l1", displayName: "Level 1", presetRowCount: 2, rowPreset: {}, sortOrder: 1 }]
    }]
  }
};
const catalogTemplate = { id: ids.catalog, code: "MFE-FSSR", name: "Service Report", version: 1, selectionPolicy: "preset_only", headerDefinition: {}, reportBoilerplate: {}, systems: [] };

type Server = {
  reachable: boolean; createMode: "ok" | "refuse"; creates: Array<Record<string, unknown>>; serverJobs: unknown[];
};

async function install(page: Page, server: Server) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!server.reachable) return route.abort("connectionrefused");
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 9201, username: "tech", role: "inspector" } };
    else if (path === "/api/health") json = { status: "ok" };
    else if (path === "/api/inspection-catalog") json = { template: catalogTemplate, templates: [catalogTemplate] };
    else if (path === "/api/customers") json = { customers: [customer] };
    else if (path === `/api/customers/${ids.customer}/sites`) json = { sites: [{ id: ids.site, customerId: ids.customer, code: "S-1", displayName: "Main Site" }] };
    else if (path === `/api/customers/${ids.customer}/configuration`) json = configuration;
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/inspection-jobs" && request.method() === "GET") json = { jobs: server.serverJobs };
    else if (path === "/api/inspection-jobs/service-visits" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      server.creates.push(body);
      if (server.createMode === "refuse") return route.fulfill({ status: 409, json: { error: "SITE_INACTIVE", message: "Site is inactive." } });
      const visitDate = String(body.visitDate);
      return route.fulfill({ status: 201, json: {
        clientJobUuid: body.clientJobUuid, jobId: body.clientJobUuid, visitNumber: `SV-${visitDate.replaceAll("-", "")}-41`,
        configurationRevisionId: body.configurationRevisionId, deviceCreatedAt: body.deviceCreatedAt, visitDate,
        arrivalTime: body.arrivalTime, idempotent: false
      } });
    }
    await route.fulfill({ json });
  });
}

async function signIn(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".connection-state")).toHaveText("Online");
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function warmCaches(page: Page) {
  // Online first: opening the New Service Visit screen saves the customer's sites on the device.
  await page.getByRole("button", { name: "+ New Service Visit" }).click();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await expect(page.getByLabel("Site", { exact: true }).getByRole("option", { name: "Main Site" })).toBeAttached();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Back to My Jobs/ }).click();
}

async function createOffline(page: Page) {
  await page.getByRole("button", { name: "+ New Service Visit" }).click();
  await expect(page.getByText(/Offline — this visit is saved on this device/)).toBeVisible();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
  await page.getByRole("checkbox", { name: "Hose Reel" }).check();
  await page.getByLabel("Service Call No").fill("SC-OFF-1");
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Create Service Visit" }).click();
}

for (const width of [360, 768, 1280]) {
  test(`offline create at ${width}px: opens from the device, survives reload, syncs with the exact UUID`, async ({ page }) => {
    const server: Server = { reachable: true, createMode: "ok", creates: [], serverJobs: [] };
    await install(page, server);
    await signIn(page, width);
    await warmCaches(page);

    server.reachable = false;
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 8000 });
    await createOffline(page);

    // The visit opens straight away, from the device, with the placeholder instead of an SV number.
    await expect(page.getByRole("heading", { name: "Phone Test Customer" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("SV number given when synced").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Hose Reel/ })).toBeVisible();
    await expect(page.getByText("Pending sync")).toBeVisible();
    expect(server.creates).toHaveLength(0);
    const uuid = await page.evaluate(() => decodeURIComponent(location.hash.split("/")[2] ?? ""));
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    await noHorizontalScroll(page);

    // Reload while still offline: the visit and its Pending state are still there.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Phone Test Customer" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("SV number given when synced").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Hose Reel/ })).toBeVisible();
    expect(server.creates).toHaveLength(0);

    // Reconnect and sync: the create goes out once, with the same UUID, and the real SV number replaces the placeholder.
    server.reachable = true;
    server.serverJobs = [];
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator(".connection-state")).toHaveText("Online", { timeout: 15_000 });
    await expect.poll(() => server.creates.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    expect(new Set(server.creates.map((body) => body.clientJobUuid))).toEqual(new Set([uuid]));
    expect(server.creates[0]).toMatchObject({ customerId: ids.customer, siteId: ids.site, systemKeys: ["hose_reel"], serviceCallNumber: "SC-OFF-1", configurationRevisionId: ids.revision, configurationRevision: 3 });
    await expect(page.getByText(/^SV-\d{8}-41$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Pending sync")).toHaveCount(0);
    await noHorizontalScroll(page);
  });
}

test("a server refusal shows Needs attention with the reason, keeps the visit, and Retry works once fixed", async ({ page }) => {
  const server: Server = { reachable: true, createMode: "refuse", creates: [], serverJobs: [] };
  await install(page, server);
  await signIn(page, 360);
  await warmCaches(page);
  server.reachable = false;
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 8000 });
  await createOffline(page);
  await expect(page.getByRole("heading", { name: "Phone Test Customer" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Back to My Jobs/ }).click();

  server.reachable = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Needs attention").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/no longer active/).first()).toBeVisible();
  await expect(page.getByText("SV number given when synced").first()).toBeVisible();
  const attempts = server.creates.length;
  expect(attempts).toBeGreaterThanOrEqual(1);
  await noHorizontalScroll(page);

  server.createMode = "ok";
  await page.getByRole("button", { name: /Retry sync/ }).first().click();
  await expect(page.getByText(/^SV-\d{8}-41$/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Needs attention")).toHaveCount(0);
});

test("an unsynced, unstarted local visit can be deleted on the device", async ({ page }) => {
  const server: Server = { reachable: true, createMode: "ok", creates: [], serverJobs: [] };
  await install(page, server);
  await signIn(page, 360);
  await warmCaches(page);
  server.reachable = false;
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 8000 });
  await createOffline(page);
  await expect(page.getByRole("heading", { name: "Phone Test Customer" })).toBeVisible({ timeout: 15_000 });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete unsynced visit" }).click();
  await expect(page.getByText("No visits in progress. Start a new service visit to begin.")).toBeVisible({ timeout: 10_000 });
  expect(server.creates).toHaveLength(0);
  await page.reload();
  await expect(page.getByText("No visits in progress. Start a new service visit to begin.")).toBeVisible({ timeout: 15_000 });
});

test("online creation is unchanged: the server makes the visit and its SV number", async ({ page }) => {
  const server: Server = { reachable: true, createMode: "ok", creates: [], serverJobs: [] };
  const created: Array<Record<string, unknown>> = [];
  await install(page, server);
  await page.route("**/api/inspection-jobs/service-visits", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    created.push(body);
    await route.fulfill({ status: 201, json: { job: {
      id: "00000000-0000-4000-8000-0000000092aa", reference: "SV-20261019-5", title: "Main Site", status: "open", createdAt: new Date().toISOString(),
      serviceDate: "2026-10-19", serviceTime: "10:00", site: { id: ids.site, displayName: "Main Site" },
      configurationSnapshot: { schemaVersion: 1, customer: { id: customer.id, code: customer.code, displayName: customer.displayName }, site: { id: ids.site, displayName: "Main Site" },
        configuration: { revisionId: ids.revision, revisionNumber: 3 }, template: { id: ids.template, code: "MFE-FSSR", name: "Service Report", version: 7 },
        enabledSystems: [{ enabledSystemId: ids.enabled, systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }] }
    } } });
  });
  await signIn(page, 360);
  await page.getByRole("button", { name: "+ New Service Visit" }).click();
  await expect(page.getByText(/recorded automatically by the server/)).toBeVisible();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
  await page.getByRole("checkbox", { name: "Hose Reel" }).check();
  await page.getByRole("button", { name: "Create Service Visit" }).click();
  await expect(page.getByText("SV-20261019-5").first()).toBeVisible({ timeout: 15_000 });
  expect(created).toHaveLength(1);
  expect(Object.keys(created[0]!).sort()).toEqual(["arrivalTime", "customerId", "requestId", "siteId", "systemKeys"]);
  expect(created[0]).not.toHaveProperty("clientJobUuid");
});
