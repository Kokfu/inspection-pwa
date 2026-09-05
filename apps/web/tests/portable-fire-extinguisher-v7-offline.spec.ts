import { expect, test } from "@playwright/test";

async function state(page: import("@playwright/test").Page, expected: string) {
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).toBe(expected);
  return JSON.parse(await page.locator("#result").innerText());
}

test("Portable Fire Extinguisher on a V7-templated job runs the full offline round trip with zero evidence capability", async ({ page }) => {
  await page.goto("/tests/portable-fire-extinguisher-v7-offline.html");
  await page.locator("#run").click();
  const initial = await state(page, "READY_RELOAD");
  expect(initial.checks.every((item: { passed: boolean }) => item.passed), JSON.stringify(initial.checks)).toBe(true);
  await page.reload();
  await page.evaluate(() => (window as Window & { runAfterReload: () => Promise<void> }).runAfterReload());
  const result = await state(page, "PASS");
  expect(result.checks.every((item: { passed: boolean }) => item.passed), JSON.stringify(result.checks)).toBe(true);
  await expect(page.locator("#accepted img")).toHaveCount(0);
});
