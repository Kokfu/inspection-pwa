import { expect, test } from "@playwright/test";

test("Manager Operations detail navigation creates one request and preserves hash navigation", async ({ page }) => {
  await page.goto("/tests/manager-navigation-request-count.html");
  await page.getByRole("button", { name: "Run Manager navigation request count", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try { return JSON.parse(text).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("PASS");

  const outcome = JSON.parse(await page.locator("#result").innerText()) as {
    clickDetailRequests: number;
    clickAbortedDetailRequests: number;
    hashchangeDetailRequests: number;
  };
  expect(outcome.clickDetailRequests).toBe(1);
  expect(outcome.clickAbortedDetailRequests).toBe(0);
  expect(outcome.hashchangeDetailRequests).toBe(2);
});
