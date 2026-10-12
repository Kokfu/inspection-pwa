import { expect, test, type Page } from "@playwright/test";

/**
 * "Add a New Location" on the technician's job screen is offered only for a service that can take a named location. A Hydrant or
 * Dry/Wet Riser whose layout is the one General layout is not offered it (it would mix the two shapes; the server refuses it at
 * approval). Zoned and empty Hydrant / Riser customers, and CO2, keep it; Hose Reel never had it.
 */
const open = async (page: Page, system: string, shape: string) => {
  await page.goto(`/tests/technician-add-location-offer.html?system=${system}&shape=${shape}`);
  await expect(page.getByText("VISIT-OFFER").first()).toBeVisible();
};
const addLocation = (page: Page) => page.getByRole("button", { name: "Add a New Location" });

for (const system of ["hydrant", "dry_wet_riser"]) {
  test(`${system}: a General layout is not offered 'Add a New Location'`, async ({ page }) => {
    await open(page, system, "general");
    await expect(addLocation(page)).toHaveCount(0);
  });
  for (const shape of ["empty", "zoned"]) {
    test(`${system}: a ${shape} configuration is still offered 'Add a New Location'`, async ({ page }) => {
      await open(page, system, shape);
      await expect(addLocation(page)).toBeVisible();
      await addLocation(page).click();
      expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(["30000000-0000-4000-8000-000000000201"]);
    });
  }
}

test("CO2 keeps 'Add a New Location' and Hose Reel never offers it", async ({ page }) => {
  await open(page, "co2_fire_extinguisher", "empty");
  await expect(addLocation(page)).toBeVisible();
  await open(page, "hose_reel", "general");
  await expect(addLocation(page)).toHaveCount(0);
});

test("the Add a New Location screen itself offers no system for a General layout, and says why without naming only CO2/Wet Chemical/FM200", async ({ page }) => {
  await page.goto("/tests/technician-add-location-offer.html?system=hydrant&shape=general&view=proposal");
  await expect(page.getByRole("heading", { name: "Add a New Location" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "System" })).toHaveCount(0);
  const empty = page.locator(".empty-state");
  await expect(empty).toContainText("This service visit has no system that can take a new named location.");
  await expect(empty).not.toContainText("CO2, Wet Chemical, or FM200");
});

test("the Add a New Location screen lists a zoned Hydrant as a system that can take a location", async ({ page }) => {
  await page.goto("/tests/technician-add-location-offer.html?system=hydrant&shape=zoned&view=proposal");
  await expect(page.getByRole("combobox", { name: "System" })).toContainText("hydrant");
  await expect(page.locator(".empty-state")).toHaveCount(0);
});
