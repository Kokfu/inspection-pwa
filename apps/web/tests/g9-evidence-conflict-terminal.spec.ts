import { expect, test } from "@playwright/test";

test("G9 evidence conflict becomes Needs attention and is not sent again", async ({ page }) => {
  await page.goto("/tests/g9-evidence-conflict-terminal.html");
  await page.locator("#run").click();
  await expect.poll(
    async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } },
    { timeout: 60_000 }
  ).toBe("PASS");
});
