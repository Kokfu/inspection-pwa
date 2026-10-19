import { expect, test, type Page } from "@playwright/test";

const id = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const uuid = "20000000-0000-4000-8000-000000000001";
const originalRows = [
  { assetReference: "RS-A1", locationText: "Admin Office", zoneText: "North Wing" },
  { assetReference: "", locationText: "Loading bay with a very long descriptive name that must wrap inside the card", zoneText: "Zone 2" }
];
function proposal(over: Record<string, unknown> = {}) {
  return { id, customerId: uuid, customerDisplayName: "Customer Roller", systemKey: "fire_rated_roller_shutter", systemDisplayName: "Fire Rated Roller Shutter",
    jobId: uuid, jobReference: "SV-20261019-7", submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-10-09T00:00:00.000Z",
    payload: { kind: "update-format", locationKey: "general", rows: structuredClone(originalRows) }, status: "pending", decision: null, edited: false, ...over };
}
function current(item: ReturnType<typeof proposal>, over: Record<string, unknown> = {}) {
  const rows = item.systemKey === "co2_fire_extinguisher" ? [] : [{ ...originalRows[0], locationText: "Old office" }, { assetReference: "RS-OLD", locationText: "Retired door", zoneText: "West" }, originalRows[1]];
  return { ...item, currentLocation: item.payload.kind === "add-location" ? null : { key: "general", displayName: "General locations", zoneId: null, presetRowCount: rows.length, rowPreset: { rows }, sortOrder: 1 },
    currentRows: rows, availableZones: [{ key: "north", displayName: "North Wing" }, { key: "south", displayName: "South Wing" }],
    mergeable: item.status === "pending" ? true : { reason: "This proposal has already been decided." }, ...over };
}
async function api(page: Page, items = [proposal()], detailOverrides: Record<string, unknown> = {}) {
  const requests: string[] = [], writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    requests.push(`${route.request().method()} ${path}`);
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (path === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (path === "/api/manager/location-proposals") {
      const counts = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
      for (const item of items) counts[item.status as keyof typeof counts]++;
      return route.fulfill({ json: { proposals: items.filter(item => item.status === url.searchParams.get("status")), counts } });
    }
    const item = items.find(item => path.includes(item.id));
    if (item && path.endsWith("/decision")) {
      const body = route.request().postDataJSON(); writes.push(body);
      Object.assign(item, { status: body.decision, edited: Boolean(body.appliedPatch), decision: {
        id: uuid, decision: body.decision, note: body.note ?? null, decidedBy: "Reviewer", decidedByRole: "supervisor", decidedAt: "2026-10-19T01:00:00.000Z", sequence: 1,
        requestId: body.requestId, resultingRevisionId: body.decision === "approved" ? uuid : null, appliedPatch: body.appliedPatch ?? null
      } });
      return route.fulfill({ status: 201, json: { proposal: item } });
    }
    if (item) return route.fulfill({ json: { proposal: current(item, detailOverrides) } });
    return route.fulfill({ json: {} });
  });
  return { requests, writes };
}
async function enter(page: Page) {
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Admin/ }).click();
  await expect(page.getByRole("heading", { name: "Location Proposals", exact: true })).toBeVisible();
  if (await page.locator("summary").filter({ hasText: "Menu" }).isVisible()) {
    await page.locator("summary").filter({ hasText: "Menu" }).click();
    await page.getByLabel("Mobile navigation").getByRole("button", { name: "Location Proposals" }).click();
  } else await page.getByLabel("Primary navigation").getByRole("button", { name: "Location Proposals" }).click();
  await expect(page.getByRole("heading", { name: "Location Proposals", exact: true })).toBeVisible();
}
const review = (page: Page) => page.getByRole("region", { name: "Proposal review", exact: true });
async function open(page: Page, name = "Customer Roller") {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(review(page).getByRole("heading", { name, exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => { page.on("dialog", dialog => dialog.accept()); });

test("Supervisor can review and approve a new-system proposal after full navigation and reload", async ({ page }) => {
  const smoke = proposal({ systemKey: "smoke_ventilation", systemDisplayName: "Smoke Ventilation", payload: { kind: "update-format", locationKey: "general", rows: [{ assetReference: "Fan 7" }] } });
  const { requests, writes } = await api(page, [smoke, proposal({ id: otherId, customerDisplayName: "Other Customer" })]);
  // Smoke rows must use the system's field contract in both the current and proposed formats.
  await page.route(`**/api/manager/location-proposals/${id}`, route => route.fulfill({ json: { proposal: current(smoke, { currentLocation: { key: "general", displayName: "Fans", zoneId: null, presetRowCount: 1, rowPreset: { rows: [{ assetReference: "Fan 1" }] }, sortOrder: 1 }, currentRows: [{ assetReference: "Fan 1" }] }) } }));
  await enter(page); await page.reload();
  await open(page); await expect(review(page)).toContainText("Fan 7");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(review(page)).toContainText("Approved by Reviewer");
  await page.getByRole("button", { name: "Back to requests" }).click();
  await expect(page.getByRole("button", { name: /Other Customer/ })).toBeVisible();
  expect(writes[0].appliedPatch).toBeUndefined();
  expect(requests).not.toContain("GET /api/inspection-jobs");
});

for (const size of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`review layout, row labels, focus and touch targets at ${size.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size); await api(page); await enter(page);
    await expect(page.getByRole("tab", { name: "Pending (1)", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`inbox-${size.width}.png`), fullPage: true });
    await open(page);
    const panel = review(page);
    await expect(panel).toContainText("North Wing"); await expect(panel).toContainText("Zone 2");
    await expect(panel).toContainText("2 rows"); await expect(panel).toContainText("Changed"); await expect(panel).toContainText("Removed");
    await expect(panel.getByText("SV-20261019-7", { exact: true })).toBeVisible();
    expect(await page.locator(".manager-location-proposals").innerText()).not.toContain("fire_rated_roller_shutter");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const buttons = await page.locator(".manager-location-proposals button:visible").evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { text: element.textContent, width: box.width, height: box.height }; }));
    for (const button of buttons) { expect(button.width, button.text ?? "").toBeGreaterThanOrEqual(44); expect(button.height, button.text ?? "").toBeGreaterThanOrEqual(44); }
    const approve = panel.getByRole("button", { name: "Approve", exact: true });
    await approve.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await expect(approve).toBeFocused();
    expect(await approve.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.screenshot({ path: testInfo.outputPath(`review-${size.width}.png`), fullPage: true });
    await panel.getByRole("button", { name: "Edit before approval" }).click();
    await panel.getByRole("textbox", { name: "Asset", exact: true }).first().fill("RS-EDITED");
    await panel.getByRole("button", { name: "Remove row 2" }).click();
    await expect(panel.getByRole("button", { name: /Add row/i })).toHaveCount(0);
    await panel.getByRole("button", { name: "Approve with changes" }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole("button", { name: "Approve with changes" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`editing-${size.width}.png`), fullPage: true });
  });
}

test("edited approval sends only permitted row edits, retains original and survives reopening", async ({ page }) => {
  const { writes } = await api(page); await enter(page); await open(page);
  await page.getByRole("button", { name: "Edit before approval" }).click();
  const panel = review(page);
  await panel.getByRole("textbox", { name: "Location", exact: true }).first().fill("Updated office");
  await page.getByRole("button", { name: "Remove row 2" }).click();
  await expect(page.getByRole("button", { name: "Remove row 1" })).toBeDisabled();
  await page.getByRole("button", { name: "Approve with changes" }).click();
  await expect(panel).toContainText("Approved with changes by Reviewer");
  expect(writes[0].appliedPatch).toEqual({ kind: "update-format", locationKey: "general", rows: [{ ...originalRows[0], locationText: "Updated office" }] });
  await expect(panel.getByRole("heading", { name: "Original proposal", exact: true })).toBeVisible();
  await expect(panel).toContainText("Admin Office"); await expect(panel).toContainText("Updated office");
  await page.getByRole("tab", { name: "Approved (1)", exact: true }).click(); await open(page);
  await expect(panel).toContainText("Approved with changes by Reviewer"); await expect(panel).toContainText("Admin Office");
});

for (const newZone of [false, true]) {
  test(`add-location edits name and ${newZone ? "new zone name" : "existing zone selection"}`, async ({ page }) => {
    const original = { kind: "add-location", locationKey: "room-a", displayName: "Orignal room", zoneKey: "north", newZone: null };
    const { writes } = await api(page, [proposal({ systemKey: "co2_fire_extinguisher", systemDisplayName: "CO2", payload: original })]);
    await enter(page); await open(page); await page.getByRole("button", { name: "Edit before approval" }).click();
    await page.getByRole("textbox", { name: "Location name", exact: true }).fill("Corrected room");
    await page.getByRole("combobox", { name: "Zone", exact: true }).selectOption(newZone ? "" : "south");
    if (newZone) await page.getByRole("textbox", { name: "New zone name", exact: true }).fill("East Wing");
    await page.getByRole("button", { name: "Approve with changes" }).click();
    await expect(review(page)).toContainText("Approved with changes by Reviewer");
    const patch = writes[0].appliedPatch as typeof original;
    expect(patch.locationKey).toBe("room-a"); expect(patch.displayName).toBe("Corrected room");
    if (newZone) { expect(patch.zoneKey).toBeNull(); expect(patch.newZone).toMatchObject({ displayName: "East Wing" }); }
    else { expect(patch.zoneKey).toBe("south"); expect(patch.newZone).toBeNull(); }
    await expect(review(page)).toContainText("Orignal room"); await expect(review(page)).toContainText("Corrected room");
  });
}

test("unmergeable detail disables approve, while rejection still requires a note", async ({ page }) => {
  const { writes } = await api(page, [proposal()], { mergeable: { reason: "The location no longer exists." } });
  await enter(page); await open(page);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(review(page)).toContainText("Cannot approve: The location no longer exists.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at least 3 characters"); expect(writes).toHaveLength(0);
  const note = page.getByRole("textbox", { name: /Note/ }); await expect(note).toBeFocused();
  await note.fill("Please resubmit for the current location."); await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(review(page)).toContainText("Rejected by Reviewer");
  expect(writes[0].note).toBe("Please resubmit for the current location."); expect(writes[0].appliedPatch).toBeUndefined();
});

test("invalid approval names identify and focus the field rather than the note", async ({page}) => {
  const {writes} = await api(page, [proposal({systemKey:"co2_fire_extinguisher", systemDisplayName:"CO2", payload:{kind:"add-location", locationKey:"room", displayName:"Room", zoneKey:"north", newZone:null}})]);
  await enter(page); await open(page);
  await page.getByRole("button", {name:"Edit before approval"}).click();
  const location = page.getByLabel("Location name", {exact:true});
  await location.fill("");
  await page.getByRole("button", {name:"Approve with changes"}).click();
  await expect(location).toBeFocused();
  await expect(location).toHaveAttribute("aria-invalid", "true");
  await expect(location).toHaveAttribute("aria-describedby", "proposal-decision-error");
  await expect(page.getByRole("textbox", {name:/Note/})).toHaveAttribute("aria-invalid", "false");
  await location.fill("Corrected room");
  await page.getByRole("combobox", {name:"Zone", exact:true}).selectOption("");
  await page.getByRole("button", {name:"Approve with changes"}).click();
  await expect(page.getByLabel("New zone name", {exact:true})).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Enter a zone name");
  expect(writes).toHaveLength(0);
});

test("phone Back restores keyboard focus after the inbox becomes visible", async ({page}) => {
  await page.setViewportSize({width:360, height:800});
  await api(page); await enter(page); await open(page);
  await page.getByRole("button", {name:"Back to requests"}).click();
  await expect(page.getByRole("heading", {name:"Pending requests", exact:true})).toBeFocused();
});

test("failed decision removes stale actions and requires fresh detail before retry", async ({ page }) => {
  await api(page); await enter(page); await open(page);
  await page.route("**/decision", route => route.fulfill({ status: 409, json: { error: "CONFLICT", message: "Configuration changed. Reload this proposal." } }));
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload proposal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await page.route(`**/api/manager/location-proposals/${id}`, route => route.fulfill({ json: { proposal: current(proposal(), { mergeable: { reason: "Location removed." } }) } }));
  await page.getByRole("button", { name: "Reload proposal" }).click();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
});

test("late detail response cannot replace a newer selected proposal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await api(page, [proposal(), proposal({ id: otherId, customerDisplayName: "Other Customer" })]);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/manager/location-proposals/${id}`, async route => { await held; await route.fulfill({ json: { proposal: current(proposal()) } }).catch(() => {}); });
  await enter(page); await page.getByRole("button", { name: /Customer Roller/ }).click();
  await expect(review(page).getByRole("status")).toContainText("Loading current configuration");
  await open(page, "Other Customer"); release();
  await expect(review(page).getByRole("heading", { name: "Other Customer", exact: true })).toBeVisible();
  await expect(review(page).getByRole("heading", { name: "Customer Roller", exact: true })).toHaveCount(0);
});

test("malformed authoritative detail fails closed with no approval action", async ({ page }) => {
  await api(page);
  await page.route(`**/api/manager/location-proposals/${id}`, route => route.fulfill({ json: { proposal: { ...proposal(), mergeable: true } } }));
  await enter(page); await page.getByRole("button", { name: /Customer Roller/ }).click();
  await expect(page.getByText("Choose how you are signing in")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});

test("status tabs show server counts and support keyboard navigation", async ({ page }) => {
  await api(page); await enter(page);
  const pending = page.getByRole("tab", { name: "Pending (1)", exact: true });
  await pending.focus(); await pending.press("End");
  await expect(page.getByRole("tab", { name: "Withdrawn (0)", exact: true })).toBeFocused();
  await expect(page.getByText("No withdrawn location proposals.")).toBeVisible();
  await page.getByRole("tab", { name: "Withdrawn (0)", exact: true }).press("Home");
  await expect(pending).toHaveAttribute("aria-selected", "true");
});
