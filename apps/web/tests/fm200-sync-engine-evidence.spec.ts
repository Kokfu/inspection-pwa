import { expect, test } from "@playwright/test";

test("FM200 V7 evidence stages through syncEngine before its parent is accepted", async ({ page }) => {
  await page.goto("/tests/fm200-sync-engine-evidence.html");
  await page.getByRole("button", { name: "Run FM200 sync check" }).click();
  await expect.poll(async () => {
    const output = await page.locator("#result").innerText();
    try { return JSON.parse(output).status; } catch { return output; }
  }).toBe("PASS");
});
