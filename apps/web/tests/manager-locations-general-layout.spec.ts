import { expect, test, type Page } from "@playwright/test";

/**
 * I-62: Hydrant and Dry/Wet Riser may hold ONE zone-free General layout (saved from inspections). The Manager's Zones &
 * locations editor shows it as a read-only note instead of failing as "unavailable"; a zoned customer keeps the full editor.
 */
const open = (page: Page, system: string, mode: string) => page.goto(`/tests/manager-locations-general-layout.html?system=${system}&mode=${mode}`);
const calls = (page: Page) => page.evaluate(() => (window as any).__calls);

for (const system of ["hydrant", "dry_wet_riser"]) {
  test(`${system}: a General layout is shown as a note, with no zone or location editing and no authority failure`, async ({ page }) => {
    await open(page, system, "general");
    await expect(page.getByText("General layout: 3 rows saved from technician inspections")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add zone" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add location" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save zones & locations" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    expect(await calls(page)).toMatchObject({ get: 1, put: 0, authority: 0, saved: 0 });
  });

  test(`${system}: a zoned customer keeps the full editor`, async ({ page }) => {
    await open(page, system, "zoned");
    await expect(page.getByRole("button", { name: "Add zone" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save zones & locations" })).toBeVisible();
    await expect(page.getByLabel("Zone name for zone-a")).toHaveValue("Zone A");
    await expect(page.getByText("General layout:")).toHaveCount(0);
    expect((await calls(page)).authority).toBe(0);
  });

  for (const mode of ["mixed", "annex"]) {
    test(`${system}: a ${mode} configuration without a zone is still an authority failure`, async ({ page }) => {
      await open(page, system, mode);
      await expect.poll(async () => (await calls(page)).authority).toBe(1);
      await expect(page.getByText("General layout:")).toHaveCount(0);
    });
  }
}
