import { expect, test, type Page } from "@playwright/test";
import { customerId, installFakeManagerApi, openFakeCustomer } from "./managerServiceEditorFixture";

const siteId = "00000000-0000-4000-8000-000000000951";
const otherId = "00000000-0000-4000-8000-000000000952";
const activeSite = { id: siteId, code: "A", displayName: "Tower A", address: "Original address" };
const archivedSite = { id: otherId, code: "B", displayName: "Tower B", address: null, archived: true as const };
const baseCustomer = () => ({
  customer: { id: customerId, code: "C950", displayName: "Harbour View Tower" },
  sites: [activeSite], archivedSites: [archivedSite],
  configuration: { id: "00000000-0000-4000-8000-000000000953", revision: 1, enabledSystems: [] },
  supportedSystems: []
});

async function setup(page: Page) {
  await installFakeManagerApi(page);
  const customer = baseCustomer();
  await page.route("**/api/manager/customers", route => route.fulfill({ json: { customers: [customer] } }));
  await page.route(`**/api/manager/customers/${customerId}`, route => route.fulfill({ json: { customer } }));
  return customer;
}
const sites = (page: Page) => page.locator("section.customer-form-card").filter({ has: page.getByRole("heading", { name: "Sites", exact: true }) });
const archived = (page: Page) => page.getByRole("region", { name: "Archived sites", exact: true });

