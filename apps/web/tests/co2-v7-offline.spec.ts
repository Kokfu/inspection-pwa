import { expect, test } from "@playwright/test";

async function state(page: import("@playwright/test").Page, expected: string) {
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).toBe(expected);
  return JSON.parse(await page.locator("#result").innerText());
}

test("CO2 V7 production repository persists a frozen evidence-first pending form through a real IndexedDB browser reload", async ({ page }) => {
  await page.goto("/tests/co2-v7-offline.html"); await page.locator("#run").click(); const initial = await state(page, "READY_RELOAD");
  await page.reload(); await page.evaluate(() => (window as Window & { runAfterReload: () => Promise<void> }).runAfterReload()); const result = await state(page, "PASS");
  expect(initial.checks.every((item: { passed: boolean }) => item.passed)).toBe(true); expect(result.checks.every((item: { passed: boolean }) => item.passed)).toBe(true);
  expect(result.calls.filter((item: { kind: string }) => item.kind === "accept")).toEqual([]);
});
