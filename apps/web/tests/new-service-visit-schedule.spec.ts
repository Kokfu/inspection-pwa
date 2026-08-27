import { expect, test } from "@playwright/test";

test("New Service Visit submits no browser schedule and accepts the server creation time", async ({ page }) => {
  await page.goto("/tests/new-service-visit-schedule.html");
  await page.getByRole("button", { name: "Run New Service Visit creation-time checks", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 15_000 }).toBe("PASS");
});
