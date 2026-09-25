import { expect, test, type Page } from "@playwright/test";
import { customerId, installFakeManagerApi, openFakeCustomer, policyId } from "./managerServiceEditorFixture";

/**
 * DoD (form-shaped Manager per-service editor, 2026-09-19): customer page ->
 * Services card -> one per-service editor with Form wording / Preset rows /
 * Settings tabs. The wording tab is a disabled replica of the technician form
 * built from the label-override GET (labels + additive `formLayout`); clicking
 * a label edits its wording inline; one Save PUTs exactly the override map. The
 * PUT contract, validation and versioning are unchanged (fake API mirrors the
 * route). No IndexedDB business records are created by the Manager screen.
 */

const hoseWordingPath = `/api/manager/customers/${customerId}/systems/hose_reel/label-overrides`;

async function openService(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(name);
}

/** Record counts for every object store of every IndexedDB database on the page. */
const indexedDbCounts = (page: Page) => page.evaluate(async () => {
  const counts: Record<string, number> = {};
  for (const info of await indexedDB.databases()) {
    if (!info.name) continue;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open(info.name!); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    for (const store of Array.from(db.objectStoreNames)) {
      counts[`${info.name}.${store}`] = await new Promise<number>((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).count();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    }
    db.close();
  }
  return counts;
});

const legends = (page: Page) => page.locator(".manager-wording-section > legend").allInnerTexts();

test("Form wording: sections, inline edit, Custom badge, exact PUT map, reset, discard", async ({ page }) => {
  const api = await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await expect(page.getByRole("heading", { name: "Services", level: 3, exact: true })).toBeVisible();
  await expect(page.locator(".manager-service-card", { hasText: "Hose Reel System" })).toContainText("1 custom label");
  await openService(page, /Hose Reel System/);
  await expect(page).toHaveURL(new RegExp(`#/manager-customer/${customerId}/service/hose_reel$`));
  await expect(page.getByText("Existing service visits keep the wording and settings they were created with; new visits use the new ones.")).toBeVisible();

  // Sections laid out like the technician form, with the effective labels.
  await expect(page.getByRole("tab", { name: "Form wording" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => legends(page)).toEqual(["Water Tank", "Pump House", "Test Run Fire Pump 30 Minutes", "Hose Reel Drums"]);
  const waterTank = page.locator(".manager-wording-section", { hasText: "Water Tank" }).first();
  await expect(waterTank.getByRole("button", { name: "Edit wording: S.A.J Main Water Supply" })).toBeVisible();
  const custom = waterTank.locator(".manager-wording-label-row", { hasText: "Tank Water Level" });
  await expect(custom.getByText("Custom", { exact: true })).toBeVisible();
  // Disabled look-alikes: 4-state result buttons, measurement input with unit, sample drum row.
  await expect(waterTank.getByRole("group", { name: "S.A.J Main Water Supply result" }).getByRole("button")).toHaveText(["Good", "Not Good", "Complete Repair", "N.A."]);
  await expect(waterTank.getByRole("group", { name: "S.A.J Main Water Supply result" }).getByRole("button").first()).toBeDisabled();
  const pump = page.locator(".manager-wording-section", { hasText: "Pump House" });
  await expect(pump.locator(".measurement-card").first()).toContainText("PSI");
  await expect(pump.locator(".measurement-card input[type=number]").first()).toBeDisabled();
  await expect(page.locator(".manager-wording-sample-row h4")).toContainText("Drum 1");
  expect(await page.locator(".manager-form-wording textarea:not([disabled])").count()).toBe(0);

  // Inline edit -> Custom + Unsaved badges -> save -> exact PUT body.
  await page.getByRole("button", { name: "Edit wording: Keep Clean In Pump House" }).click();
  const editor = page.getByRole("group", { name: "Edit wording for Keep Clean In Pump House" });
  await expect(editor).toContainText("Default wording: Keep Clean In Pump House");
  await editor.getByLabel("New wording").fill("  Pump room housekeeping  ");
  await editor.getByRole("button", { name: "Done" }).click();
  const edited = page.locator(".manager-wording-label-row", { hasText: "Pump room housekeeping" });
  await expect(edited.getByText("Custom", { exact: true })).toBeVisible();
  await expect(edited.getByText("Unsaved", { exact: true })).toBeVisible();
  await expect(page.locator(".manager-wording-savebar")).toContainText("1 unsaved change");
  await expect(page.getByRole("tab", { name: /Form wording/ })).toContainText("•");
  await page.getByRole("button", { name: "Save wording" }).click();
  await expect(page.getByText(/Saved\. A new configuration version was created\./)).toBeVisible();
  expect(api.puts("/hose_reel/label-overrides").map((entry) => entry.body)).toEqual([{ labelOverrides: {
    "checklist.waterTank.water_level": "Tank Water Level",
    "checklist.pumpHouse.pump_house_clean": "Pump room housekeeping"
  } }]);
  await expect(page.locator(".manager-wording-savebar")).toContainText("No unsaved changes");
  await expect(page.locator(".manager-service-editor .support-metadata").first()).toHaveText("Version 6");

  // Reset to default removes exactly that path.
  await page.getByRole("button", { name: "Edit wording: Tank Water Level" }).click();
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByRole("button", { name: "Edit wording: Water Level" })).toBeVisible();
  await page.getByRole("button", { name: "Save wording" }).click();
  await expect(page.locator(".manager-wording-savebar")).toContainText("No unsaved changes");
  expect(api.puts("/hose_reel/label-overrides").at(-1)!.body).toEqual({ labelOverrides: { "checklist.pumpHouse.pump_house_clean": "Pump room housekeeping" } });
  expect(api.stored("hose_reel")).toEqual({ "checklist.pumpHouse.pump_house_clean": "Pump room housekeeping" });

  // Typing the default wording is the same as no override; Discard reverts drafts without a PUT.
  const putsBefore = api.puts("/hose_reel/label-overrides").length;
  await page.getByRole("button", { name: "Edit wording: Nozzle", exact: true }).click();
  await page.getByLabel("New wording").fill("Nozzle tip");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Edit wording: Pump room housekeeping" }).click();
  await page.getByLabel("New wording").fill("Keep Clean In Pump House");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".manager-wording-savebar")).toContainText("2 unsaved changes");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.locator(".manager-wording-savebar")).toContainText("No unsaved changes");
  await expect(page.getByRole("button", { name: "Edit wording: Nozzle", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit wording: Pump room housekeeping" })).toBeVisible();
  expect(api.puts("/hose_reel/label-overrides").length).toBe(putsBefore);

  // Server validation surfaces inline; nothing persisted.
  await page.getByRole("button", { name: "Edit wording: Nozzle", exact: true }).click();
  await page.getByLabel("New wording").fill("REJECT me");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save wording" }).click();
  await expect(page.getByRole("alert")).toContainText("must be 1-200 characters");
  expect(api.stored("hose_reel")).toEqual({ "checklist.pumpHouse.pump_house_clean": "Pump room housekeeping" });
});

test("unsaved-changes guard on Back and browser navigation", async ({ page }) => {
  await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await openService(page, /Hose Reel System/);
  await page.getByRole("button", { name: "Edit wording: Drum", exact: true }).click();
  await page.getByLabel("New wording").fill("Reel drum");
  await page.getByRole("button", { name: "Done" }).click();

  const dialogs: string[] = [];
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  expect(dialogs).toEqual(["You have 1 unsaved wording change. Leave without saving?"]);
  await expect(page).toHaveURL(/\/service\/hose_reel$/);
  await expect(page.getByRole("button", { name: /Edit wording: Reel drum/ })).toBeVisible();

  // Browser Back is guarded too; declining keeps the editor and its draft.
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.goBack();
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(page).toHaveURL(/\/service\/hose_reel$/);
  await expect(page.getByRole("button", { name: /Edit wording: Reel drum/ })).toBeVisible();

  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.accept(); });
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  await expect(page).toHaveURL(new RegExp(`#/manager-customer/${customerId}$`));
  await expect(page.getByRole("heading", { name: "Services", level: 3, exact: true })).toBeVisible();
  expect(dialogs).toHaveLength(3);

  // No unsaved changes: Back leaves without asking.
  await openService(page, /Hose Reel System/);
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  await expect(page.getByRole("heading", { name: "Services", level: 3, exact: true })).toBeVisible();
  expect(dialogs).toHaveLength(3);
});

