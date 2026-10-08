import { expect, test } from "@playwright/test";

test("I-21: a Fire Intercom corrected copy retires the rejected record atomically and makes photo correction possible", async ({ page }) => {
  await page.goto("/tests/fire-intercom-corrected-copy.html");
  await page.locator("#run").click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result.checks ?? result.message)).toBe("PASS");
  expect(result.checks.every((item: { passed: boolean }) => item.passed), JSON.stringify(result.checks)).toBe(true);
});
