import { expect, test, type Page } from "@playwright/test";

const inspect = (page: Page) => page.evaluate(() => (window as any).inspect());
const start = (page: Page) => page.getByRole("button", { name: "Start Inspection" }).click();

async function fillInspection(page: Page) {
  const expand = page.getByRole("button", { name: "Expand all zones" });
  if (await expand.count() && await expand.isEnabled()) await expand.click();
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
  await expandAll(page);
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
  await expandAll(page);
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

test("per-zone location overrides survive editing the default or the zone count", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("3");
  await page.getByLabel("Locations in each zone").fill("2");
  await page.getByText("Different number of locations in some zones?").click();
  await page.getByLabel("Zone 2 locations").fill("5");
  await page.getByLabel("Locations in each zone").fill("3");
  await page.getByLabel("Number of zones").fill("4");
  await expect(page.getByLabel("Zone 2 locations")).toHaveValue("5");
  await start(page);
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card")).toHaveCount(3);
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card")).toHaveCount(5);
  await expect(groupOf(page, "Zone 4").locator(".hose-row-card")).toHaveCount(3);
});

test("a zone cannot be renamed onto another zone's name; the zones stay separate and focus is kept", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("2");
  await start(page);
  const first = groupOf(page, "Zone 1").getByLabel("Zone name");
  await first.fill("Zone 2");
  await expect(page.getByText('Another zone is already named "Zone 2". Choose a different name.')).toBeVisible();
  await expect(first).toHaveValue("Zone 1");
  await expect(page.locator(".location-group")).toHaveCount(2);
  await first.fill("North");
  await expect(groupOf(page, "North")).toHaveCount(1);
  await expect(page.getByText("Another zone is already named")).toHaveCount(0);
});

test("Add Zone on a single unnamed zone names it Zone 1 and creates Zone 2", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await start(page);
  await page.getByRole("button", { name: "Add Zone" }).click();
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card")).toHaveCount(1);
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card")).toHaveCount(1);
});

const expandAll = async (page: Page) => {
  const button = page.getByRole("button", { name: "Expand all zones" });
  if (await button.count() && await button.isEnabled()) await button.click();
};
const zoneToggle = (page: Page, zone: string, state: "Show" | "Hide") => page.getByRole("button", { name: `${state} shutters in ${zone}`, exact: true });

test("with several zones only the first is open; the others are collapsed with a progress count", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("3");
  await page.getByLabel("Locations in each zone").fill("2");
  await start(page);
  await expect(zoneToggle(page, "Zone 1", "Hide")).toHaveAttribute("aria-expanded", "true");
  await expect(zoneToggle(page, "Zone 2", "Show")).toHaveAttribute("aria-expanded", "false");
  await expect(zoneToggle(page, "Zone 3", "Show")).toHaveAttribute("aria-expanded", "false");
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card").first()).toBeVisible();
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card").first()).toBeHidden();
  await expect(groupOf(page, "Zone 2").getByText("0 of 2 complete")).toBeVisible();
  await expect(page.locator(".hose-row-card")).toHaveCount(6);
  // the zone name stays editable while its shutters are collapsed
  await groupOf(page, "Zone 2").getByLabel("Zone name").fill("Warehouse");
  await expect(groupOf(page, "Warehouse").getByText("0 of 2 complete")).toBeVisible();
  await expect(groupOf(page, "Warehouse").locator(".hose-row-card").first()).toBeHidden();
});

