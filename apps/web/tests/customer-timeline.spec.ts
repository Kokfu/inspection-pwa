import { test, expect } from "@playwright/test";
const id = "30000000-0000-4000-8000-000000000001";
const own = { id, kind: "service", date: "2026-10-21", status: "closed", siteId: id, siteName: "Site", technicianId: 1, technicianName: "Own technician", ownedByCaller: true };
const other = { ...own, kind: "repair", date: "2026-10-20", status: "approved", technicianId: 2, technicianName: "Other technician", ownedByCaller: false };

test("picker refuses malformed reachable catalogs even with a cached customer; transport loss still uses cache", async ({ page }) => {
  let responseBody = "null";
  let transportFailure = false;
  await page.route("**/api/customers", route => transportFailure ? route.abort("internetdisconnected")
    : route.fulfill({ status: 200, contentType: "application/json", body: responseBody }));
  for (const body of ["null", "{}", "not JSON"]) {
    responseBody = body;
    await page.goto("/tests/customer-timeline.html?route=1");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("option", { name: "Cached customer" })).toHaveCount(0);
  }
  transportFailure = true;
  await page.reload();
  await expect(page.getByRole("option", { name: "Cached customer" })).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("summary cache, pagination, filters, owner taps, offline reload and failed authority", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/customers/*/visit-summaries?*", async route => {
    requests++;
    expect(route.request().headers()["x-expected-user-id"]).toBe("1");
    await route.fulfill({ json: new URL(route.request().url()).searchParams.has("cursor") ? { visits: [other], nextCursor: null } : { visits: [own], nextCursor: "next" } });
  });
  await page.goto("/tests/customer-timeline.html");
  await expect(page.locator(".visit-row")).toHaveCount(2); expect(requests).toBe(2);
  await expect(page.locator(".visit-row button")).toHaveCount(0);
  await expect(page.locator("button.visit-row")).toHaveCount(1);
  await page.locator("button.visit-row").click(); await expect(page.locator("body")).toHaveAttribute("data-opened", `service:${id}`);
  await page.getByRole("button", { name: "Repairs", exact: true }).click(); await expect(page.locator(".visit-row")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Summary only" })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("closed"); await expect(page.locator(".visit-row")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click(); await expect(page.locator(".visit-row")).toHaveCount(2);
  await page.getByLabel("From date").fill("2026-10-22"); await page.getByLabel("To date").fill("2026-10-21"); await expect(page.getByRole("alert")).toContainText("valid date range");
  const cache = await page.evaluate(async () => (window as any).timelineTest.cache());
  expect(cache).toHaveLength(1); expect(cache[0].payload.visits).toHaveLength(2);
  expect(Object.keys(cache[0].payload.visits[1]).sort()).toEqual(Object.keys(other).sort());
  // The harness is served by Vite; abort only the API to model server loss across a real page reload.
  await page.unroute("**/api/customers/*/visit-summaries?*");
  await page.route("**/api/customers/*/visit-summaries?*", route => route.abort("internetdisconnected"));
  await page.reload(); await expect(page.getByRole("status")).toContainText("showing summaries saved"); await expect(page.locator(".visit-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Repairs", exact: true }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("approved");
  await page.getByLabel("From date").fill("2026-10-20"); await page.getByLabel("To date").fill("2026-10-20");
  await page.getByLabel("Site", { exact: true }).selectOption(id); await expect(page.locator(".visit-row")).toHaveCount(1);
  await page.unroute("**/api/customers/*/visit-summaries?*");
  await page.route("**/api/customers/*/visit-summaries?*", route => route.fulfill({ status: 403, json: { error: "FORBIDDEN" } }));
  await page.getByRole("button", { name: "Refresh history" }).click(); await expect(page.getByRole("alert")).toContainText("403"); await expect(page.locator(".visit-row")).toHaveCount(0);
  await page.unroute("**/api/customers/*/visit-summaries?*");
  await page.route("**/api/customers/*/visit-summaries?*", route => route.fulfill({ json: { visits: [{ ...other, answers: { secret: true } }], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh history" }).click(); await expect(page.getByRole("alert")).toContainText("invalid summary"); await expect(page.locator(".visit-row")).toHaveCount(0);
  expect((await page.evaluate(async () => (window as any).timelineTest.cache()))[0].payload.visits).toEqual([own, other]);
  await page.evaluate(async () => (window as any).timelineTest.switchUser());
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("alert")).toContainText("session changed");
  expect(await page.evaluate(async () => (window as any).timelineTest.cache())).toEqual([]);
});

test("Home and the customer-picker context reach the route; an owner can open a service absent from Home", async ({ page }) => {
  const customerId = "10000000-0000-4000-8000-000000000001";
  let details = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers") json = { customers: [{ id: customerId, code: "LIVE", displayName: "Live customer" }] };
    else if (path.endsWith("/visit-summaries")) json = { visits: [{ ...own, technicianId: 805 }, other], nextCursor: null };
    else if (path === `/api/inspection-jobs/${id}`) {
      details++;
      json = { job: { id, reference: "SV-20261021-1", title: "Archived service", status: "open", createdAt: "2026-10-21T00:00:00.000Z", serviceDate: "2026-10-21", serviceTime: "08:00", site: null,
        configurationSnapshot: { schemaVersion: 1, customer: { id: customerId, code: "LIVE", displayName: "Live customer" }, configuration: { revisionId: id, revisionNumber: 1 },
          template: { id, code: "MFE-FSSR", name: "Service", version: 7 }, enabledSystems: [] },
        completion: { jobId: id, jobStatus: "open", eligible: false, checkedAt: "2026-10-21T00:00:00.000Z", requiredUnitCount: 0, acceptedUnitCount: 0, completedAt: null, completedBy: null, systems: [] } } };
    } else if (path === "/api/inspection-jobs") json = { jobs: [] };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    await route.fulfill({ json });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await page.getByRole("button", { name: "Customer history", exact: true }).click();
  await expect(page).toHaveURL(/#\/customer-timeline$/);
  await page.getByLabel("Customer", { exact: true }).selectOption(customerId);
  await expect(page.locator(".visit-row")).toHaveCount(2);
  await expect(page.locator("button.visit-row")).toHaveCount(1);
  await page.locator("button.visit-row").click();
  await expect(page).toHaveURL(new RegExp(`#/job/${id}$`));
  await expect(page.getByRole("heading", { name: "Live customer", exact: true })).toBeVisible(); expect(details).toBe(1);
  await page.getByLabel("Primary navigation").getByRole("button", { name: "New Service Visit", exact: true }).click();
  await page.getByRole("button", { name: "Customer history", exact: true }).click();
  await expect(page).toHaveURL(/#\/customer-timeline$/);
});

test("manager taps every row; layout and focus at phone, tablet and desktop", async ({ page }, testInfo) => {
  await page.route("**/api/customers/*/visit-summaries?*", route => route.fulfill({ json: { visits: [own, other], nextCursor: null } }));
  await page.goto("/tests/customer-timeline.html?role=admin"); await expect(page.locator("button.visit-row")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Summary only" })).toHaveCount(0);
  await page.locator("button.visit-row").nth(1).click(); await expect(page.locator("body")).toHaveAttribute("data-opened", `repair:${id}`);
  for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.getByRole("button").all()) { const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
    await page.getByRole("button", { name: "All", exact: true }).focus();
    expect(await page.getByRole("button", { name: "All", exact: true }).evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.screenshot({ path: testInfo.outputPath(`timeline-${width}.png`), fullPage: true });
  }
});

test("manager timeline deep link uses the shared route and opens either visit kind", async ({ page }) => {
  const customerId = "10000000-0000-4000-8000-000000000001";
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 1, username: "manager", role: "admin" } };
    else if (path === "/api/customers") json = { customers: [{ id: customerId, code: "LIVE", displayName: "Live customer" }] };
    else if (path.endsWith("/visit-summaries")) json = { visits: [own, other], nextCursor: null };
    else if (path === "/api/inspection-jobs") json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.goto(`/tests/manager-dashboard-navigation.html#/manager-customer-timeline/${customerId}`);
  await page.getByRole("button", { name: /^Manager/ }).click();
  await expect(page.locator("button.visit-row")).toHaveCount(2);
  await page.locator("button.visit-row").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`#/manager-repairs/${id}$`));
  await page.goto(`/tests/manager-dashboard-navigation.html#/manager-customer-timeline/${customerId}`);
  await expect(page.locator("button.visit-row")).toHaveCount(2);
  await page.locator("button.visit-row").first().click();
  await expect(page).toHaveURL(new RegExp(`#/manager-service-visit/${id}$`));
});
