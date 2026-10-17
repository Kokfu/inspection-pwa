import { expect, test } from "@playwright/test";

// Real Web Locks across real pages: the count must follow pages opening and closing, with no IndexedDB involved.
test("I-70: each tab sees how many other tabs hold a presence lock, and closing a tab drops it", async ({ context }) => {
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const page = await context.newPage();
    await page.goto("/tests/other-tabs.html");
    await page.waitForFunction(() => (window as any).tabsReady === true);
    pages.push(page);
  }
  const others = (index: number) => pages[index].evaluate(() => (window as any).otherTabs() as Promise<number>);
  await expect.poll(() => others(3)).toBe(3);
  await expect.poll(() => others(0)).toBe(3);
  await pages[1].close();
  await expect.poll(() => others(3)).toBe(2);
  await pages[2].close();
  await expect.poll(() => others(0)).toBe(1);
  await expect.poll(() => others(3)).toBe(1);
  await pages[0].close();
  await expect.poll(() => others(3)).toBe(0);
  await pages[3].close();
});

test("I-70: the real app shell warns from the fourth tab and clears when tabs close", async ({ context }) => {
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Field Service Management" })).toBeVisible();
    pages.push(page);
  }
  const notice = (index: number) => pages[index].getByRole("status").filter({ hasText: "Too many open tabs" });
  // The newest tab reads the locks once at mount, so it sees the three earlier tabs without waiting for the 10 s poll.
  await expect(notice(3)).toBeVisible({ timeout: 8000 });
  await expect(notice(3)).toContainText("open in 3 other browser tabs");
  await expect(notice(0)).toHaveCount(0); // tab 1 has not re-polled yet and would not warn below 3 anyway when it mounted
  await pages[1].close();
  await pages[2].close();
  // Back below the threshold after the next poll or when the tab is shown again.
  await pages[3].bringToFront();
  await pages[3].evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(notice(3)).toHaveCount(0, { timeout: 15000 });
  for (const page of [pages[0], pages[3]]) await page.close();
});
