import { expect, test, type Page } from "@playwright/test";

const inspect = (page: Page) => page.evaluate(() => (window as any).inspect());

async function fillInspection(page: Page) {
  await page.getByLabel("Date Tested").fill("2026-10-09");
  await page.getByLabel("Zone", { exact: true }).fill("Zone 1");
  await page.getByLabel("Inspected By").fill("Inspector A");
  for (const name of ["Auto Alarm Mode result", "Manual Mode result"]) {
    for (const group of await page.getByRole("group", { name }).all()) await group.getByRole("button", { name: "Good", exact: true }).click();
  }
}

test("a first visit asks how many shutters before the form, validates the count, and keeps the rows after reload", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await expect(page.getByRole("heading", { name: "How many shutters?" })).toBeVisible();
  await expect(page.getByLabel("Date Tested")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Row" })).toHaveCount(0);
  for (const bad of ["0", "251", "1.5", ""]) {
    await page.getByLabel("Number of shutters").fill(bad);
    await page.getByRole("button", { name: "Start Inspection" }).click();
    await expect(page.getByRole("alert")).toContainText("Enter a whole number from 1 to 250.");
  }
  await page.getByLabel("Number of shutters").fill("4");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "How many shutters?" })).toHaveCount(0);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.length).toBe(4);
  const stored = (await inspect(page)).stored;
  expect(stored.responses.rows.map((row: any) => row.sortOrder)).toEqual([1, 2, 3, 4]);
  expect(stored.responses.rows.every((row: any) => row.source === "technician")).toBe(true);
  await page.reload();
  await expect(page.locator(".hose-row-card")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "How many shutters?" })).toHaveCount(0);
});

test("removing every row while filling the form does not bring the count prompt back", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of shutters").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await page.locator(".hose-row-card").getByRole("button", { name: "Remove Row" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Row" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How many shutters?" })).toHaveCount(0);
});

test("submitting a first-visit layout saves it for next visit automatically, offline, with no extra button", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of shutters").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  const cards = page.locator(".hose-row-card");
  await cards.nth(0).getByLabel("Asset Reference").fill("RS-A");
  await cards.nth(0).getByLabel("Location").fill("Admin Office");
  await cards.nth(1).getByLabel("Location").fill("CNC Drill");
  await fillInspection(page);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).stored.syncStatus).toBe("Pending");
  await expect(page.getByText("Shutter layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "RS-A", locationText: "Admin Office" }, { assetReference: "", locationText: "CNC Drill" }
  ] });
  expect(state.outbox.filter((item: any) => item.entityType === "masterSystemInspection")).toHaveLength(1);
});

test("a saved layout is confirmed, not re-asked, and an unchanged layout proposes nothing on submit", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?configured=1");
  await expect(page.getByRole("heading", { name: "Same shutters as last time" })).toBeVisible();
  await expect(page.getByText("RS-01 – Old Lobby")).toBeVisible();
  await expect(page.getByLabel("Date Tested")).toHaveCount(0);
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(1);
  await fillInspection(page);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).stored.syncStatus).toBe("Pending");
  expect((await inspect(page)).proposal).toBeUndefined();
  await expect(page.getByText(/Shutter layout/)).toHaveCount(0);
});

test("extra shutters on a saved layout become a proposal that keeps the saved rows first", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?configured=1");
  await page.getByLabel("Extra shutters this visit (optional)").fill("250");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a whole number from 0 to 249.");
  await page.getByLabel("Extra shutters this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(2);
  await page.locator(".hose-row-card").nth(1).getByLabel("Location").fill("Loading bay");
  await fillInspection(page);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).proposal?.status).toBe("Pending");
  expect((await inspect(page)).proposal.patch.rows).toEqual([
    { assetReference: "RS-01", locationText: "Old Lobby" }, { assetReference: "", locationText: "Loading bay" }
  ]);
});

test("the setup prompt fits phone, tablet and desktop widths with 44px controls", async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tests/fire-rated-roller-shutter-form.html");
    await expect(page.getByRole("heading", { name: "How many shutters?" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await page.getByRole("button", { name: "Start Inspection" }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const input = page.getByLabel("Number of shutters");
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  }
});
