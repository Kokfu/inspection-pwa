import { expect, test } from "@playwright/test";

/**
 * Offline service visit sync (Level 2): create first, forms wait for the exact UUID, refusal -> Needs attention with
 * everything kept, interrupted sync, retry after the cause is fixed, stale replies, local delete rules.
 */
test("offline-created visit syncs create-first with exact-UUID confirmation and loses no data", async ({ page }) => {
  await page.goto("/tests/offline-service-visit-sync.html");
  await page.getByRole("button", { name: "Run offline service visit sync checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 60_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status === "ERROR" ? result.message : "", "harness error").toBe("");
  expect(result.checks.filter((check: { ok: boolean }) => !check.ok), JSON.stringify(result, null, 1)).toEqual([]);
  expect(result.checks.length).toBeGreaterThanOrEqual(40);
  expect(result.status).toBe("PASS");
});
