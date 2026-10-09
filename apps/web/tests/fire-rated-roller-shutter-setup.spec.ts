import { expect, test, type Page } from "@playwright/test";

const inspect = (page: Page) => page.evaluate(() => (window as any).inspect());
const start = (page: Page) => page.getByRole("button", { name: "Start Inspection" }).click();

async function fillInspection(page: Page) {
  await page.getByLabel("Date Tested").fill("2026-10-09");
  if (await page.getByLabel("Zone", { exact: true }).count()) await page.getByLabel("Zone", { exact: true }).fill("Zone 1");
  await page.getByLabel("Inspected By").fill("Inspector A");
  for (const name of ["Auto Alarm Mode result", "Manual Mode result"]) {
    for (const group of await page.getByRole("group", { name }).all()) await group.getByRole("button", { name: "Good", exact: true }).click();
  }
}
const submitAndWait = async (page: Page) => {
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).stored.syncStatus).toBe("Pending");
};
const groupOf = (page: Page, heading: string) => page.locator(".location-group", { has: page.getByRole("heading", { name: heading, exact: true }) });

test("a first visit asks for zones and locations before the form and builds the zone groups", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await expect(page.getByRole("heading", { name: "How many zones and locations?" })).toBeVisible();
  await expect(page.getByLabel("Date Tested")).toHaveCount(0);
  await page.getByLabel("Number of zones").fill("5");
  await page.getByLabel("Locations in each zone").fill("4");
  await start(page);
  await expect(page.locator(".hose-row-card")).toHaveCount(20);
  for (const zone of ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"]) {
    await expect(groupOf(page, zone).locator(".hose-row-card")).toHaveCount(4);
    await expect(groupOf(page, zone).getByLabel("Zone name")).toHaveValue(zone);
  }
  await expect(page.getByLabel("Zone", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.length).toBe(20);
  const stored = (await inspect(page)).stored;
  expect(stored.responses.schemaVersion).toBe(2);
  expect(stored.responses.rows.map((row: any) => row.zoneText)).toEqual(["Zone 1", "Zone 1", "Zone 1", "Zone 1", "Zone 2", "Zone 2", "Zone 2", "Zone 2", "Zone 3", "Zone 3", "Zone 3", "Zone 3", "Zone 4", "Zone 4", "Zone 4", "Zone 4", "Zone 5", "Zone 5", "Zone 5", "Zone 5"]);
  expect(stored.responses.rows.map((row: any) => row.sortOrder)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  expect(stored.responses.rows.every((row: any) => row.source === "technician")).toBe(true);
  await page.reload();
  await expect(page.locator(".hose-row-card")).toHaveCount(20);
  await expect(page.getByRole("heading", { name: "How many zones and locations?" })).toHaveCount(0);
});

test("a different number of locations can be set per zone, and invalid plans are refused", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  for (const [zones, perZone, message] of [["0", "1", "Enter a whole number of zones from 1 to 50."], ["51", "1", "Enter a whole number of zones from 1 to 50."],
    ["2", "0", "Enter a whole number of locations from 1 to 250."], ["2", "251", "Enter a whole number of locations from 1 to 250."], ["2", "", "Enter a whole number of locations from 1 to 250."],
    ["2", "200", "That is 400 shutters. A visit can have at most 250."]] as const) {
    await page.getByLabel("Number of zones").fill(zones);
    await page.getByLabel("Locations in each zone").fill(perZone);
    await start(page);
    await expect(page.getByRole("alert")).toContainText(message);
  }
  await page.getByLabel("Number of zones").fill("3");
  await page.getByLabel("Locations in each zone").fill("2");
  await page.getByText("Different number of locations in some zones?").click();
  await page.getByLabel("Zone 2 locations").fill("5");
  await start(page);
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card")).toHaveCount(2);
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card")).toHaveCount(5);
  await expect(groupOf(page, "Zone 3").locator(".hose-row-card")).toHaveCount(2);
});

test("a single zone shows no zone headings and keeps the header Zone field", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Locations in each zone").fill("3");
  await start(page);
  await expect(page.locator(".hose-row-card")).toHaveCount(3);
  await expect(page.locator(".location-group h3")).toHaveCount(0);
  await expect(page.getByLabel("Zone", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Row" })).toBeVisible();
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.map((row: any) => row.zoneText)).toEqual(["", "", ""]);
});

test("removing every row while filling the form does not bring the setup prompt back", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await start(page);
  await page.locator(".hose-row-card").getByRole("button", { name: "Remove Row" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Row" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How many zones and locations?" })).toHaveCount(0);
});

test("submitting a first-visit zoned layout saves it for next visit automatically, offline", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("2");
  await page.getByLabel("Locations in each zone").fill("2");
  await start(page);
  await groupOf(page, "Zone 1").getByLabel("Zone name").fill("North Wing");
  const north = groupOf(page, "North Wing").locator(".hose-row-card");
  await north.nth(0).getByLabel("Asset Reference").fill("RS-A");
  await north.nth(0).getByLabel("Location").fill("Admin Office");
  await north.nth(1).getByLabel("Location").fill("Reception");
  const zone2 = groupOf(page, "Zone 2").locator(".hose-row-card");
  await zone2.nth(0).getByLabel("Location").fill("CNC Drill");
  await zone2.nth(1).getByLabel("Location").fill("Store");
  await fillInspection(page);
  await submitAndWait(page);
  await expect(page.getByText("Shutter layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "RS-A", locationText: "Admin Office", zoneText: "North Wing" },
    { assetReference: "", locationText: "Reception", zoneText: "North Wing" },
    { assetReference: "", locationText: "CNC Drill", zoneText: "Zone 2" },
    { assetReference: "", locationText: "Store", zoneText: "Zone 2" }
  ] });
  expect(state.stored.responses.rows.map((row: any) => row.zoneText)).toEqual(["North Wing", "North Wing", "Zone 2", "Zone 2"]);
});

