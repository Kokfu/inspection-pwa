import { expect, test, type Page } from "@playwright/test";

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
      // Each tab's cards must be measured while visible, including the Sites card.
      for (const tab of ["Details", "Sites"] as const) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        const cards = page.locator(".customer-form-card:visible");
        await expect(cards).toHaveCount(tab === "Details" ? 2 : 1);
        for (const configCard of await cards.all()) {
          const configBox = await configCard.boundingBox();
          expect(configBox).not.toBeNull();
          expect(configBox!.width).toBe(box!.width);
          expect(configBox!.x).toBe(box!.x);
        }
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

const operations = "/tests/manager-operations-polish.html?screen=operations";
const rows = (page: Page) => page.locator(".ops-table tbody tr");
const chip = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name} \\d+$`) });

test("Operations status chips filter the list immediately and their counts match", async ({ page }) => {
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);
  await expect(page.getByLabel(/Show active/)).toHaveCount(0);
  await expect(chip(page, "Open")).toHaveText("Open 2");
  await expect(chip(page, "Completed")).toHaveText("Completed 1");
  await expect(chip(page, "Total")).toHaveText("Total 3");
  await expect(chip(page, "Total")).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(3);
  await chip(page, "Open").click();
  await expect(chip(page, "Open")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Total")).toHaveAttribute("aria-pressed", "false");
  await expect(rows(page)).toHaveCount(2);
  await chip(page, "Completed").click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("SV-12");
  // Technician narrows the counts as well as the list.
  await chip(page, "Total").click();
  await page.getByLabel("Technician").selectOption("2");
  await expect(chip(page, "Open")).toHaveText("Open 1");
  await expect(chip(page, "Completed")).toHaveText("Completed 1");
  await expect(chip(page, "Total")).toHaveText("Total 2");
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(chip(page, "Total")).toHaveText("Total 3");
  await expect(page.getByLabel("Technician")).toHaveValue("");
  await expect(rows(page)).toHaveCount(3);
});

test("Operations search is live and matches customer, site or SV number case-insensitively", async ({ page }) => {
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  const search = page.getByLabel("Search");
  await search.fill("alpha");
  await expect(rows(page)).toHaveCount(2);
  await expect(chip(page, "Total")).toHaveText("Total 2");
  await search.fill("ROOFTOP");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("SV-11");
  await search.fill("sv-12");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Alpha Customer");
  await search.fill("no such visit");
  await expect(page.getByText("No service visits match.")).toBeVisible();
  await search.fill("");
  await expect(rows(page)).toHaveCount(3);
});

test("Operations table sorts oldest open first and highlights only open visits older than 2 days", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".ops-table thead th")).toHaveText(["Customer", "Technician", "Progress", "Created", "Age", "Actions"]);
  await expect(rows(page).nth(0)).toContainText("SV-10");
  await expect(rows(page).nth(1)).toContainText("SV-11");
  await expect(rows(page).nth(2)).toContainText("SV-12");
  await expect(rows(page).nth(0)).toContainText("Tech 1");
  await expect(rows(page).nth(0)).toContainText("0/1");
  const age = (index: number) => rows(page).nth(index).locator("td").nth(4);
  await expect(age(0)).toHaveAttribute("data-old", "true");
  await expect(age(0)).toContainText("9d");
  const danger = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--danger-ink").trim());
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  await expect(age(0)).toHaveCSS("color", rgb(danger));
  // Exactly 2 days is not "older than 2 days"; a completed visit has no age.
  await expect(age(1)).not.toHaveAttribute("data-old", "true");
  await expect(age(1)).toContainText("2d");
  await expect(age(1)).not.toHaveCSS("color", rgb(danger));
  await expect(age(2)).toHaveText("—");
  // One minute past the threshold flips it.
  await page.goto(`${operations}&now=2026-09-10T00:01:00.000Z`, { waitUntil: "domcontentloaded" });
  await expect(age(1)).toHaveAttribute("data-old", "true");
});

test("Operations columns sort from their headers, like Upcoming Services, with no Sort by control", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Sort by")).toHaveCount(0);
  const order = async () => (await rows(page).allInnerTexts()).map((text) => /SV-1\d/.exec(text)![0]);
  const defaultOrder = await order();
  const created = page.getByRole("columnheader", { name: /Created/ });
  await expect(created).not.toHaveAttribute("aria-sort");
  await created.getByRole("button").click();
  await expect(created).toHaveAttribute("aria-sort", "ascending");
  await expect(created).toContainText("▲");
  const oldestFirst = await order();
  await created.getByRole("button").click();
  await expect(created).toHaveAttribute("aria-sort", "descending");
  await expect(created).toContainText("▼");
  expect(await order()).toEqual([...oldestFirst].reverse());
  const customer = page.getByRole("columnheader", { name: /Customer/ });
  await customer.getByRole("button").click();
  await expect(customer).toHaveAttribute("aria-sort", "ascending");
  await expect(created).not.toHaveAttribute("aria-sort");
  await expect(rows(page).nth(0)).toContainText("Alpha Customer");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(customer).not.toHaveAttribute("aria-sort");
  expect(await order()).toEqual(defaultOrder);
});

test("Operations row opens its visit; its own actions do not", async ({ page }) => {
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  const selected = () => page.evaluate(() => (window as Window & { selectedVisits: string[] }).selectedVisits);
  await rows(page).nth(1).locator("td").nth(3).click();
  expect(await selected()).toEqual(["00000000-0000-4000-8000-000000000011"]);
  await rows(page).nth(1).getByRole("button", { name: "Beta Customer" }).click();
  expect(await selected()).toHaveLength(2);
  page.once("dialog", (dialog) => dialog.dismiss());
  await rows(page).nth(0).getByRole("button", { name: "Delete" }).click();
  expect(await selected()).toHaveLength(2);
});

test("on a phone Operations keeps the cards and shows the technician on each", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".ops-table")).toHaveCount(0);
  const cards = page.locator(".job-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Tech 1");
  await expect(cards.nth(1)).toContainText("Tech 2");
  await expect(cards.nth(2)).toContainText("Tech 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: "test-results/operations-list-phone.png", fullPage: true });
  await cards.nth(1).click();
  expect(await page.evaluate(() => (window as Window & { selectedVisits: string[] }).selectedVisits)).toEqual(["00000000-0000-4000-8000-000000000011"]);
});

test("Operations keeps Delete rules: only a visit with no accepted records can be deleted", async ({ page }) => {
  await page.goto(operations, { waitUntil: "domcontentloaded" });
  const deletes = page.getByRole("button", { name: "Delete" });
  await expect(deletes).toHaveCount(2);
  await expect(deletes.nth(0)).toBeEnabled();
  await expect(deletes.nth(1)).toBeDisabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await deletes.first().click();
  expect(await page.evaluate(() => (window as Window & { deletedVisits: string[] }).deletedVisits)).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await deletes.first().click();
  await expect.poll(() => page.evaluate(() => (window as Window & { deletedVisits: string[] }).deletedVisits.length)).toBe(1);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.screenshot({ path: "test-results/operations-list-desktop.png", fullPage: true });
});

test("the repair approval banner is one slim line linking to the repairs page and hides at zero", async ({ page }) => {
  const banner = (query: string) => page.goto(`/tests/manager-operations-polish.html?screen=banner&${query}`, { waitUntil: "domcontentloaded" });
  await banner("awaiting=2");
  const link = page.getByRole("link", { name: "Review" });
  await expect(page.getByText("2 repair visits awaiting approval")).toBeVisible();
  await expect(link).toHaveAttribute("href", "#/manager-repairs");
  await expect(page.getByRole("heading", { name: "Repair visits awaiting approval" })).toHaveCount(0);
  expect((await page.locator(".ops-repair-banner").boundingBox())!.height).toBeLessThan(80);
  await banner("awaiting=1");
  await expect(page.getByText("1 repair visit awaiting approval")).toBeVisible();
  await banner("awaiting=0");
  await expect(page.getByRole("link", { name: "Review" })).toHaveCount(0);
  await expect(page.locator(".ops-repair-banner")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as Window & { repairRequests: number }).repairRequests)).toBe(1);
});

test("the repair banner reports a failed load instead of a zero count and passes authority failures on", async ({ page }) => {
  await page.goto("/tests/manager-operations-polish.html?screen=banner&fail=500", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert")).toContainText("could not be refreshed");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".ops-repair-banner")).toHaveCount(0);
  await page.goto("/tests/manager-operations-polish.html?screen=banner&fail=403", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => (window as Window & { authorityFailures?: number }).authorityFailures)).toBe(1);
});
