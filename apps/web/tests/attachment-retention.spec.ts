import { expect, test } from "@playwright/test";

test("I-07: local photo retention deletes only provably-final photos, in one transaction, once a day", async ({ page }) => {
  await page.goto("/tests/attachment-retention.html");
  await page.locator("#run").click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result.checks ?? result.message)).toBe("PASS");
  expect(result.checks.every((item: { passed: boolean }) => item.passed), JSON.stringify(result.checks)).toBe(true);
});
