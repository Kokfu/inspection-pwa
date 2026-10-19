import { expect, test } from "@playwright/test";

for (const [title, button] of [
  ["repair visit header never claims synced while startup or switched-account reads are unresolved", "Run repair visit header loading checks"],
  ["repair visit header follows real IndexedDB evidence and parent states across workspace changes", "Run repair visit header checks"]
] as const) {
  test(title, async ({ page }) => {
    await page.goto("/tests/header-repair-visit-sync-summary.html");
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect.poll(async () => {
      try {
        const result = JSON.parse(await page.locator("#result").innerText());
        return result.status === "PASS" ? "PASS" : JSON.stringify(result);
      } catch { return "RUNNING"; }
    }, { timeout: 60_000 }).toBe("PASS");
  });
}
