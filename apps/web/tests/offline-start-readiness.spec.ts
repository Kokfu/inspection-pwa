import { expect, test } from "@playwright/test";

/** I-02 / A1: a never-opened system may start offline only when the server recently confirmed nothing was accepted. */
test("offline start readiness (real IndexedDB, real resolvers)", async ({ page }) => {
  await page.goto("/tests/offline-start-readiness.html");
  await page.getByRole("button", { name: "Run offline start readiness checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  const failed = (result.checks as Array<{ name: string; passed: boolean; detail: string }>).filter((item) => !item.passed);
  expect(failed, JSON.stringify(failed)).toEqual([]);
  expect(result.status, JSON.stringify(result)).toBe("PASS");
});