test("archive: confirm/cancel, exact POST, wait for server, refresh both lists and last-site warning", async ({ page }) => {
  const customer = await setup(page);
  let calls = 0;
  let respond!: () => void;
  const held = new Promise<void>(resolve => { respond = resolve; });
  await page.route(`**/sites/${siteId}/archive`, async route => {
    calls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    await held;
    await route.fulfill({ json: { customer: { ...customer, sites: [], archivedSites: [...customer.archivedSites, { ...activeSite, displayName: "Tower A from server", archived: true }] } } });
  });
  await openFakeCustomer(page);
  await expect(archived(page).getByRole("button", { name: "Archived sites" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
  page.once("dialog", dialog => {
    expect(dialog.message()).toBe("Archive Tower A? It will no longer be offered when creating a new service visit. Existing visits and reports keep this site. Warning: this customer will have no active sites.");
    void dialog.dismiss();
  });
  await sites(page).getByRole("button", { name: "Archive", exact: true }).click();
  expect(calls).toBe(0);
  page.once("dialog", dialog => { void dialog.accept(); });
  await sites(page).getByRole("button", { name: "Archive", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(sites(page).getByLabel("Site Address")).toHaveValue("Original address");
  await expect(sites(page).getByRole("button", { name: "Archive", exact: true })).toBeDisabled();
  respond();
  await expect(sites(page).getByText("No active sites.", { exact: true })).toBeVisible();
  await archived(page).getByRole("button", { name: "Archived sites" }).click();
  await expect(archived(page)).toContainText("Tower A from server");
  await expect(archived(page).getByRole("button", { name: "Restore", exact: true })).toHaveCount(2);
});

test("archive with another active site has no zero-site warning", async ({ page }) => {
  const customer = await setup(page);
  customer.sites.push({ ...activeSite, id: otherId, displayName: "Second active site" });
  customer.archivedSites = [];
  await openFakeCustomer(page);
  page.once("dialog", dialog => {
    expect(dialog.message()).toBe("Archive Tower A? It will no longer be offered when creating a new service visit. Existing visits and reports keep this site.");
    void dialog.dismiss();
  });
  await sites(page).getByRole("button", { name: "Archive", exact: true }).first().click();
});

test("restore refreshes active and archived lists from the POST response", async ({ page }) => {
  const customer = await setup(page);
  await page.route(`**/sites/${otherId}/restore`, route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    return route.fulfill({ json: { customer: { ...customer, sites: [...customer.sites, { ...archivedSite, displayName: "Restored from server" }], archivedSites: [] } } });
  });
  await openFakeCustomer(page);
  await archived(page).getByRole("button", { name: "Archived sites" }).click();
  await archived(page).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(archived(page)).toContainText("No archived sites.");
  await expect(sites(page).getByRole("button", { name: "Archive", exact: true })).toHaveCount(2);
  await expect(sites(page).locator("strong", { hasText: "Restored from server" })).toBeVisible();
});

test("restore name clash shows the server 409 message and retains the archived site", async ({ page }) => {
  await setup(page);
  await page.route(`**/sites/${otherId}/restore`, route => route.fulfill({ status: 409, json: { error: "SITE_NAME_CONFLICT", message: "An active site already uses this display name." } }));
  await openFakeCustomer(page);
  await archived(page).getByRole("button", { name: "Archived sites" }).click();
  await archived(page).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("An active site already uses this display name.");
  await expect(archived(page)).toContainText("Tower B");
  await expect(archived(page).getByRole("button", { name: "Restore", exact: true })).toBeEnabled();
  await expect(sites(page).getByRole("button", { name: "Archive", exact: true })).toHaveCount(1);
});

for (const action of ["archive", "restore"] as const) {
  for (const failure of ["403", "500", "network", "wrong customer", "unchanged lists", "missing archived list", "invalid archived entry", "duplicate site"] as const) {
    test(`${action} fails closed: ${failure}`, async ({ page }) => {
      const customer = await setup(page);
      const targetId = action === "archive" ? siteId : otherId;
      await page.route(`**/sites/${targetId}/${action}`, route => {
        if (failure === "network") return route.abort();
        if (failure === "403" || failure === "500") return route.fulfill({ status: Number(failure), json: { error: "Denied" } });
        const result: any = action === "archive"
          ? { ...customer, sites: [], archivedSites: [...customer.archivedSites, { ...activeSite, archived: true }] }
          : { ...customer, sites: [...customer.sites, archivedSite], archivedSites: [] };
        if (failure === "wrong customer") result.customer = { ...customer.customer, id: otherId };
        if (failure === "unchanged lists") Object.assign(result, customer);
        if (failure === "missing archived list") delete result.archivedSites;
        if (failure === "invalid archived entry") result.archivedSites = [null];
        if (failure === "duplicate site") result.sites.push(result.sites[0] ?? activeSite);
        return route.fulfill({ json: { customer: result } });
      });
      await openFakeCustomer(page);
      if (action === "archive") page.once("dialog", dialog => { void dialog.accept(); });
      else await archived(page).getByRole("button", { name: "Archived sites" }).click();
      await sites(page).getByRole("button", { name: action === "archive" ? "Archive" : "Restore", exact: true }).click();
      await expect(page.getByText("Choose how you are signing in")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Harbour View Tower", exact: true })).toHaveCount(0);
    });
  }
}

test("supervisor deep link cannot expose site mutation controls", async ({ page }) => {
  await setup(page);
  const calls: string[] = [];
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: 830, username: "review-lead", role: "supervisor" } } }));
  page.on("request", request => { if (/\/sites\//.test(request.url())) calls.push(request.url()); });
  await page.goto(`/tests/manager-service-editor.html#/manager-customer/${customerId}`);
  await page.getByRole("button", { name: /^Admin Review/ }).click();
  await expect(page).toHaveURL(/#\/manager$/);
  for (const name of ["Archive", "Restore", "+ Add Site"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  expect(calls).toEqual([]);
});

for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
  test(`site actions fit at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await openFakeCustomer(page);
    await archived(page).getByRole("button", { name: "Archived sites" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ["Archive", "Restore", "Archived sites"]) {
      const button = sites(page).getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      await button.focus();
      await expect(button).toBeFocused();
    }
    await page.screenshot({ path: `test-results/site-archive-${width}.png`, fullPage: true });
  });
}


test("existing add-site and address editing refresh the customer", async ({ page }) => {
  const customer = await setup(page);
  await page.route(`**/api/manager/customers/${customerId}/sites`, route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ displayName: "New branch", address: "Branch road" });
    return route.fulfill({ json: { customer: { ...customer, sites: [...customer.sites, { ...activeSite, id: otherId, displayName: "New branch", address: "Branch road" }], archivedSites: [] } } });
  });
  await page.route(`**/sites/${siteId}/address`, route => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({ address: "Updated address" });
    return route.fulfill({ json: { customer: { ...customer, sites: [{ ...activeSite, address: "Updated address" }] } } });
  });
  await openFakeCustomer(page);
  await sites(page).getByLabel("Site Address", { exact: true }).fill("Updated address");
  await sites(page).getByRole("button", { name: "Save Address", exact: true }).click();
  await expect(sites(page).getByLabel("Site Address", { exact: true })).toHaveValue("Updated address");
  await sites(page).getByRole("button", { name: "+ Add Site", exact: true }).click();
  await sites(page).getByLabel("Site Name", { exact: true }).fill("New branch");
  await sites(page).getByLabel("Site Address", { exact: true }).last().fill("Branch road");
  await sites(page).getByRole("button", { name: "Add Site", exact: true }).click();
  await expect(sites(page).locator("strong", { hasText: "New branch" })).toBeVisible();
  await expect(sites(page).getByRole("button", { name: "Archive", exact: true })).toHaveCount(2);
});

test("malformed archived sites on customer load fail closed", async ({ page }) => {
  const customer = await setup(page);
  await page.route(`**/api/manager/customers/${customerId}`, route => route.fulfill({ json: { customer: { ...customer, archivedSites: [null] } } }));
  await page.goto(`/tests/manager-service-editor.html#/manager-customer/${customerId}`);
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.getByText("Choose how you are signing in")).toBeVisible();
  await expect(sites(page)).toHaveCount(0);
});

for (const duplicate of ["active", "archived", "across lists"] as const) {
  test(`customer detail rejects duplicate site IDs: ${duplicate}`, async ({ page }) => {
    const customer = await setup(page);
    if (duplicate === "active") customer.sites.push({ ...activeSite });
    else if (duplicate === "archived") customer.archivedSites.push({ ...archivedSite });
    else customer.archivedSites.push({ ...activeSite, address: null, archived: true });
    await page.goto(`/tests/manager-service-editor.html#/manager-customer/${customerId}`);
    await page.getByRole("button", { name: /^Manager Monitor/ }).click();
    await expect(page.getByText("Choose how you are signing in")).toBeVisible();
    await expect(sites(page)).toHaveCount(0);
  });
}

for (const action of ["archive", "restore"] as const) {
  for (const outcome of ["success", "authorization failure"] as const) {
    test(`late ${action} ${outcome} cannot replace or sign out another customer page`, async ({ page }) => {
      const customer = await setup(page);
      const nextCustomerId = "00000000-0000-4000-8000-000000000960";
      const nextCustomer = { ...baseCustomer(), customer: { id: nextCustomerId, code: "C960", displayName: "Next customer" } };
      await page.route(`**/api/manager/customers/${nextCustomerId}`, route => route.fulfill({ json: { customer: nextCustomer } }));
      const targetId = action === "archive" ? siteId : otherId;
      const path = `/sites/${targetId}/${action}`;
      let respond!: () => void;
      const held = new Promise<void>(resolve => { respond = resolve; });
      let started = false;
      await page.route(`**${path}`, async route => {
        started = true;
        await held;
        if (outcome === "authorization failure") {
          await route.fulfill({ status: 403, json: { error: "Denied" } });
        } else {
          const updated = action === "archive"
            ? { ...customer, sites: [], archivedSites: [...customer.archivedSites, { ...activeSite, archived: true }] }
            : { ...customer, sites: [...customer.sites, archivedSite], archivedSites: [] };
          await route.fulfill({ json: { customer: updated } });
        }
      });
      try {
        await openFakeCustomer(page);
        if (action === "archive") page.once("dialog", dialog => { void dialog.accept(); });
        else await archived(page).getByRole("button", { name: "Archived sites" }).click();
        await sites(page).getByRole("button", { name: action === "archive" ? "Archive" : "Restore", exact: true }).click();
        await expect.poll(() => started).toBe(true);
        await page.evaluate(id => { location.hash = `#/manager-customer/${id}`; }, nextCustomerId);
        await expect(page.getByRole("heading", { name: "Next customer", exact: true })).toBeVisible();
        const response = page.waitForResponse(result => result.url().endsWith(path));
        respond();
        await (await response).finished();
        // Let the fetch continuation and React commit settle before checking for stale callbacks.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await expect(page).toHaveURL(new RegExp(`#/manager-customer/${nextCustomerId}$`));
        await expect(page.getByRole("heading", { name: "Next customer", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Harbour View Tower", exact: true })).toHaveCount(0);
        await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
        await expect(sites(page).getByRole("button", { name: "Archive", exact: true })).toBeEnabled();
      } finally { respond(); }
    });
  }
}
