import { expect, test } from "@playwright/test";

/** I-52: a retired (held) proposal says it was not sent and offers no Retry Sync; any other failure is unchanged. */
test("a proposal held behind an earlier pending one shows a calm note and no Retry Sync", async ({ page }) => {
  await page.goto("/tests/technician-location-proposal-held.html");
  await page.getByRole("button", { name: "Run held proposal checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");
});
