import { expect, test, type Page } from "@playwright/test";

const customer = { id: "customer-a", code: "A", displayName: "Customer A", isDemo: false };
const site = { id: "11111111-1111-4111-8111-111111111111", customerId: customer.id, code: "PRIMARY", displayName: "Site A" };
const otherSite = { ...site, id: "22222222-2222-4222-8222-222222222222", displayName: "Site B" };
const configuration = { customer, configuration: { configurationId: "config", revision: 1, templateId: "template", templateCode: "MFE", templateName: "Master", templateVersion: 1, selectionPolicy: "preset_only", enabledSystems: [{ id: "system-a", key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }] } };

async function setup(page: Page, options: { conflict?: boolean; refreshFails?: boolean; malformedConflict?: boolean; retry?: boolean } = {}) {
  const bodies: Record<string, any>[] = [];
  let siteLoads = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/customers") return route.fulfill({ json: { customers: [customer] } });
    if (path.endsWith("/sites")) {
      siteLoads++;
      if (options.refreshFails && siteLoads > 1) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { sites: options.conflict && siteLoads > 1 ? [site, otherSite] : [site] } });
    }
    if (path.endsWith("/configuration")) return route.fulfill({ json: configuration });
    if (path.endsWith("/service-visits")) {
      bodies.push(route.request().postDataJSON());
      if (options.conflict || options.malformedConflict) return route.fulfill({ status: 409, json: { error: "SITE_ALREADY_EXISTS", existingSiteId: options.malformedConflict ? 42 : otherSite.id, message: "Duplicate site" } });
      if (options.retry && bodies.length === 1) return route.fulfill({ status: 503, json: { message: "Try again" } });
      return route.fulfill({ json: { job: { id: "created-job" } } });
    }
    return route.fulfill({ status: 503, json: { message: "Unexpected request" } });
  });
  await page.goto("/tests/new-service-visit-site-hint.html");
  await expect(page.getByRole("button", { name: "+ Add new site", exact: true })).toBeDisabled();
  await page.getByLabel("Customer", { exact: true }).selectOption(customer.id);
  await page.getByLabel("Hose Reel").check();
  return bodies;
}
const add = (page: Page) => page.getByRole("button", { name: "+ Add new site", exact: true });
const create = (page: Page) => page.getByRole("button", { name: "Create Service Visit", exact: true });

test("typed site excludes selected site, normalizes display whitespace and confirms approval", async ({ page }) => {
  const bodies = await setup(page);
  await page.getByLabel("Site", { exact: true }).selectOption(site.id);
  await add(page).click();
  await expect(page.getByLabel("Site", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Site", { exact: true })).toBeDisabled();
  await expect(create(page)).toBeDisabled();
  await page.getByLabel("Site name", { exact: true }).fill("   New   Site   ");
  await page.getByLabel("Site address (optional)").fill("Street 1");
  await expect(page.getByLabel("Site name", { exact: true })).toHaveValue("New Site");
  await expect(page.getByLabel("Site name", { exact: true })).toHaveAttribute("maxlength", "160");
  await expect(page.getByLabel("Site address (optional)")).toHaveAttribute("maxlength", "500");
  await create(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Site sent for approval. Your visit continues." })).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].newSite).toEqual({ displayName: "New Site", address: "Street 1" });
  expect(bodies[0]).not.toHaveProperty("siteId");
  await expect(page.getByRole("option", { name: "New Site", exact: true })).toHaveCount(0);
});

test("cancel restores existing select-site flow and sends no newSite", async ({ page }) => {
  const bodies = await setup(page);
  await add(page).click();
  await page.getByLabel("Site name", { exact: true }).fill("Cancelled Site");
  await page.getByRole("button", { name: "Cancel new site" }).click();
  await page.getByLabel("Site", { exact: true }).selectOption(site.id);
  await create(page).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].siteId).toBe(site.id);
  expect(bodies[0]).not.toHaveProperty("newSite");
});

test("409 refreshes active sites then selects existing site and keeps form editable", async ({ page }) => {
  const bodies = await setup(page, { conflict: true });
  await add(page).click();
  await page.getByLabel("Site name", { exact: true }).fill("Site B");
  await create(page).click();
  await expect(page.getByLabel("Site", { exact: true })).toHaveValue(otherSite.id);
  await expect(page.getByText("This site already exists — choose it from the list", { exact: true })).toBeVisible();
  await expect(create(page)).toBeEnabled();
  await page.getByLabel("Service Call No").fill("Editable");
  await create(page).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].siteId).toBe(otherSite.id);
  expect(bodies[1]).not.toHaveProperty("newSite");
  expect(bodies[1].requestId).toBe(bodies[0].requestId);
});

