import { expect, test } from "@playwright/test";

/**
 * I-49: a layout proposal the server refuses with 409 LOCATION_PROPOSAL_ALREADY_PENDING (an earlier proposal for the
 * same target is awaiting review) used to stay Failed: 'Sync needs attention' for ever, retried on every sync. It is now
 * retired (outbox Completed, never retried, header clear) with a calm 'not sent' text, and is never marked Synced.
 * Any other 409 is still a flagged, retryable failure. Real Dexie/IndexedDB in a real browser tab.
 */
test("I-49: an already-pending 409 retires the proposal calmly; any other 409 stays a flagged failure", async ({ page }) => {
  await page.goto("/tests/layout-proposal-already-pending.html");
  await page.getByRole("button", { name: "Run already-pending proposal checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");
});