test("guard covers text typed into an open wording editor and Sign out", async ({ page }) => {
  await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await openService(page, /Hose Reel System/);
  // Typed but not committed with Done: still an unsaved change.
  await page.getByRole("button", { name: "Edit wording: Drum", exact: true }).click();
  await page.getByLabel("New wording").fill("Reel drum");

  const dialogs: string[] = [];
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  expect(dialogs).toEqual(["You have 1 unsaved wording change. Leave without saving?"]);
  await expect(page).toHaveURL(/\/service\/hose_reel$/);
  await expect(page.getByLabel("New wording")).toHaveValue("Reel drum");

  // Sign out asks too; declining keeps the session, the screen and the typed text.
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Sign out" }).click();
  expect(dialogs).toHaveLength(2);
  await expect(page).toHaveURL(/\/service\/hose_reel$/);
  await expect(page.getByLabel("New wording")).toHaveValue("Reel drum");

  // Accepting signs out.
  page.once("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.accept(); });
  await page.getByRole("button", { name: "Sign out" }).click();
  expect(dialogs).toHaveLength(3);
  await expect(page.getByLabel("New wording")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("search, only-custom filter and Preview as technician", async ({ page }) => {
  await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await openService(page, /Hose Reel System/);
  await expect.poll(() => legends(page)).toHaveLength(4);

  await page.getByLabel("Search labels").fill("pump");
  await expect.poll(() => legends(page)).toEqual(["Pump House", "Test Run Fire Pump 30 Minutes"]);
  await expect(page.getByRole("button", { name: "Edit wording: Keep Clean In Pump House" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit wording: S.A.J Main Water Supply" })).toHaveCount(0);
  await page.getByLabel("Search labels").fill("no such label");
  await expect(page.getByText("No fields match your search.")).toBeVisible();
  await page.getByLabel("Search labels").fill("");

  await page.getByLabel("Show only custom labels").check();
  await expect.poll(() => legends(page)).toEqual(["Water Tank"]);
  await expect(page.locator(".manager-wording-label")).toHaveCount(1);
  await expect(page.locator(".manager-wording-label")).toHaveText(/Tank Water Level/);
  await page.getByLabel("Show only custom labels").uncheck();

  // Preview hides every edit affordance and shows the effective wording (incl. drafts).
  await page.getByRole("button", { name: "Edit wording: Nozzle", exact: true }).click();
  await page.getByLabel("New wording").fill("Nozzle tip");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Preview as technician" }).click();
  await expect(page.getByRole("button", { name: "Preview as technician" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".manager-wording-label")).toHaveCount(0);
  await expect(page.locator(".manager-wording-badge")).toHaveCount(0);
  await expect(page.locator(".manager-wording-savebar")).toHaveCount(0);
  await expect(page.getByLabel("Search labels")).toHaveCount(0);
  await expect(page.getByText("including 1 unsaved change")).toBeVisible();
  await expect(page.locator(".manager-wording-section").getByText("Tank Water Level", { exact: true })).toBeVisible();
  await expect(page.locator(".manager-wording-section").getByText("Nozzle tip", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Cut In (PSI)").first()).toBeDisabled();
  await page.getByRole("button", { name: "Preview as technician" }).click();
  await expect(page.locator(".manager-wording-savebar")).toContainText("1 unsaved change");
});

test("unsupported service shows read-only wording; tabs are service-specific and remembered", async ({ page }) => {
  const api = await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await openService(page, /Fire Alarm & Detector System/);
  await expect(page.getByRole("tab")).toHaveText(["Form wording"]);
  await expect(page.getByText("Wording for this service can't be customised yet.")).toBeVisible();
  await expect(page.locator(".manager-wording-label, .manager-wording-savebar, .manager-wording-editor")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
  expect(api.requests.filter((entry) => entry.path.includes("/fire_alarm_detector/"))).toEqual([]);
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();

  // Not-yet-assigned CO2: only Preset rows.
  await openService(page, /CO2 Fire Extinguisher System/);
  await expect(page.getByRole("tab")).toHaveText(["Preset rows"]);
  await expect(page.getByText(/is not assigned to Harbour View Tower yet/)).toBeVisible();
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();

  // Sprinkler: Form wording + Settings; the selected tab is remembered for the session.
  await openService(page, /Automatic Sprinkler System/);
  await expect(page.getByRole("tab")).toHaveText(["Form wording", "Settings"]);
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  await openService(page, /Automatic Sprinkler System/);
  await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Settings" })).toBeVisible();
});

test("Preset rows and Settings tabs save exactly as the previous editors did", async ({ page }) => {
  const api = await installFakeManagerApi(page);
  await openFakeCustomer(page);
  const storesBefore = await indexedDbCounts(page);
  expect(Object.keys(storesBefore).length).toBeGreaterThan(0);

  // Riser system configuration.
  await openService(page, /Dry \/ Wet Riser System/);
  await expect(page.getByRole("tab")).toHaveText(["Form wording", "Settings"]);
  await page.getByRole("tab", { name: "Settings" }).click();
  const riser = page.getByRole("combobox", { name: "Riser mode" });
  await expect(riser).toHaveValue("dry");
  await expect(page.getByRole("button", { name: /Edit system settings/ })).toHaveCount(0);
  await riser.selectOption("wet");
  await expect(page.getByText("Unsaved changes.")).toBeVisible();
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText("Saved. A new configuration version was created.")).toBeVisible();
  expect(api.puts("/dry_wet_riser/system-configuration").map((entry) => entry.body)).toEqual([{ systemConfiguration: { riserMode: "wet" } }]);
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();

  // Sprinkler evidence policy.
  await openService(page, /Automatic Sprinkler System/);
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("combobox", { name: "Evidence policy" }).selectOption(policyId);
  await page.getByRole("button", { name: "Save evidence policy" }).click();
  await expect(page.getByText("Saved. A new configuration version was created.")).toBeVisible();
  expect(api.puts("/automatic_sprinkler/evidence-policy").map((entry) => entry.body)).toEqual([{ evidencePolicyId: policyId }]);
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  await expect(page.locator(".manager-service-card", { hasText: "Automatic Sprinkler System" })).toContainText("Evidence policy set");

  // Wet Chemical zones & locations.
  await openService(page, /Wet Chemical System/);
  await page.getByRole("tab", { name: "Preset rows" }).click();
  await expect(page.getByRole("textbox", { name: "Zone name for kitchen" })).toHaveValue("Kitchen Level 1");
  await page.getByRole("textbox", { name: "Location name for hood1" }).fill("Hood 1A");
  await page.getByRole("spinbutton", { name: "Preset rows for hood1" }).fill("3");
  await page.getByRole("button", { name: "Save zones & locations" }).click();
  await expect(page.getByText("Saved. A new configuration version was created.")).toBeVisible();
  expect(api.puts("/wet_chemical/locations").map((entry) => entry.body)).toEqual([{
    zones: [{ key: "kitchen", displayName: "Kitchen Level 1", sortOrder: 1 }],
    locations: [{ key: "hood1", displayName: "Hood 1A", zoneId: "kitchen", presetRowCount: 3 }]
  }]);
  // The Manager screens never write technician business data.
  const writes = api.requests.filter((entry) => entry.method !== "GET").map((entry) => entry.path.replace(/.*\/systems\//, ""));
  expect(writes).toEqual(["dry_wet_riser/system-configuration", "automatic_sprinkler/evidence-policy", "wet_chemical/locations"]);
  // ...and no local IndexedDB records (drafts, outbox, jobs) are created either.
  await page.getByRole("tab", { name: "Form wording" }).click();
  await page.getByRole("button", { name: "Edit wording: Control Panel Location" }).click();
  await page.getByLabel("New wording").fill("Panel location (kitchen)");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Save wording" }).click();
  await expect(page.locator(".manager-wording-savebar")).toContainText("No unsaved changes");
  expect(await indexedDbCounts(page)).toEqual(storesBefore);
});

test("FM200 can be opened in Manager Preset rows and given its first location", async ({ page }) => {
  const api = await installFakeManagerApi(page);
  await openFakeCustomer(page);
  const card = page.locator(".manager-service-card", { hasText: "FM200 System" });
  await expect(card).toContainText("General location in new visits");
  await openService(page, /FM200 System/);
  await expect(page.getByRole("tab")).toHaveText(["Preset rows"]);
  await page.getByRole("button", { name: "Add zone" }).click();
  await page.locator(".manager-locations-zone-list input").fill("Server Room");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.locator(".manager-locations-location-list input").first().fill("FM200 Panel");
  await page.getByRole("button", { name: "Save zones & locations" }).click();
  await expect(page.getByText("Saved. A new configuration version was created.")).toBeVisible();
  expect(api.puts("/fm200_fire_suppression/locations")).toHaveLength(1);
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  await expect(page.locator(".manager-service-card", { hasText: "FM200 System" })).toContainText("1 location set");
});

test("keyboard-only wording edit and tab navigation", async ({ page }) => {
  const api = await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await page.getByRole("button", { name: /Hose Reel System/ }).focus();
  await page.keyboard.press("Enter");
  const wordingTab = page.getByRole("tab", { name: "Form wording" });
  await expect(wordingTab).toBeVisible();
  const saj = page.getByRole("button", { name: "Edit wording: S.A.J Main Water Supply" });
  await saj.focus();
  await page.keyboard.press("Enter");
  const input = page.getByLabel("New wording");
  await expect(input).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Mains water supply");
  await page.keyboard.press("Enter");
  const renamed = page.getByRole("button", { name: "Edit wording: Mains water supply" });
  await expect(renamed).toBeFocused();
  // Escape cancels without changing the draft.
  await page.keyboard.press("Enter");
  await page.keyboard.type(" extra");
  await page.keyboard.press("Escape");
  await expect(renamed).toBeFocused();
  // Tab through to Save and press it.
  for (let step = 0; step < 400; step += 1) {
    if (await page.getByRole("button", { name: "Save wording" }).evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(page.getByRole("button", { name: "Save wording" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".manager-wording-savebar")).toContainText("No unsaved changes");
  expect(api.puts("/hose_reel/label-overrides").at(-1)!.body).toEqual({ labelOverrides: {
    "checklist.waterTank.water_level": "Tank Water Level",
    "checklist.waterTank.saj_main_water_supply": "Mains water supply"
  } });

  // Arrow keys move between tabs (Wet Chemical has two).
  await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  await openService(page, /Wet Chemical System/);
  await page.getByRole("tab", { name: "Form wording" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Preset rows" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Preset rows" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Form wording" })).toHaveAttribute("aria-selected", "true");
});

test("a formLayout that disagrees with the label tree fails closed; a missing one falls back", async ({ page }) => {
  const api = await installFakeManagerApi(page);
  api.options.poisonFormLayout = true;
  await openFakeCustomer(page);
  await page.getByRole("button", { name: /Hose Reel System/ }).click();
  // Authority failure: the existing fail-closed path drops the Manager presentation; no replica is rendered.
  await expect(page.getByRole("alert")).toHaveText("Manager server data is currently unavailable.");
  await expect(page.locator(".manager-wording-label")).toHaveCount(0);

  api.options.poisonFormLayout = false;
  api.options.omitFormLayout = true;
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.evaluate((hash) => { window.location.hash = hash; }, `#/manager-customer/${customerId}/service/hose_reel`);
  await expect(page.getByRole("button", { name: "Edit wording: S.A.J Main Water Supply" })).toBeVisible();
  expect(await page.locator(".manager-wording-label").count()).toBeGreaterThan(20);
  expect(api.requests.some((entry) => entry.path === hoseWordingPath)).toBe(true);
});

test("375px: customer page and every editor tab have no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installFakeManagerApi(page);
  await openFakeCustomer(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const [service, tabs] of [[/Hose Reel System/, ["Form wording"]], [/Wet Chemical System/, ["Form wording", "Preset rows"]], [/Automatic Sprinkler System/, ["Form wording", "Settings"]]] as const) {
    await openService(page, service);
    for (const tab of tabs) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tabpanel", { name: tab })).toBeVisible();
      await page.waitForTimeout(100);
      expect(await overflow(), `${service} ${tab}`).toBeLessThanOrEqual(0);
    }
    if (tabs[0] === "Form wording") {
      await page.getByRole("tab", { name: "Form wording" }).click();
      await page.locator(".manager-wording-label").first().click();
      expect(await overflow(), `${service} inline editor`).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Cancel" }).click();
    }
    await page.getByRole("button", { name: "Back to Harbour View Tower" }).click();
  }
});
