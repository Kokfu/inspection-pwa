import { expect, test } from "@playwright/test";

test("Manager Final Report Back to Operations bypasses service-visit detail", async ({ page }) => {
  await page.goto("/tests/manager-final-report-navigation.html");
  await page.getByRole("button", { name: "Run Manager Final Report navigation", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");

  const outcome = JSON.parse(await page.locator("#result").innerText()) as { detailRequests: number };
  expect(outcome.detailRequests).toBe(1);
});
