import { expect, test } from "@playwright/test";

test("roller shutter fields and buttons save a local draft then queue a complete inspection", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await expect(page.getByRole("heading", { name: "Fire Rated Roller Shutter System" })).toBeVisible();
  await page.getByLabel("Number of shutters").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByLabel("Date Tested")).toBeVisible();
  await expect(page.getByLabel("Zone", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Inspected By")).toBeVisible();
  await expect(page.locator(".hose-row-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Add Row" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(2);
  await page.locator(".hose-row-card").last().getByRole("button", { name: "Remove Row" }).click();
  await expect(page.locator(".hose-row-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect(page.getByText("Cannot submit yet")).toBeVisible();
  await page.getByLabel("Date Tested").fill("2026-09-28");
  await page.getByLabel("Zone", { exact: true }).fill("Zone 1");
  await page.getByLabel("Inspected By").fill("Inspector A");
  await page.getByLabel("Location").fill("CNC Drill");
  await page.getByLabel("Comments").fill("Motor inspected");
  await page.getByRole("group", { name: "Auto Alarm Mode result" }).getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("group", { name: "Manual Mode result" }).getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("group", { name: "Auto Alarm Mode result" }).getByRole("button", { name: "Not Good" }).click();
  await expect(page.getByRole("button", { name: "Take Photo" })).toBeVisible();
  await page.getByRole("group", { name: "Auto Alarm Mode result" }).getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Draft saved on this device.")).toBeVisible();
  const draft = await page.evaluate(() => (window as any).inspect());
  expect(draft.stored.responses.rows[0].locationText).toBe("CNC Drill");
  expect(draft.stored.responses.comments).toBe("Motor inspected");
  expect(draft.stored.syncStatus).toBe("Draft");
  await page.reload();
  await expect(page.getByLabel("Location")).toHaveValue("CNC Drill");
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as any).inspect())).stored.syncStatus).toBe("Pending");
  const pending = await page.evaluate(() => (window as any).inspect());
  expect(pending.outbox).toHaveLength(1);
  expect(pending.outbox[0].entityType).toBe("masterSystemInspection");
});

test("configured shutter labels can be corrected for the next visit without changing the frozen inspection", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/fire-rated-roller-shutter-form.html?configured=1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByLabel("Asset Reference", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue("Old Lobby");
  await page.getByLabel("Shutter 1 format reference").fill("RS-02");
  await page.getByLabel("Shutter 1 format location").fill("New Lobby");
  await page.getByRole("button", { name: "Save as format for next visit" }).click();
  await expect(page.getByText("Saved on this device, pending sync.")).toBeVisible();
  const state = await page.evaluate(() => (window as any).inspect());
  expect(state.stored.responses.rows[0]).toMatchObject({ assetReference: "RS-01", locationText: "Old Lobby" });
  expect(state.proposal.patch.rows).toEqual([{ assetReference: "RS-02", locationText: "New Lobby" }]);
  expect(state.proposal.status).toBe("Pending");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
