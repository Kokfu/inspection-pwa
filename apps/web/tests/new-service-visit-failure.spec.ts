import { expect, test } from "@playwright/test";

test("New Service Visit preserves the populated form when creation fails", async ({ page }) => {
  await page.goto("/tests/new-service-visit-failure.html");
  await page.getByRole("button", { name: "Run New Service Visit failure checks", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 15_000 }).toBe("PASS");
});
