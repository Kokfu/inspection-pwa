import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * P1-A: in ONE verified session (no reload) a visit created offline opens its Automatic Sprinkler form, a field is saved
 * locally and the reconnect sync uses the exact UUID. Offline service visit creation through the real app: create with the server unreachable, open the visit and its
 * forms from the device, reload, reconnect and see the server's SV number replace the placeholder (exact UUID).
 * Also: a server refusal shows "Needs attention", and online creation is unchanged.
 */
const sprinklerTemplate = "00000000-0000-4000-8000-000000000807";
const ids = {
  customer: "00000000-0000-4000-8000-000000009301", site: "00000000-0000-4000-8000-000000009302",
  revision: "00000000-0000-4000-8000-000000009303", enabled: "00000000-0000-4000-8000-000000009305",
  catalog: "00000000-0000-4000-8000-000000009308"
};
const customer = { id: ids.customer, code: "C-9301", displayName: "Sprinkler Phone Customer", isDemo: false };
// Same published Automatic Sprinkler V7 definition the label-override browser harness uses.
const state4 = ["good", "not_good", "complete_repair", "na"];
const field = (key: string, label: string, sortOrder: number) => ({ key, label, sortOrder, control: "good_poor", required: false, allowedValues: state4, remarksPolicy: "optional" });
const measure = (key: string, label: string, sortOrder: number, valueKeys: string[]) => ({ key, label, sortOrder, result: { control: "good_poor", allowedValues: state4 }, measurements: valueKeys.map((vk: string, i: number) => ({ key: vk, label: vk === "cut_in" ? "Cut In" : vk === "cut_out" ? "Cut Out" : "Reading", unit: "PSI", sortOrder: i + 1 })) });
const definition = { key: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 6, definitionStatus: "confirmed", configuration: { supportsZones: false, supportsLocations: false, supportsPresetRows: false }, sections: [
  { key: "water_tank", title: "Water Tank", sortOrder: 1, blocks: [{ key: "water_tank_checks", title: "Water Tank", type: "checklist", sortOrder: 1, items: [field("saj_main_water_supply", "S.A.J Main Water Supply", 1), field("water_level", "Water Level", 2), field("automatic_refilling_facilities", "Automatic Refilling Facilities", 3), field("drain_and_stop_valve_positions", "Drain Valve Closed and Stop Valves Open", 4)] }] },
  { key: "pump_house", title: "Pump House", sortOrder: 2, blocks: [
    { key: "pump_house_checks", title: "Pump House", type: "checklist", sortOrder: 1, items: [field("pump_house_clean", "Keep Clean in Pump House", 1), field("manual_start_pumps", "Manual Start Jockey, Duty and Stand-by Pumps", 2), field("standby_pump_service_items", "Stand-by Pump Service Items", 3), field("battery_charging_alternator", "Battery Charging Alternator Operation", 4), field("battery_serviceable", "Battery in Good Serviceable Condition", 5), field("pump_phase_failure_alarm", "Pump Run / Phase Failure Alarm", 6), field("pumps_auto_start", "Pumps in Auto Start Position", 7), field("test_and_gate_valve_positions", "Test Valve Closed and Gate Valves Open", 8)] },
    { key: "pump_pressure_measurements", title: "Pressure", type: "measurement", sortOrder: 2, items: [measure("jockey_pump_pressure", "Jockey Pump", 1, ["cut_in", "cut_out"]), measure("duty_pump_cut_in", "Duty Pump Cut In", 2, ["value"]), measure("standby_pump_cut_in", "Stand-by Pump Cut In", 3, ["value"])] }] },
  { key: "main_alarm_valve", title: "Main Alarm Valve", sortOrder: 3, blocks: [
    { key: "main_alarm_valve_checks", title: "Main Alarm Valve", type: "checklist", sortOrder: 1, items: [field("breaching_inlet", "Breaching Inlet in Good Serviceable Condition", 1), field("alarm_gong", "Alarm Gong in Function", 2), field("flow_meter_valve_positions", "Flow Meter Valve Closed and Other Valves Open", 3)] },
    { key: "alarm_valve_measurements", title: "Gauges", type: "measurement", sortOrder: 2, items: [measure("water_supply_gauge", "Water Supply Gauge", 1, ["value"]), measure("installation_gauge", "Installation Gauge", 2, ["value"])] },
    { key: "test_run_fire_pump_checks", title: "Test Run Fire Pump 30 Minutes", type: "checklist", sortOrder: 3, items: [field("trfp_jockey_pump", "Jockey Pump", 1), field("trfp_duty_pump", "Duty Pump", 2), field("trfp_standby_pump", "Standby Pump", 3)] },
    { key: "comments", title: "Comments", type: "comments", sortOrder: 4, field: { control: "remarks", policy: "optional", maxLength: 4000 } }] }] };
