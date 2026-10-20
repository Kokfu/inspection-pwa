import { expect, test } from "@playwright/test";

/**
 * I-46: the accepted detail lists a shutter added during the visit with its zone (the stored order, with the added
 * shutters last, is unchanged). I-45: the on-screen Final Report shows a Roller Shutter photo with the caption the API
 * sends (it names the shutter) instead of the raw field path; another system's photo line is unchanged.
 */
test("I-46: the accepted detail groups an added shutter with its zone and numbers the shutters in that order", async ({ page }) => {
  await page.goto("/tests/roller-shutter-accepted-and-report.html");
  const articles = page.locator("#accepted .accepted-location-row");
  await expect(articles).toHaveCount(4);
  const heading = (index: number) => articles.nth(index).locator(".accepted-location-heading").innerText();
  const text = await Promise.all([0, 1, 2, 3].map(heading));
  const normalized = text.map((value) => value.replace(/\s+/g, " ").trim());
  expect(normalized).toEqual(["No. 1 Zone Zone 1 Location Lobby", "No. 2 Zone Zone 1 Location Roof", "No. 3 Zone Zone 2 Location Dock", "No. 4 Zone Zone 3 Location Yard"]);
  expect(await page.evaluate(() => (window as any).storedUnchanged())).toBe(true);
});

test("I-45: the on-screen report prints no raw key, and the photo line names the shutter", async ({ page }) => {
  await page.goto("/tests/roller-shutter-accepted-and-report.html");
  const section = page.locator("#report .report-section").first();
  await expect(section.getByText("No. 2 (Zone 1 — Roof) - Manual Mode", { exact: true })).toBeVisible();
  await expect(section.getByText("Sticks half way")).toBeVisible();
  const text = await section.innerText();
  expect(text).not.toMatch(/row uuid|sort order|roller_shutter_schedule\./i);
  await expect(section.locator(".evidence-confirmed")).toContainText("Photo evidence is included in the downloaded PDF: Roller Shutter Schedule - Manual Mode (Zone 1 — Roof).");
  await expect(section.locator(".evidence-confirmed")).toContainText("Captured by Camera");
  await expect(section.locator(".evidence-confirmed [data-testid=gallery-photo-label]")).toHaveCount(0);
  // Another system's photo line is unchanged: the field text, no caption. A gallery photo shows the visible label.
  await expect(page.locator("#report .report-section").nth(1).locator(".evidence-confirmed")).toContainText("GALLERY · uploaded 20 Oct 2026, 9:02");
  const other = page.locator("#report .report-section").nth(1).locator(".evidence-confirmed");
  await expect(other).toContainText("Photo evidence is included in the downloaded PDF: charger_batteries.charger_battery_checks.main Supply.");
});
