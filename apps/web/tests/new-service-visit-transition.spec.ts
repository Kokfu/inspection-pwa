import { expect, test } from "@playwright/test";

test("New Service Visit never presents a previous customer's configuration during transition", async ({ page }) => {
  await page.goto("/tests/new-service-visit-transition.html");
  await page.getByRole("button", { name: "Run New Service Visit customer transition checks", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 15_000 }).toBe("PASS");
});
