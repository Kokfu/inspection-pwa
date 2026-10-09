import { expect, test } from "@playwright/test";

/**
 * L-5: the header summary reads the technician location-proposal outbox on real IndexedDB.
 */
test("header summary reflects Pending, Failed and confirmed location proposals (L-5)", async ({ page }) => {
  await page.goto("/tests/header-proposal-sync-summary.html");
  await page.getByRole("button", { name: "Run header proposal sync summary checks", exact: true }).click();
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
