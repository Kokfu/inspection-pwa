import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 (Hydrant): a fresh Draft asks how many hydrants (or shows the saved layout) before the form, and submitting a new
 * or changed layout queues the existing `update-format` proposal automatically. Real form, real repository, real Dexie.
 */
const inspect = (page: Page) => page.evaluate(() => (window as any).inspect());
const open = async (page: Page, query = "") => { await page.goto(`/tests/row-layout-form.html${query}`); };
const rowCards = (page: Page) => page.locator(".hose-row-card");

async function fillAndSubmit(page: Page, locations: string[]) {
  await page.getByLabel("Hydrant Type").selectOption("pressurize");
  const blank = page.locator(".hose-row-card").filter({ has: page.locator("input:not([disabled])") });
  const count = await blank.count();
  for (let index = 0; index < count; index += 1) {
    const card = blank.nth(index);
    const location = card.getByLabel("Location", { exact: true });
    if (await location.inputValue() === "") await location.fill(locations.shift() ?? `Hydrant ${index + 1}`);
  }
  await page.evaluate(() => {
    for (const group of document.querySelectorAll("[role=group]")) {
      if (!/ result$/.test(group.getAttribute("aria-label") ?? "")) continue;
      [...group.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Good")?.click();
    }
  });
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).stored.syncStatus).toBe("Pending");
}

test("a first visit asks how many hydrants before the form, then opens with that many rows", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "How many hydrants?" })).toBeVisible();
  await expect(page.getByLabel("Hydrant Type")).toHaveCount(0);
  await page.getByLabel("Number of hydrants").fill("3");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(rowCards(page)).toHaveCount(3);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.map((row: any) => row.source)).toEqual(["configured", "technician", "technician"]);
  expect((await inspect(page)).stored.responses.rows.map((row: any) => row.sortOrder)).toEqual([1, 2, 3]);
});

test("the count must be a whole number from 1 to 250 and nothing starts on a bad one", async ({ page }) => {
  await open(page);
  for (const bad of ["", "0", "-1", "2.5", "251", "1e2"]) {
    // a number input refuses most junk through fill(), so set the raw value the way a browser would deliver it
    await page.getByLabel("Number of hydrants").evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, bad);
    await page.getByRole("button", { name: "Start Inspection" }).click();
    await expect(page.getByRole("alert")).toContainText("whole number from 1 to 250");
    await expect(page.getByLabel("Hydrant Type")).toHaveCount(0);
  }
  await page.getByLabel("Number of hydrants").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(rowCards(page)).toHaveCount(1);
});

test("a saved layout is shown as 'same hydrants as last time', pre-filled, with optional extra rows", async ({ page }) => {
  await open(page, "?preset=saved");
  await expect(page.getByRole("heading", { name: "Same hydrants as last time" })).toBeVisible();
  await expect(page.getByText("H-1 – Lobby")).toBeVisible();
  await expect(page.getByText("H-2 – Roof")).toBeVisible();
  await expect(page.getByLabel("Hydrant Type")).toHaveCount(0);
  await page.getByLabel("Extra hydrants this visit (optional)").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(rowCards(page)).toHaveCount(4);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.length).toBe(4);
  const rows = (await inspect(page)).stored.responses.rows;
  expect(rows.map((row: any) => [row.source, row.assetReference, row.locationText])).toEqual([
    ["configured", "H-1", "Lobby"], ["configured", "H-2", "Roof"], ["technician", "", ""], ["technician", "", ""]
  ]);
});

test("a customer with several named locations keeps the form and the per-location buttons (no prompt, nothing automatic)", async ({ page }) => {
  await open(page, "?preset=saved&locations=2");
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hydrants|Same hydrants/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /as format for next visit/ })).toHaveCount(2);
});

test("a single-location customer has no per-location buttons: the layout is saved automatically instead", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(page.getByRole("button", { name: /as format for next visit/ })).toHaveCount(0);
});

test("submitting offline queues the layout (every row, including the added ones) and says so, also after a reload", async ({ page }) => {
  await open(page);
  await page.getByLabel("Number of hydrants").fill("3");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, ["Gate", "Car park"]);
  await expect(page.getByText("Hydrant layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "", locationText: "General" }, { assetReference: "", locationText: "Gate" }, { assetReference: "", locationText: "Car park" }
  ] });
  expect(state.outbox.filter((item: any) => item.entityType === "technicianLocationProposal")).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("Hydrant layout saved on this device.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hydrants|Same hydrants/ })).toHaveCount(0);
});

test("submitting online sends the layout to the server once and says it went to an Admin", async ({ page }) => {
  await open(page, "?online");
  await page.getByLabel("Number of hydrants").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, ["Roof"]);
  await expect(page.getByText("Hydrant layout sent to an Admin for approval.")).toBeVisible();
  const state = await inspect(page);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].body.patch.rows).toEqual([{ assetReference: "", locationText: "General" }, { assetReference: "", locationText: "Roof" }]);
  expect(state.proposal.status).toBe("Synced");
});

test("an unchanged saved layout with no extra rows proposes nothing", async ({ page }) => {
  await open(page, "?preset=saved&online");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, []);
  const state = await inspect(page);
  expect(state.posts).toHaveLength(0);
  expect(state.proposal).toBeUndefined();
  await expect(page.locator(".form-message").filter({ hasText: /layout/i })).toHaveCount(0);
});

