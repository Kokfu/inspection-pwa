import { expect, test } from "@playwright/test";

const scenarios = ["basic", "retry", "bounded", "cancel", "unmount", "authorization", "unavailable", "malformed", "outbox", "race"];

for (const scenario of scenarios) {
  test(`connectivity recovery: ${scenario}`, async ({ page }) => {
    await page.goto(`/tests/connectivity-recovery.html?scenario=${scenario}`);
    await page.getByRole("button", { name: "Run connectivity recovery scenario", exact: true }).click();
    await expect.poll(async () => {
      const text = await page.locator("#result").innerText();
      try {
        return JSON.parse(text).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 15_000 }).toBe("PASS");
  });
}
