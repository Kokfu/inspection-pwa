import { expect, test } from "@playwright/test";

test("customer forms share one centered desktop width and company actions align", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const widths: number[] = [];
  for (const [screen, selector] of [["technician", "form.customer-form-card"], ["manager", "form.customer-form-card"], ["configuration", ".customer-form-card"]] as const) {
    await page.goto(`/tests/manager-operations-polish.html?screen=${screen}`, { waitUntil: "domcontentloaded" });
    const card = page.locator(selector).first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    widths.push(box!.width);
    const parent = await card.evaluate((element) => element.parentElement!.getBoundingClientRect().toJSON());
    expect(Math.abs(box!.x + box!.width / 2 - (parent.x + parent.width / 2))).toBeLessThan(2);
    if (screen === "configuration") {
      for (const configCard of await page.locator(".customer-form-card").all()) {
        const configBox = await configCard.boundingBox();
        expect(configBox!.width).toBe(box!.width);
        expect(configBox!.x).toBe(box!.x);
      }
    }
    await page.screenshot({ path: `test-results/operations-polish-${screen}.png`, fullPage: true });
  }
  expect(new Set(widths).size).toBe(1);

  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 1024 });
    for (const screen of ["technician", "manager", "configuration"]) {
      await page.goto(`/tests/manager-operations-polish.html?screen=${screen}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".customer-form-card").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 360) await page.screenshot({ path: `test-results/operations-polish-${screen}-phone.png`, fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tests/manager-operations-polish.html?screen=profile", { waitUntil: "domcontentloaded" });
  const actions = page.locator(".manager-company-actions");
  await expect(actions).toBeVisible();
  const checkbox = await actions.getByLabel("Company details confirmed as final").boundingBox();
  const save = await actions.getByRole("button", { name: "Save company profile" }).boundingBox();
  expect(checkbox!.y + checkbox!.height / 2).toBeCloseTo(save!.y + save!.height / 2, 0);
  await page.screenshot({ path: "test-results/operations-polish-profile.png", fullPage: true });
});

test("Operations toggles and filters act independently and Clear restores visits", async ({ page }) => {
  await page.goto("/tests/manager-operations-polish.html?screen=operations", { waitUntil: "domcontentloaded" });
  const active = page.locator("section").filter({ has: page.getByRole("heading", { name: "Active Service Visits" }) }).last();
  const completed = page.locator("section").filter({ has: page.getByRole("heading", { name: "Completed Service Visits" }) }).last();
  await expect(active.locator(".job-card")).toHaveCount(2);
  await expect(completed.locator(".job-card")).toHaveCount(1);
  await page.getByLabel(/Show active/).uncheck();
  await expect(active.locator(".job-card")).toHaveCount(0);
  await expect(completed.locator(".job-card")).toHaveCount(1);
  await page.getByLabel(/Show active/).check();
  await page.getByLabel(/Show completed/).uncheck();
  await expect(active.locator(".job-card")).toHaveCount(2);
  await expect(completed.locator(".job-card")).toHaveCount(0);
  await page.getByLabel(/Show completed/).check();
  await page.getByLabel("Technician").selectOption("2");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(active.locator(".job-card")).toHaveCount(1);
  await page.getByLabel("Customer name").fill("Alpha");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(active.locator(".job-card")).toHaveCount(0);
  await expect(completed.locator(".job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(active.locator(".job-card")).toHaveCount(2);
  await expect(completed.locator(".job-card")).toHaveCount(1);
  await expect(active.getByRole("button", { name: "Delete" })).toHaveCount(2);
  await expect(active.getByRole("button", { name: "Delete" }).nth(1)).toBeDisabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await active.getByRole("button", { name: "Delete" }).first().click();
  expect(await page.evaluate(() => (window as Window & { deletedVisits: string[] }).deletedVisits)).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await active.getByRole("button", { name: "Delete" }).first().click();
  await expect.poll(() => page.evaluate(() => (window as Window & { deletedVisits: string[] }).deletedVisits.length)).toBe(1);
});
