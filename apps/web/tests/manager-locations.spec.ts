import { expect, test } from "@playwright/test";

/**
 * DoD (Phase 8H STEP 3.1 slice 3a): the Manager screen loads the current
 * zones/locations for a location-dependent system, adds a zone, adds a location
 * on it and saves, a reload shows it persisted, removing the locations and saving
 * clears them, and a poisoned HTTP 200 body / `null` root / wrong `systemKey` / a
 * location `zoneId` that is not one of the returned zone ids / a duplicate zone
 * id / a poisoned `customer` echo all route to `onAuthorityFailure` (never
 * `onSaved`) rather than a render-time crash.
 */
test("Manager locations editor: load, add, save, reload, clear, poisoned", async ({ page }) => {
  await page.goto("/tests/manager-locations.html");
  await page.getByRole("button", { name: "Run manager locations checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");
});