test("a zone can be opened and closed, all zones can be expanded or collapsed, and the progress count follows the results", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("2");
  await page.getByLabel("Locations in each zone").fill("2");
  await start(page);
  await expect(page.getByRole("button", { name: "Expand all zones" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Collapse all zones" })).toBeEnabled();
  await zoneToggle(page, "Zone 2", "Show").click();
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand all zones" })).toBeDisabled();
  await page.getByRole("button", { name: "Collapse all zones" }).click();
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card").first()).toBeHidden();
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card").first()).toBeHidden();
  await expect(page.getByRole("button", { name: "Collapse all zones" })).toBeDisabled();
  await page.getByRole("button", { name: "Expand all zones" }).click();
  const first = groupOf(page, "Zone 1").locator(".hose-row-card").first();
  await first.getByLabel("Location").fill("Lobby");
  for (const name of ["Auto Alarm Mode result", "Manual Mode result"]) await first.getByRole("group", { name }).getByRole("button", { name: "Good", exact: true }).click();
  await expect(groupOf(page, "Zone 1").getByText("1 of 2 complete")).toBeVisible();
  await expect(groupOf(page, "Zone 2").getByText("0 of 2 complete")).toBeVisible();
  await zoneToggle(page, "Zone 1", "Hide").click();
  await expect(groupOf(page, "Zone 1").getByText("1 of 2 complete")).toBeVisible();
  await expect(first).toBeHidden();
  await zoneToggle(page, "Zone 1", "Show").click();
  await expect(first.getByLabel("Location")).toHaveValue("Lobby");
});

test("a failed Submit opens the zones that still have unfinished shutters and leaves finished zones as they are", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("3");
  await page.getByLabel("Locations in each zone").fill("1");
  await start(page);
  await expandAll(page);
  await page.getByLabel("Date Tested").fill("2026-10-09");
  await page.getByLabel("Inspected By").fill("Inspector A");
  for (const zone of ["Zone 1", "Zone 3"]) {
    const card = groupOf(page, zone).locator(".hose-row-card");
    await card.getByLabel("Location").fill(`${zone} gate`);
    for (const name of ["Auto Alarm Mode result", "Manual Mode result"]) await card.getByRole("group", { name }).getByRole("button", { name: "Good", exact: true }).click();
  }
  await page.getByRole("button", { name: "Collapse all zones" }).click();
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect(page.getByText("Cannot submit yet")).toBeVisible();
  await expect(groupOf(page, "Zone 2").locator(".hose-row-card")).toBeVisible();
  await expect(groupOf(page, "Zone 1").locator(".hose-row-card")).toBeHidden();
  await expect(groupOf(page, "Zone 3").locator(".hose-row-card")).toBeHidden();
});

test("a finding counts as complete only with its own remark and photo, and a single zone has no collapse controls", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await start(page);
  await expect(page.getByRole("button", { name: /shutters in/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand all zones" })).toHaveCount(0);
  await expect(page.locator(".zone-rows")).toBeVisible();
  await page.getByRole("button", { name: "Add Zone" }).click();
  await expandAll(page);
  const card = groupOf(page, "Zone 1").locator(".hose-row-card");
  await card.getByLabel("Location").fill("Gate");
  await card.getByRole("group", { name: "Manual Mode result" }).getByRole("button", { name: "Good", exact: true }).click();
  await card.getByRole("group", { name: "Auto Alarm Mode result" }).getByRole("button", { name: "Not Good" }).click();
  await expect(groupOf(page, "Zone 1").getByText("0 of 1 complete")).toBeVisible();
  await card.getByLabel("Auto Alarm Mode Remark *").fill("Motor failed");
  await expect(groupOf(page, "Zone 1").getByText("0 of 1 complete")).toBeVisible();
});

test("the zone collapse controls fit phone, tablet and desktop widths with 44px targets", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?zoned=1");
  await start(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ["Expand all zones", "Collapse all zones", "Show shutters in Zone 2", "Hide shutters in Zone 1"]) {
      expect((await page.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("Submit errors name the zone and the shutter number shown on the cards", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("3");
  await page.getByLabel("Locations in each zone").fill("2");
  await start(page);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  const summary = page.locator(".validation-summary");
  await expect(summary).toContainText("Zone 2, Shutter 1 needs a Location");
  await expect(summary).toContainText("Zone 3, Shutter 2 Auto Alarm Mode result is required");
  await expect(summary).not.toContainText("Shutter row");
  // the card the message points at exists under that zone with that number
  await expect(groupOf(page, "Zone 3").locator(".hose-row-card").nth(1).getByRole("heading", { name: "Shutter 2" })).toBeVisible();
});

test("a failed Submit scrolls to a short per-zone summary; the detail is behind a control", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("3");
  await page.getByLabel("Locations in each zone").fill("2");
  await start(page);
  // a technician taps Submit from the bottom of a long form, so the summary at the top starts off screen
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const summary = page.locator(".validation-summary");
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect(summary).toBeInViewport();
  await expect(summary).toContainText("18 things to fix in 3 zones.");
  for (const zone of ["Zone 1", "Zone 2", "Zone 3"]) await expect(summary.getByText(`${zone}: 6 things to fix`)).toBeVisible();
  await expect(summary.getByText("Zone 2, Shutter 1 needs a Location")).toBeHidden();
  await summary.getByText("Zone 2: 6 things to fix").click();
  await expect(summary.getByText("Zone 2, Shutter 1 needs a Location")).toBeVisible();
  await expect(summary.getByText("Zone 3, Shutter 1 needs a Location")).toBeHidden();
  expect((await summary.locator("summary").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await summary.evaluate((element) => parseFloat(getComputedStyle(element).scrollMarginTop))).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await summary.boundingBox())!.height).toBeLessThan(700);
});

test("a one-zone form shows its first messages and the rest behind Show all", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Locations in each zone").fill("5");
  await start(page);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  const summary = page.locator(".validation-summary");
  await expect(summary).toContainText("15 things to fix.");
  await expect(summary.locator("ul").first().locator("li")).toHaveCount(8);
  await expect(summary.getByText("Shutter row 5 Manual Mode result is required")).toBeHidden();
  await summary.getByText("Show all 15").click();
  await expect(summary.getByText("Shutter row 5 Manual Mode result is required")).toBeVisible();
});
