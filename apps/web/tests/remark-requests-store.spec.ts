import { expect, test } from "@playwright/test";

/**
 * R3: the device-side remark-request store and sync against REAL IndexedDB in a real browser tab (this project has no
 * fake-indexeddb dependency). Covers the Offline Contract: the local entry and the outbox item are written in one
 * transaction (rolled back together), a request is created with navigator.onLine === false, only the exact echoed UUID
 * completes an item (never HTTP 200 alone), a timeout retries the same single outbox item, a definite refusal keeps the
 * server's own message, malformed refreshes leave the last good cache untouched, and the generic /api/sync loop never takes
 * a remarkRequest item.
 */
test("remark request store and sync: atomic offline create, exact-uuid confirmation, retry without duplicates, fail-closed refresh", async ({ page }) => {
  await page.goto("/tests/remark-requests-store.html");
  await page.locator("body[data-harness-ready='1']").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Run remark request store and sync checks", exact: true }).click();
  await expect
    .poll(async () => {
      try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
    }, { timeout: 60_000 })
    .not.toBe("RUNNING");
  const outcome = JSON.parse(await page.locator("#result").innerText()) as { status: string; message?: string; checks: Array<{ name: string; ok: boolean }> };
  expect(outcome.status, outcome.message ?? JSON.stringify(outcome.checks.filter((check) => !check.ok))).toBe("PASS");
  expect(outcome.checks.length).toBeGreaterThan(60);
  expect(outcome.checks.filter((check) => !check.ok)).toEqual([]);
});
