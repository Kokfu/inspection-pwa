import { expect, test } from "@playwright/test";

test("Dry/Wet Riser uses frozen mode authority and preserves outlet behavior", async ({ page }) => {
  await page.goto("/tests/dry-wet-riser-form-behavior.html");
  await page.getByRole("button", { name: "Run Dry/Wet Riser form behavior checks", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 15_000 }).toBe("PASS");
});
