import { expect, test } from "@playwright/test";

// I-47: Site is required to create a visit. The screen used to say "ready to create" while the button stayed dimmed.
const customer = { id: "customer-a", code: "A", displayName: "Customer A", isDemo: false };
const site = { id: "site-a", customerId: customer.id, code: "PRIMARY", displayName: "Site A" };
const configuration = { customer, configuration: { configurationId: "config", revision: 1, templateId: "template", templateCode: "MFE", templateName: "Master", templateVersion: 1, selectionPolicy: "preset_only", enabledSystems: [{ id: "system-a", key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }] } };

test("I-47: the New Service Visit screen says a site is missing instead of 'ready to create'", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/customers") return route.fulfill({ json: { customers: [customer] } });
    if (path.endsWith("/sites")) return route.fulfill({ json: { sites: [site] } });
    if (path.endsWith("/configuration")) return route.fulfill({ json: configuration });
    return route.fulfill({ status: 503, json: { message: "Unexpected request" } });
  });
  await page.goto("/tests/new-service-visit-site-hint.html");
  const create = page.getByRole("button", { name: "Create Service Visit" });
  const summary = page.locator(".selected-services-summary");
  await page.getByLabel("Customer", { exact: true }).selectOption(customer.id);
  await expect(page.getByLabel("Site")).toBeEnabled();
  await expect(page.getByRole("option", { name: "Site A" })).toHaveCount(1);
  // Nothing ticked yet: no summary line, and the button is off.
  await expect(summary).toHaveCount(0);
  await expect(create).toBeDisabled();

  await page.getByLabel("Hose Reel").check();
  // A system is ticked but no site: the screen names what is missing and never claims it is ready.
  await expect(summary).toContainText("1 service selected");
  await expect(summary).toContainText("Choose a site to continue");
  await expect(summary).not.toContainText("ready to create");
  await expect(create).toBeDisabled();
  await expect(create).toHaveAttribute("aria-describedby", /.+/);
  const describedBy = await create.getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toContainText("Choose a site to continue");

  // Choosing the site makes it ready.
  await page.getByLabel("Site").selectOption(site.id);
  await expect(summary).toContainText("1 service selected and ready to create.");
  await expect(summary).not.toContainText("Choose a site");
  await expect(create).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
