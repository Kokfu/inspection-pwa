import { expect, test } from "@playwright/test";

/**
 * I-51 / I-55: the real sync engine, real Dexie, a faked 401 and 403 from /api/sync. A 401 keeps 'Sign in required';
 * a 403 says the server refused (never 'sign in'); both leave the record Failed and retryable.
 */
test("sync engine: a 401 and a 403 from /api/sync are stored with the right wording and stay retryable", async ({ page }) => {
  await page.goto("/tests/sync-refusal-engine.html");
  await page.getByRole("button", { name: "Run sync refusal engine checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");
});