test("an extra row on a saved layout is proposed with the saved rows first", async ({ page }) => {
  await open(page, "?preset=saved&online");
  await page.getByLabel("Extra hydrants this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, ["Basement"]);
  const state = await inspect(page);
  expect(state.posts[0].body.patch.rows).toEqual([
    { assetReference: "H-1", locationText: "Lobby" }, { assetReference: "H-2", locationText: "Roof" }, { assetReference: "", locationText: "Basement" }
  ]);
});

test("when the server holds the proposal behind an earlier one, the visit says so calmly and nothing needs attention", async ({ page }) => {
  await open(page, "?online");
  await page.evaluate(() => { (window as any).__proposalReply = { status: 409 }; });
  await page.getByLabel("Number of hydrants").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, ["Roof"]);
  await expect(page.getByText("is waiting on an earlier request for the same location")).toBeVisible();
  await expect(page.getByText("needs attention")).toHaveCount(0);
  const state = await inspect(page);
  expect(state.outbox.find((item: any) => item.entityType === "technicianLocationProposal").status).toBe("Completed");
  expect(state.stored.syncStatus).toBe("Pending");
});

test("reopening a draft that already has entries never puts the prompt back", async ({ page }) => {
  await open(page);
  await page.getByLabel("Number of hydrants").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await page.getByLabel("Hydrant Type").selectOption("meter");
  await expect.poll(async () => (await inspect(page)).stored.responses.hydrantType).toBe("meter");
  await page.evaluate(() => window.location.reload());
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hydrants/ })).toHaveCount(0);
});

test("I-59: a configured (saved-layout) row's Location and Reference cannot be edited, the technician's own rows can", async ({ page }) => {
  // the server rejects a configured row whose text differs from the frozen value, so the form must not let it change
  await open(page, "?preset=saved");
  await page.getByLabel("Extra hydrants this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(rowCards(page)).toHaveCount(3);
  for (const index of [0, 1]) {
    await expect(rowCards(page).nth(index).getByLabel("Location", { exact: true })).toBeDisabled();
    await expect(rowCards(page).nth(index).getByLabel("No. / Reference")).toBeDisabled();
  }
  await expect(rowCards(page).nth(2).getByLabel("Location", { exact: true })).toBeEnabled();
  await expect(rowCards(page).nth(2).getByLabel("No. / Reference")).toBeEnabled();
});

// A brand-new customer has no location at all: the layout is proposed under "general" and the server turns it into the General location.
test("a brand-new customer (no location) is asked how many hydrants and starts with only the technician's own rows", async ({ page }) => {
  await open(page, "?locations=0");
  await expect(page.getByRole("heading", { name: "How many hydrants?" })).toBeVisible();
  await expect(page.getByLabel("Hydrant Type")).toHaveCount(0);
  await page.getByLabel("Number of hydrants").fill("3");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(rowCards(page)).toHaveCount(3);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.map((row: any) => row.source)).toEqual(["technician", "technician", "technician"]);
  expect((await inspect(page)).stored.responses.rows.map((row: any) => row.sortOrder)).toEqual([1, 2, 3]);
  for (let index = 0; index < 3; index += 1) await expect(rowCards(page).nth(index).getByLabel("Location", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: /as format for next visit/ })).toHaveCount(0);
});

test("a brand-new customer's offline submit queues the layout under 'general' and says so, also after a reload", async ({ page }) => {
  await open(page, "?locations=0");
  await page.getByLabel("Number of hydrants").fill("3");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, ["Gate", "Car park", "Roof"]);
  await expect(page.getByText("Hydrant layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "", locationText: "Gate" }, { assetReference: "", locationText: "Car park" }, { assetReference: "", locationText: "Roof" }
  ] });
  expect(state.outbox.filter((item: any) => item.entityType === "technicianLocationProposal")).toHaveLength(1);
  expect(state.stored.responses.rows.every((row: any) => row.source === "technician")).toBe(true);
  await page.reload();
  await expect(page.getByText("Hydrant layout saved on this device.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hydrants|Same hydrants/ })).toHaveCount(0);
});

test("a brand-new customer's online submit sends the layout to the server once, under 'general'", async ({ page }) => {
  await open(page, "?locations=0&online");
  await page.getByLabel("Number of hydrants").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page, ["Lobby", "Roof"]);
  await expect(page.getByText("Hydrant layout sent to an Admin for approval.")).toBeVisible();
  const state = await inspect(page);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].url).toContain("/systems/hydrant/location-proposals");
  expect(state.posts[0].body.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [{ assetReference: "", locationText: "Lobby" }, { assetReference: "", locationText: "Roof" }] });
  expect(state.proposal.status).toBe("Synced");
});

test("a customer with a zone but no location keeps the form with no prompt and nothing automatic", async ({ page }) => {
  await open(page, "?locations=0&zones=1&online");
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hydrants|Same hydrants/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Row" }).click();
  await fillAndSubmit(page, ["Lobby"]);
  const state = await inspect(page);
  expect(state.posts).toHaveLength(0);
  expect(state.proposal).toBeUndefined();
});

test("a brand-new customer's draft with entries never gets the prompt back after a reload", async ({ page }) => {
  await open(page, "?locations=0");
  await page.getByLabel("Number of hydrants").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await page.getByLabel("Hydrant Type").selectOption("meter");
  await expect.poll(async () => (await inspect(page)).stored.responses.hydrantType).toBe("meter");
  await page.evaluate(() => window.location.reload());
  await expect(page.getByLabel("Hydrant Type")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hydrants/ })).toHaveCount(0);
});
