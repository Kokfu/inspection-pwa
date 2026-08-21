import { expect, test } from "@playwright/test";

test("mounted Manager Final Report failure matrix", async ({ page }) => {
  await page.goto("/tests/manager-final-report-failure-matrix.html");
  await page.getByRole("button", { name: "Run Manager Final Report failure matrix", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");

  const outcome = JSON.parse(await page.locator("#result").innerText()) as { cases: Array<{ name: string; pass: boolean }> };
  expect(outcome.cases).toHaveLength(11);
  expect(outcome.cases.every((scenario) => scenario.pass)).toBe(true);
});
