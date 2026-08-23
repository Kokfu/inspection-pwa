import { expect, test } from "@playwright/test";

async function runVisibleHarness(page: import("@playwright/test").Page, pathname: string) {
  await page.goto(pathname);
  await page.locator("#run").click();
  await expect.poll(async () => {
    const text = await page.locator("#result").innerText();
    try {
      return JSON.parse(text).status;
    } catch {
      return "RUNNING";
    }
  }, { timeout: 30_000 }).toBe("PASS");
}

test("existing Hydrant local draft, offline persistence, and exact-UUID sync regression", async ({ page }) => {
  await runVisibleHarness(page, "/tests/hydrant-local-sync.html");
});

test("existing Hose Reel offline draft and outbox safety regression", async ({ page }) => {
  await runVisibleHarness(page, "/tests/hose-reel-regression.html");
});
