import { expect, test } from "@playwright/test";

test("Hose Reel V7 accepted detail renders field-owned evidence across checklist, test-run, and drum-row paths", async ({ page }) => {
  await page.goto("/tests/hose-reel-v7-offline.html");
  await page.locator("#run").click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).toBe("PASS");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.checks.every((item: { passed: boolean }) => item.passed)).toBe(true);
  await expect(page.locator('#accepted a[href*="/api/v7-evidence/accepted/"]')).toHaveCount(3);
  await expect(page.locator("#accepted img")).toHaveCount(3);
});
