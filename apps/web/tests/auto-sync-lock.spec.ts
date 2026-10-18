import { expect, test } from "@playwright/test";

// I-65 with real Web Locks across real pages: while one tab runs the automatic sync, the other tabs skip.
test("I-65: only one tab sends the automatic sync at a time", async ({ context }) => {
  const [a, b, c] = [await context.newPage(), await context.newPage(), await context.newPage()];
  for (const page of [a, b, c]) { await page.goto("/tests/auto-sync-lock.html"); await page.waitForFunction(() => (window as any).ready === true); }
  await a.evaluate(() => (window as any).hold());
  await expect.poll(() => b.evaluate(() => (window as any).attempt())).toBe("skipped");
  expect(await c.evaluate(() => (window as any).attempt())).toBe("skipped");
  await a.evaluate(() => (window as any).release());
  expect(await a.evaluate(() => (window as any).first)).toBe("ran");
  await expect.poll(() => b.evaluate(() => (window as any).attempt())).toBe("ran");
  // A tab that disappears while holding the lock frees it for the others.
  await a.evaluate(() => (window as any).hold());
  expect(await b.evaluate(() => (window as any).attempt())).toBe("skipped");
  await a.close();
  await expect.poll(() => c.evaluate(() => (window as any).attempt())).toBe("ran");
});
