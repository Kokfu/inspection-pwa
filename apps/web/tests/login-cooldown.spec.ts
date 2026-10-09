import { expect, test } from "@playwright/test";

for (const viewport of [{width:360,height:800},{width:768,height:1024},{width:1280,height:800}]) test(`login cooldown at ${viewport.width}px remains usable`, async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(viewport);
  await page.route("**/api/**", async route => {
    if(route.request().url().endsWith("/auth/login")) await route.fulfill({status:429,headers:{"Retry-After":"42"},contentType:"application/json",body:JSON.stringify({error:"LOGIN_COOLDOWN"})});
    else await route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({error:"AUTH_REQUIRED"})});
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Technician Complete assigned inspections/ }).click();
  await page.getByLabel("Username").fill("disposable-inspector");
  await page.getByLabel("Password").fill("disposable-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByText("Too many login attempts. Try again in 42 seconds.")).toBeVisible();
  await expect(page.getByLabel("Username")).toBeEnabled();
  await expect(page.getByLabel("Password")).toBeEnabled();
  await page.getByLabel("Username").fill("another-inspector");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
