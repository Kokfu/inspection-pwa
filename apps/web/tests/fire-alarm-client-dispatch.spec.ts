import { expect, test } from "@playwright/test";

test("Fire Alarm V3/V4/V5 use the historical client path and V6 uses evidence-first", async ({ page }) => {
  await page.goto("/tests/fire-alarm-client-dispatch.html");
  await page.locator("#run").click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; }
    catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");
});
