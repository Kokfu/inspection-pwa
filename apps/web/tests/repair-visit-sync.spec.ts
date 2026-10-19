import { expect, test } from "@playwright/test";

/**
 * Repair visit sync (Level 2): create first, photos next, submit last, each only after the server echoed the exact UUID and
 * its own fingerprint; refusal -> Needs attention with every byte kept; interrupted and offline retries; stale and concurrent
 * callers; returned -> edit -> resubmit; delete rules; field lists and Before photos for offline use.
 */
test("repair visits sync create-first with exact-UUID and fingerprint confirmation and lose no data", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/tests/repair-visit-sync.html");
  await page.getByRole("button", { name: "Run repair visit sync checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 90_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status === "ERROR" ? result.message : "", "harness error").toBe("");
  expect(result.checks.filter((check: { ok: boolean }) => !check.ok), JSON.stringify(result, null, 1)).toEqual([]);
  expect(result.checks.length).toBeGreaterThanOrEqual(50);
  expect(result.status).toBe("PASS");
});
