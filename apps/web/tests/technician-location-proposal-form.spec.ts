import { expect, test } from "@playwright/test";

/**
 * Final-check findings L-1 and L-2, driven through the real `TechnicianLocationProposal` screen on real
 * IndexedDB: (L-1) the zone shown in the form is the zone saved, so a name alone enables Submit;
 * (L-2) a saved draft, and a Pending proposal, are still there after the screen is mounted again.
 */
test("technician add-location form: default zone submits, saved draft and Pending state survive a reload", async ({ page }) => {
  await page.goto("/tests/technician-location-proposal-form.html");
  await page.getByRole("button", { name: "Run technician location proposal form checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        const result = JSON.parse(await page.locator("#result").innerText());
        if (result.status === "FAIL" || result.status === "ERROR") return JSON.stringify(result);
        return result.status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");
});