test("a saved zoned layout is confirmed with its zones, opens grouped and frozen, and an unchanged layout proposes nothing", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?zoned=1");
  await expect(page.getByRole("heading", { name: "Same shutters as last time" })).toBeVisible();
  await expect(page.getByText("3 saved shutters in 2 zones")).toBeVisible();
  await expect(page.getByText("RS-01 – Lobby")).toBeVisible();
  await expect(page.getByLabel("Extra shutters this visit (optional)")).toHaveCount(0);
  await start(page);
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card")).toHaveCount(2);
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card")).toHaveCount(1);
  await expect(page.getByLabel("Zone name")).toHaveCount(0);
  await expect(page.getByLabel("Location", { exact: true }).first()).toBeDisabled();
  await fillInspection(page);
  await submitAndWait(page);
  const state = await inspect(page);
  expect(state.proposal).toBeUndefined();
  expect(state.stored.responses.rows.map((row: any) => [row.locationText, row.zoneText])).toEqual([["Lobby", "Zone 1"], ["Dock", "Zone 1"], ["Roof", "Zone 2"]]);
});

test("a shutter can be added to a saved zone and a new zone added; the proposal lists rows grouped by zone", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?zoned=1");
  await start(page);
  await page.getByRole("button", { name: "Add shutter to Zone 2" }).click();
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card")).toHaveCount(2);
  await groupOf(page, "Zone 2").locator(".hose-row-card").nth(1).getByLabel("Location").fill("Gate");
  await page.getByRole("button", { name: "Add Zone" }).click();
  await expect(groupOf(page, "Zone 3").locator(".hose-row-card")).toHaveCount(1);
  await groupOf(page, "Zone 3").locator(".hose-row-card").getByLabel("Location").fill("Yard");
  await fillInspection(page);
  await submitAndWait(page);
  const state = await inspect(page);
  expect(state.proposal.patch.rows).toEqual([
    { assetReference: "RS-01", locationText: "Lobby", zoneText: "Zone 1" },
    { assetReference: "RS-02", locationText: "Dock", zoneText: "Zone 1" },
    { assetReference: "RS-03", locationText: "Roof", zoneText: "Zone 2" },
    { assetReference: "", locationText: "Gate", zoneText: "Zone 2" },
    { assetReference: "", locationText: "Yard", zoneText: "Zone 3" }
  ]);
  expect(state.stored.responses.rows.slice(0, 3).every((row: any) => row.source === "configured")).toBe(true);
});

test("a zone correction is proposed for next visit without changing the frozen inspection", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?zoned=1");
  await start(page);
  await page.getByLabel("Shutter 3 format zone").fill("Zone 9");
  await page.getByRole("button", { name: "Save as format for next visit" }).click();
  await expect(page.getByText("Saved on this device, pending sync.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.patch.rows).toEqual([
    { assetReference: "RS-01", locationText: "Lobby", zoneText: "Zone 1" },
    { assetReference: "RS-02", locationText: "Dock", zoneText: "Zone 1" },
    { assetReference: "RS-03", locationText: "Roof", zoneText: "Zone 9" }
  ]);
  expect(state.stored.responses.rows[2].zoneText ?? "Zone 2").toBe("Zone 2");
});

test("an unzoned saved layout keeps the extra-shutters field and still proposes legacy two-field rows", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?configured=1");
  await expect(page.getByRole("heading", { name: "Same shutters as last time" })).toBeVisible();
  await expect(page.getByText("RS-01 – Old Lobby")).toBeVisible();
  await page.getByLabel("Extra shutters this visit (optional)").fill("250");
  await start(page);
  await expect(page.getByRole("alert")).toContainText("Enter a whole number from 0 to 249.");
  await page.getByLabel("Extra shutters this visit (optional)").fill("1");
  await start(page);
  await expect(page.locator(".hose-row-card")).toHaveCount(2);
  await page.locator(".hose-row-card").nth(1).getByLabel("Location").fill("Loading bay");
  await fillInspection(page);
  await submitAndWait(page);
  expect((await inspect(page)).proposal.patch.rows).toEqual([
    { assetReference: "RS-01", locationText: "Old Lobby" }, { assetReference: "", locationText: "Loading bay" }
  ]);
});

test("the setup prompt fits phone, tablet and desktop widths with 44px controls", async ({ page }) => {
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tests/fire-rated-roller-shutter-form.html");
    await expect(page.getByRole("heading", { name: "How many zones and locations?" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole("button", { name: "Start Inspection" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const label of ["Number of zones", "Locations in each zone"]) {
      const input = page.getByLabel(label);
      expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    }
  }
});

test("the zoned form fits phone and desktop widths", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?zoned=1");
  await start(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole("button", { name: "Add Zone" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
