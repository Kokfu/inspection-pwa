import { expect, test } from "@playwright/test";

/**
 * Final-check finding L-3: in a long zones/locations editor a failed save used to show a generic message
 * at the top of the panel, far above the Save button. Now blank names and missing zones get a specific
 * message before anything is sent, and every outcome appears next to Save and in view.
 */
test("Manager locations editor: failed save shows a specific message next to the Save button", async ({ page }) => {
  await page.goto("/tests/manager-locations-save-feedback.html");
  await page.getByRole("button", { name: "Run manager locations save feedback checks", exact: true }).click();
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