for (const options of [{ conflict: true, refreshFails: true }, { malformedConflict: true }]) {
  test(`duplicate recovery fails closed: ${JSON.stringify(options)}`, async ({ page }) => {
    await setup(page, options);
    await add(page).click();
    await page.getByLabel("Site name", { exact: true }).fill("Site B");
    await create(page).click();
    await expect(page.locator(".operational-message")).toBeVisible();
    await expect(page.getByLabel("Site", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Site name", { exact: true })).toBeEditable();
  });
}

test("offline disables add-site, explains connection and retains editable typed fields", async ({ page }) => {
  const bodies = await setup(page);
  await add(page).click();
  await page.getByLabel("Site name", { exact: true }).fill("New Site");
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(add(page)).toBeDisabled();
  await expect(page.getByText("Adding a new site needs a connection.", { exact: true })).toBeVisible();
  await expect(create(page)).toBeDisabled();
  await expect(page.getByLabel("Site name", { exact: true })).toBeEditable();
  await page.getByLabel("Site address (optional)").fill("Still editable");
  expect(bodies).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(create(page)).toBeEnabled();
});

test("retry keeps request identity, start time and typed-site payload", async ({ page }) => {
  const bodies = await setup(page, { retry: true });
  await add(page).click();
  await page.getByLabel("Site name", { exact: true }).fill("New Site");
  await create(page).click();
  await expect(page.getByText("Try again", { exact: true })).toBeVisible();
  await create(page).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
  test(`inline site form fits ${width} viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await add(page).click();
    await page.getByLabel("Site name", { exact: true }).fill("New Site");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const size = await add(page).boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`site-form-${width}.png`), fullPage: true });
  });
}

test("blank typed name cannot create and changing customer clears typed site mode", async ({ page }) => {
  await setup(page);
  await add(page).click();
  await page.getByLabel("Site name", { exact: true }).fill("   ");
  await expect(create(page)).toBeDisabled();
  await page.getByLabel("Site name", { exact: true }).fill("New Site");
  await page.getByLabel("Customer", { exact: true }).selectOption("");
  await expect(page.getByLabel("Site name", { exact: true })).toHaveCount(0);
  await expect(add(page)).toBeDisabled();
  await expect(create(page)).toBeDisabled();
});

for (const refreshFails of [false, true]) {
  test(`real App announces the site submission after visit navigation (refreshFails=${refreshFails})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const appCustomer = { ...customer, id: "33333333-3333-4333-8333-333333333333" };
    const appSite = { ...site, customerId: appCustomer.id };
    const job = {
      id: "44444444-4444-4444-8444-444444444444", reference: "SV-20261020-1", title: "New Site",
      status: "open", createdAt: "2026-10-20T02:00:00.000Z", serviceDate: "2026-10-20", serviceTime: "10:00",
      site: { id: otherSite.id, displayName: "New Site" },
      configurationSnapshot: {
        schemaVersion: 1, customer: appCustomer, site: { id: otherSite.id, displayName: "New Site" },
        configuration: { revisionId: "55555555-5555-4555-8555-555555555555", revisionNumber: 1 },
        template: { id: "66666666-6666-4666-8666-666666666666", code: "MFE", name: "Master", version: 1 },
        enabledSystems: [{ enabledSystemId: "77777777-7777-4777-8777-777777777777", systemKey: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
      }
    };
    const bodies: Record<string, unknown>[] = [];
    let refreshedAfterCreate = false;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 9301, username: "site-test-tech", role: "inspector" } } });
      if (path === "/api/health") return route.fulfill({ json: { status: "ok" } });
      if (path === "/api/customers") return route.fulfill({ json: { customers: [appCustomer] } });
      if (path === `/api/customers/${appCustomer.id}/sites`) return route.fulfill({ json: { sites: [appSite] } });
      if (path === `/api/customers/${appCustomer.id}/configuration`) return route.fulfill({ json: { ...configuration, customer: appCustomer } });
      if (path === "/api/inspection-jobs/service-visits") {
        bodies.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: { job } });
      }
      if (path === "/api/inspection-jobs") {
        if (bodies.length) refreshedAfterCreate = true;
        if (bodies.length && refreshFails) return route.fulfill({ status: 503, json: { message: "Refresh unavailable" } });
        return route.fulfill({ json: { jobs: bodies.length ? [job] : [] } });
      }
      if (path === "/api/inspection-catalog") {
        const template = { id: job.configurationSnapshot.template.id, code: "MFE", name: "Master", version: 1, selectionPolicy: "preset_only", headerDefinition: {}, reportBoilerplate: {}, systems: [] };
        return route.fulfill({ json: { template, templates: [template] } });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto("/#/jobs");
    await page.getByRole("button", { name: /^Technician/ }).click();
    await page.getByRole("button", { name: "+ New Service Visit", exact: true }).click();
    await page.getByLabel("Customer", { exact: true }).selectOption(appCustomer.id);
    await page.getByLabel("Hose Reel").check();
    await add(page).click();
    await page.getByLabel("Site name", { exact: true }).fill("New Site");
    await create(page).click();

    await expect(page).toHaveURL(new RegExp(`#/job/${job.id}$`));
    await expect.poll(() => refreshedAfterCreate).toBe(true);
    if (refreshFails) await expect(page.getByText(/existing cached jobs remain available/)).toBeVisible();
    await expect(page.getByRole("heading", { name: appCustomer.displayName, exact: true })).toBeVisible();
    const confirmation = page.getByRole("status").filter({ hasText: "Site sent for approval. Your visit continues." });
    await expect(confirmation).toHaveCount(1);
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toHaveAttribute("aria-live", "polite");
    await expect(confirmation).toHaveAttribute("aria-atomic", "true");
    await expect(page.getByRole("heading", { name: "New Service Visit", exact: true })).toHaveCount(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].newSite).toEqual({ displayName: "New Site" });
    expect(bodies[0]).not.toHaveProperty("siteId");
    await page.getByRole("button", { name: /Back to My Jobs/ }).click();
    await expect(confirmation).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/job/${job.id}$`));
    await expect(confirmation).toHaveCount(0);
  });
}

test("inline Add New Customer refuses a response without the request receipt and selects nothing", async ({ page }) => {
  const posts: Array<{ requestId: string; displayName: string }> = [];
  const createdId = "33333333-3333-4333-8333-333333333399";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/customers/service-format-options") return route.fulfill({ json: { systems: [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1 }] } });
    if (path === "/api/customers" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { requestId: string; displayName: string };
      posts.push(body);
      const created = { customer: { id: createdId, code: "NEW", displayName: body.displayName } };
      return route.fulfill({ status: 201, json: posts.length === 1 ? { customer: created } : { requestId: "33333333-3333-4333-8333-3333333333ff", customer: created } });
    }
    if (path === "/api/customers") return route.fulfill({ json: { customers: [customer] } });
    return route.fulfill({ status: 503, json: { message: "Unexpected request" } });
  });
  await page.goto("/tests/new-service-visit-site-hint.html");
  await page.getByRole("button", { name: "+ Add New Customer", exact: true }).click();
  await page.getByLabel("Customer Name", { exact: true }).fill("Inline Customer");
  await page.getByLabel("Primary Site", { exact: true }).fill("Main");
  await page.getByLabel("Hose Reel").check();
  for (const attempt of [1, 2]) {
    await page.getByRole("button", { name: "Create Customer", exact: true }).click();
    await expect(page.getByText(/did not confirm this customer request/)).toBeVisible();
    await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("");
    await expect(page.getByRole("option", { name: "Inline Customer" })).toHaveCount(0);
    expect(posts).toHaveLength(attempt);
  }
  expect(posts[0].requestId).toBe(posts[1].requestId);
});

test("offline, + Add New Customer opens the standalone Add Customer page instead of refusing (OA-5)", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText(/opens the Add Customer page/)).toBeVisible();
  await page.getByRole("button", { name: "+ Add New Customer", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#/technician-add-customer");
  await expect(page.getByLabel("Customer Name", { exact: true })).toHaveCount(0); // no inline form, no server-only create
});
