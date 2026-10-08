import { expect, test } from "@playwright/test";

test("I-21: every evidence system can start a corrected copy through its real repository export, atomically", async ({ page }) => {
  await page.goto("/tests/corrected-copy-all-systems.html");
  await page.locator("#run").click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 60_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result.checks ?? result.message)).toBe("PASS");
  expect(result.count).toBeGreaterThanOrEqual(11 * 10);
});
