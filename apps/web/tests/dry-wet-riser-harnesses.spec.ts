import { expect, test } from "@playwright/test";

async function runHarness(page: import("@playwright/test").Page, path: string, button: string) {
  await page.goto(path);
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");
}

test("Dry/Wet Riser local and resolution harness", async ({ page }) => {
  await runHarness(page, "/tests/dry-wet-riser-local-and-resolution.html", "Run Dry/Wet Riser checks");
});

test("Dry/Wet Riser server-detail API authority harness", async ({ page }) => {
  await runHarness(page, "/tests/dry-wet-riser-server-detail.html", "Run Dry/Wet server-detail checks");
});
