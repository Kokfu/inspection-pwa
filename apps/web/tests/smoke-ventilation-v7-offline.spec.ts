import { expect, test } from "@playwright/test";

async function state(page: import("@playwright/test").Page, expected: string) {
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).toBe(expected);
  return JSON.parse(await page.locator("#result").innerText());
}

test("Smoke Ventilation V7 runs the full offline round trip: draft, reload, sync, accepted photos load", async ({ page }) => {
  await page.goto("/tests/smoke-ventilation-v7-offline.html");
  await page.locator("#run").click();
  const initial = await state(page, "READY_RELOAD");
  expect(initial.checks.every((item: { passed: boolean }) => item.passed), JSON.stringify(initial.checks)).toBe(true);
  await page.reload();
  await page.evaluate(() => (window as Window & { runAfterReload: () => Promise<void> }).runAfterReload());
  const result = await state(page, "PASS");
  expect(result.checks.every((item: { passed: boolean }) => item.passed), JSON.stringify(result.checks)).toBe(true);
  await expect(page.locator('#accepted a[href*="/api/v7-evidence/accepted/"]')).toHaveCount(3);
  await expect(page.locator("#accepted img")).toHaveCount(3);
});
