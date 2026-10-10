import { expect, test } from "@playwright/test";

test("technician sidebar opens all five destinations at phone and desktop widths", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/customers") json = { customers: [] };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  const sidebar = page.getByLabel("Primary navigation");
  const destinations = [
    ["Home", "jobs", "My Service Jobs"],
    ["New Service Visit", "new-service-visit", "New Service Visit"],
    ["Add Customer", "technician-add-customer", "Add Customer"],
    ["Completed Services", "technician-completed-services", "Completed Services"],
    ["Upcoming Services", "technician-upcoming-services", "Upcoming Services"]
  ] as const;
  await expect(sidebar.getByRole("button")).toHaveCount(5);
  await expect(sidebar.getByRole("button")).toHaveText(destinations.map(([label]) => label));
  for (const [label, route, heading] of destinations) {
    const link = sidebar.getByRole("button", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [label, selector] of [
      ["New Service Visit", ".new-service-visit"],
      ["Upcoming Services", 'section[aria-labelledby="technician-upcoming-title"]']
    ] as const) {
      await sidebar.getByRole("button", { name: label, exact: true }).click();
      await expect.poll(() => page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2) <= 2;
      })).toBe(true);
    }
  }
  await page.screenshot({ path: "test-results/technician-sidebar-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(sidebar).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(sidebar).toBeHidden();
  const mobile = page.getByLabel("Mobile navigation");
  const menu = page.locator("details.app-mobile-navigation");
  for (const [label, route, heading] of destinations) {
    // I-36: the menu is opened for each choice and closes itself once a destination is chosen.
    await expect(menu).not.toHaveJSProperty("open", true);
    await page.getByText("Menu", { exact: true }).click();
    await expect(menu).toHaveJSProperty("open", true);
    await mobile.getByRole("button", { name: label, exact: true }).click();
    await expect(menu).not.toHaveJSProperty("open", true);
    await expect(mobile).toBeHidden();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "test-results/technician-sidebar-phone.png", fullPage: true });
});

test("standalone customer form retries the exact creation identity after an uncertain response", async ({ page }) => {
  const submissions: Array<{ requestId: string; displayName: string }> = [];
  const createdId = "93000000-0000-4000-8000-000000000099";
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 805, username: "tech", role: "inspector" } } });
    if (path === "/api/customers/service-format-options") return route.fulfill({ json: { systems: [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1 }] } });
    if (path === "/api/customers" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { requestId: string; displayName: string };
      submissions.push(body);
      if (submissions.length === 1) return route.fulfill({ status: 503, json: { message: "Response unavailable" } });
      return route.fulfill({ status: 200, json: { customer: { customer: { id: createdId, code: "TEST", displayName: body.displayName } } } });
    }
    if (path === "/api/customers") return route.fulfill({ json: { customers: submissions.length > 1 ? [{ id: createdId, code: "TEST", displayName: "Retry Customer" }] : [] } });
    if (path === `/api/customers/${createdId}/sites`) return route.fulfill({ json: { sites: [] } });
    if (path === `/api/customers/${createdId}/configuration`) return route.fulfill({ json: { customer: { id: createdId }, configuration: { enabledSystems: [] } } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/technician-add-customer");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Add Customer" }).click();
  await page.getByLabel("Customer display name").fill("Retry Customer");
  await page.getByLabel("Hose Reel").check();
  await page.getByRole("button", { name: "Create Customer" }).click();
  await expect(page.getByText(/Customer sync needs attention: Response unavailable/)).toBeVisible();
  await expect(page.getByLabel("Customer display name")).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: /^Technician/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Add Customer" }).click();
  await expect(page.getByRole("heading", { name: "Retry Customer created" })).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]).toEqual(submissions[1]);
  await page.getByRole("button", { name: "Start a Service Visit for this customer" }).click();
  await expect(page).toHaveURL(new RegExp(`#/new-service-visit/${createdId}$`));
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(createdId);
});

test("technician customer details and queued creation survive offline navigation and sync once after reconnect", async ({ page, context }) => {
  const posts: Array<{ requestId: string; displayName: string }> = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 806, username: "offline-tech", role: "inspector" } } });
    if (path === "/api/customers/service-format-options") return route.fulfill({ json: { systems: [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1 }] } });
    if (path === "/api/customers" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { requestId: string; displayName: string };
      posts.push(body);
      return route.fulfill({ status: 201, json: { customer: { customer: { id: "93000000-0000-4000-8000-000000000098", code: "OFFLINE", displayName: body.displayName } } } });
    }
    if (path === "/api/customers") return route.fulfill({ json: { customers: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  const nav = page.getByLabel("Primary navigation");
  await nav.getByRole("button", { name: "Add Customer" }).click();
  await expect(page.getByLabel("Hose Reel")).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Customer display name").fill("Offline Customer");
  await page.getByLabel("Hose Reel").check();
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Customer draft saved on this device.")).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page.getByRole("button", { name: /^Technician/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Add Customer" }).click();
  await expect(page.getByLabel("Customer display name")).toHaveValue("Offline Customer");
  await expect(page.getByLabel("Hose Reel")).toBeChecked();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole("button", { name: "Create Customer" }).click();
  await expect(page.getByText("Customer saved on this device, pending sync.")).toBeVisible();
  expect(posts).toHaveLength(0);
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Offline Customer created" })).toBeVisible();
  expect(posts).toHaveLength(1);
});
