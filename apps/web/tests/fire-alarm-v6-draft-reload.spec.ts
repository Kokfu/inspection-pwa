import { expect, test } from "@playwright/test";

async function state(page: import("@playwright/test").Page, expected: string) {
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; }
    catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe(expected);
  return JSON.parse(await page.locator("#result").innerText());
}

test("V6 Fire Alarm production Draft persists its frozen V6 tuple, results, rows, and photo Blob through a browser reload", async ({ page }) => {
  await page.goto("/tests/fire-alarm-v6-draft-reload.html");
  await page.locator("#run").click();
  await state(page, "READY_RELOAD");
  await page.reload();
  await page.evaluate(() => (window as Window & { runAfterReload: () => Promise<void> }).runAfterReload());
  const result = await state(page, "PASS");
  expect(result.checks).toHaveLength(5);
  expect(result.checks.every((item: { passed: boolean }) => item.passed)).toBe(true);
});