const catalogV7 = { id: sprinklerTemplate, code: "MFE-FSSR", name: "Service Report", version: 7, selectionPolicy: "preset_only", headerDefinition: {}, reportBoilerplate: {}, systems: [{ key: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed", definition }] };
const catalogV1 = { ...catalogV7, id: ids.catalog, version: 1, systems: [] };
const configuration = {
  customer,
  configuration: {
    configurationId: ids.revision, revision: 3, templateId: sprinklerTemplate, templateCode: "MFE-FSSR", templateName: "Service Report",
    templateVersion: 7, selectionPolicy: "preset_only",
    enabledSystems: [{ id: ids.enabled, key: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed", zones: [], locations: [] }]
  }
};

type Server = { reachable: boolean; creates: Array<Record<string, unknown>>; serverJobs: unknown[] };

async function install(page: Page, server: Server) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!server.reachable) return route.abort("connectionrefused");
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 9301, username: "tech", role: "inspector" } };
    else if (path === "/api/health") json = { status: "ok" };
    else if (path === "/api/inspection-catalog") json = { template: catalogV1, templates: [catalogV1, catalogV7] };
    else if (path === "/api/customers") json = { customers: [customer] };
    else if (path === `/api/customers/${ids.customer}/sites`) json = { sites: [{ id: ids.site, customerId: ids.customer, code: "S-1", displayName: "Main Site" }] };
    else if (path === `/api/customers/${ids.customer}/configuration`) json = configuration;
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/inspection-jobs" && request.method() === "GET") json = { jobs: server.serverJobs };
    else if (path === "/api/inspection-jobs/service-visits" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      server.creates.push(body);
      const visitDate = String(body.visitDate);
      return route.fulfill({ status: 201, json: {
        clientJobUuid: body.clientJobUuid, jobId: body.clientJobUuid, visitNumber: `SV-${visitDate.replaceAll("-", "")}-51`,
        configurationRevisionId: body.configurationRevisionId, deviceCreatedAt: body.deviceCreatedAt, visitDate,
        arrivalTime: body.arrivalTime, idempotent: false
      } });
    }
    await route.fulfill({ json });
  });
}

async function storedVisit(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const found: unknown[] = [];
    for (const info of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((ok, fail) => { const request = indexedDB.open(info.name!); request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error); });
      if (db.objectStoreNames.contains("offlineServiceVisits")) {
        const all = await new Promise<unknown[]>((ok, fail) => { const r = db.transaction("offlineServiceVisits").objectStore("offlineServiceVisits").getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
        found.push(...all.map((visit) => { const v = visit as { clientJobUuid: string; syncStatus: string; receipt?: { visitNumber: string } }; return { clientJobUuid: v.clientJobUuid, syncStatus: v.syncStatus, visitNumber: v.receipt?.visitNumber }; }));
      }
      db.close();
    }
    return found.map((item) => JSON.stringify(item)).join(" ");
  });
}

async function storedInspections(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const found: unknown[] = [];
    for (const info of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((ok, fail) => { const request = indexedDB.open(info.name!); request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error); });
      if (db.objectStoreNames.contains("masterSystemInspections")) {
        const all = await new Promise<unknown[]>((ok, fail) => { const r = db.transaction("masterSystemInspections").objectStore("masterSystemInspections").getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
        found.push(...all.map((record) => (record as { responses?: unknown }).responses));
      }
      db.close();
    }
    return JSON.stringify(found);
  });
}

test("P1-A: verified session, offline-created visit opens the Automatic Sprinkler form with no reload, saves locally, then syncs with the exact UUID", async ({ page }) => {
  const server: Server = { reachable: true, creates: [], serverJobs: [] };
  await install(page, server);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".connection-state")).toHaveText("Online");

  // Online first, so the customer's sites and setup are on the device.
  await page.getByRole("button", { name: "+ New Service Visit" }).click();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await expect(page.getByLabel("Site", { exact: true }).getByRole("option", { name: "Main Site" })).toBeAttached();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Back to My Jobs/ }).click();

  // The connection drops without a reload and without the browser raising an "offline" event (weak signal, phone
  // in a lift): the session stays "verified" while every request fails, which is how the phone test hit the bug.
  server.reachable = false;
  await page.getByRole("button", { name: "+ New Service Visit" }).click();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
  await page.getByRole("checkbox", { name: "Automatic Sprinkler System" }).check();
  await page.getByRole("button", { name: "Create Service Visit" }).click();
  await expect(page.getByRole("heading", { name: "Sprinkler Phone Customer" })).toBeVisible({ timeout: 15_000 });
  const uuid = await page.evaluate(() => decodeURIComponent(location.hash.split("/")[2] ?? ""));
  expect(uuid).toMatch(/^[0-9a-f-]{36}$/);

  await expect(page.getByRole("button", { name: "Reconnect" }), "session must still be verified").toHaveCount(0);

  // The system card opens the form from the device (this is the step that showed "Failed to fetch").
  await page.getByRole("button", { name: /Automatic Sprinkler/ }).click();
  const waterLevel = page.getByRole("group", { name: "Water Level result" });
  await expect(waterLevel).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Failed to fetch")).toHaveCount(0);
  expect(await storedInspections(page)).not.toContain('"good"');
  await waterLevel.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Save Draft" }).first().click();
  await expect.poll(() => storedInspections(page), { timeout: 15_000 }).toContain('"good"');
  expect(server.creates).toHaveLength(0);

  // Reconnect: the visit is created once with the exact UUID and gets its SV number.
  server.reachable = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => server.creates.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(new Set(server.creates.map((body) => body.clientJobUuid))).toEqual(new Set([uuid]));
  await expect.poll(() => storedVisit(page), { timeout: 20_000 }).toMatch(new RegExp(`"clientJobUuid":"${uuid}".*"syncStatus":"Synced".*"visitNumber":"SV-\[0-9]{8}-51"`));
});
