import { expect, test } from "@playwright/test";

/**
 * CR-07: the device-side section-remark store and sync against REAL IndexedDB in a real browser tab (this project has
 * no fake-indexeddb dependency). Covers the Offline Contract points the module must satisfy: the cache entry and the
 * outbox item are written in one transaction (rolled back together), refresh merges rather than replaces and fails
 * closed on malformed server data, only the exact echoed UUID completes an item (never HTTP 200 alone), a timeout
 * retries the same single outbox item, a merged reply swaps the canonical id, and the generic /api/sync loop never
 * takes a sectionRemark item.
 */
test("section remark store and sync: atomic writes, fail-closed refresh, exact-uuid confirmation, retry without duplicates", async ({ page }) => {
  await page.goto("/tests/section-remarks-store.html");
  await page.locator("body[data-harness-ready='1']").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Run section remark store and sync checks", exact: true }).click();
  await expect
    .poll(async () => {
      try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
    }, { timeout: 60_000 })
    .not.toBe("RUNNING");
  const outcome = JSON.parse(await page.locator("#result").innerText()) as { status: string; message?: string; checks: Array<{ name: string; ok: boolean }> };
  expect(outcome.status, outcome.message ?? JSON.stringify(outcome.checks.filter((check) => !check.ok))).toBe("PASS");
  expect(outcome.checks.length).toBeGreaterThan(50);
  expect(outcome.checks.filter((check) => !check.ok)).toEqual([]);
});
