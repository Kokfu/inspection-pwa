import { expect, test } from "@playwright/test";

/**
 * I-31: moving from one job's proposal screen to another job's with a different system set, WITHOUT the
 * component unmounting (as a route change does), must not crash or leak the previous job's selection.
 */
test("technician add-location form: switching to another job's proposal route re-derives the system (I-31)", async ({ page }) => {
  await page.goto("/tests/technician-location-proposal-job-switch.html");
  await page.getByRole("button", { name: "Run technician location proposal job switch checks", exact: true }).click();
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
