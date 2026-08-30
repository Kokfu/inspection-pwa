import { expect, test } from "@playwright/test";

test("V6 accepted detail opens each accepted photo through the binary API rather than the SPA", async ({ page, context }) => {
  const served: string[] = [];
  await context.route("**/api/v6-evidence/accepted/*/content", async (route) => {
    served.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: served.length === 1 ? Buffer.from([0xff, 0xd8, 0xff, 0xd9]) : Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xd9]) });
  });
  await page.goto("/tests/fire-alarm-v6-accepted-detail.html");
  await page.locator("#run").click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; }
    catch { return "RUNNING"; }
  }, { timeout: 30_000 }).toBe("RENDERED");

  const links = page.locator("#view a");
  await expect(links).toHaveCount(2);
  const hrefA = await links.nth(0).getAttribute("href");
  const hrefB = await links.nth(1).getAttribute("href");
  expect(hrefA).toMatch(/^\/api\/v6-evidence\/accepted\/[0-9a-f-]+\/content$/);
  expect(hrefB).toMatch(/^\/api\/v6-evidence\/accepted\/[0-9a-f-]+\/content$/);
  expect(hrefA).not.toBe(hrefB);

  const [photoA] = await Promise.all([page.waitForEvent("popup"), links.nth(0).click()]);
  await photoA.waitForLoadState();
  await expect(photoA).toHaveURL(hrefA!);
  await expect(page).toHaveURL(/fire-alarm-v6-accepted-detail\.html$/);

  const [photoB] = await Promise.all([page.waitForEvent("popup"), links.nth(1).click()]);
  await photoB.waitForLoadState();
  await expect(photoB).toHaveURL(hrefB!);
  await expect(page).toHaveURL(/fire-alarm-v6-accepted-detail\.html$/);
  expect(served).toEqual([hrefA, hrefB]);
});
