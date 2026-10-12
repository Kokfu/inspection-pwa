import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Manager wording for the services whose layout comes from a technician's inspection (Hose Reel, Hydrant, Dry/Wet Riser):
 * the Manager is never told a General location exists when it does not, never shown "1 location set" for a layout of rows,
 * and is told who enters and who approves the layout. "Admin" is the review role; the Manager account is never called Supervisor.
 */
const open = (page: Page, query: string) => page.goto(`/tests/manager-general-layout-wording.html?${query}`);
const chips = (page: Page, service: string): Locator => page.locator(".manager-service-card", { hasText: service }).locator(".manager-config-flag");
const chipTexts = async (page: Page, service: string) => (await chips(page, service).allInnerTexts()).map((text) => text.trim());

test("a saved General layout reads 'General layout: N rows' on the Hose Reel, Hydrant and Riser cards, never '1 location set'", async ({ page }) => {
  await open(page, "view=cards&mode=general");
  await expect(page.locator(".manager-service-card")).toHaveCount(4); // + FM200, supported and not assigned yet
  expect(await chipTexts(page, "Hose Reel System")).toContain("General layout: 2 rows");
  expect(await chipTexts(page, "Hydrant System")).toContain("General layout: 3 rows");
  expect(await chipTexts(page, "Dry / Wet Riser System")).toContain("General layout: 1 row");
  await expect(page.locator(".manager-services")).not.toContainText("1 location set");
  for (const service of ["Hose Reel System", "Hydrant System", "Dry / Wet Riser System"]) {
    expect(await chipTexts(page, service), service).not.toContain("General location in new visits");
  }
});

test("a customer with no layout says it is set on the first visit, not 'General location in new visits'", async ({ page }) => {
  await open(page, "view=cards&mode=empty");
  for (const service of ["Hose Reel System", "Hydrant System", "Dry / Wet Riser System"]) {
    expect(await chipTexts(page, service), service).toContain("Layout set on first visit");
    expect(await chipTexts(page, service), service).not.toContain("General location in new visits");
  }
  // A service the Manager types locations for keeps its own wording (CO2, Wet Chemical, FM200 really use a General location).
  expect(await chipTexts(page, "FM200 System")).toEqual(["General location in new visits"]);
});

test("a zoned Hydrant / Riser customer keeps counting locations, and a zone without a location is not a General location", async ({ page }) => {
  await open(page, "view=cards&mode=zoned");
  expect(await chipTexts(page, "Hydrant System")).toContain("2 locations set");
  expect(await chipTexts(page, "Dry / Wet Riser System")).toContain("1 zone, no locations yet");
  await expect(page.locator(".manager-services")).not.toContainText("General layout:");
});

test("a retired Hydrant is not told to define zones and locations before it can be assigned", async ({ page }) => {
  await open(page, "view=cards&mode=retired");
  const option = page.locator(".manager-service-option", { hasText: "Hydrant System" });
  await expect(option).toContainText("retired");
  await expect(option).not.toContainText("Define at least one zone");
});

test("the Zones & locations intro names who enters Hydrant, Riser and Hose Reel layouts", async ({ page }) => {
  await open(page, "view=intro");
  const intro = page.locator("section[aria-labelledby='manager-locations-title'] > p").first();
  await expect(intro).toContainText("CO2, Wet Chemical, and FM200 use one General location in new visits when none are configured.");
  await expect(intro).toContainText("Hydrant and Dry / Wet Riser use either the zones and locations you define here or one General layout that a technician enters on a visit and an Admin approves.");
  await expect(intro).toContainText("Hose Reel has no zones");
  await expect(intro).not.toContainText("Supervisor");
});

test("a Hydrant / Riser that is not assigned yet is not told 'new visits use General'", async ({ page }) => {
  for (const system of ["hydrant", "dry_wet_riser"]) {
    await open(page, `view=notassigned&system=${system}`);
    const banner = page.locator(".operational-message--warning");
    await expect(banner, system).toContainText("If no layout is saved, a technician enters it on the first visit and an Admin approves it.");
    await expect(banner, system).not.toContainText("new visits use General");
    await expect(page.getByText("No layout saved yet. A technician enters it on the first visit and an Admin approves it.")).toBeVisible();
  }
  await open(page, "view=notassigned&system=fm200_fire_suppression");
  await expect(page.locator(".operational-message--warning")).toContainText("If no location is configured, new visits use General.");
  await expect(page.getByText("No layout saved yet.")).toHaveCount(0);
});

test("the new wording fits a 360 px phone without a horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const query of ["view=cards&mode=empty", "view=cards&mode=general", "view=intro", "view=notassigned&system=hydrant"]) {
    await open(page, query);
    await expect(page.locator("#view")).not.toBeEmpty();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, query).toBeLessThanOrEqual(0);
  }
});
