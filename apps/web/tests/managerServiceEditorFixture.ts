import type { Page, Route } from "@playwright/test";
import { buildLabelOverrideFormLayout } from "../../api/src/inspections/labelOverrideFormLayout";
import { collectResolvedLabelPaths } from "../../api/src/inspections/labelOverrides";
import { resolveAutomaticSprinklerControls } from "../../api/src/inspections/templates/automaticSprinklerDefinitionControls";
import { resolveCo2Controls } from "../../api/src/inspections/templates/co2DefinitionControls";
import { resolveHoseReelControls } from "../../api/src/inspections/templates/definitionControls";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";

/**
 * Stateful fake Manager API for the per-service editor specs (and the
 * out-of-repo screenshot script). Label trees and the additive `formLayout` are
 * produced by the REAL API resolvers against the published V7 definitions, and
 * PUT validation mirrors apps/api/src/routes/managerCustomers.ts
 * (UNKNOWN_LABEL_PATH / INVALID_LABEL_OVERRIDE, trim, versioning). Nothing here
 * touches a database.
 */
export const customerId = "00000000-0000-4000-8000-000000000950";
export const policyId = "00000000-0000-4000-8000-000000000959";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const definition = (key: string) => {
  const system = masterServiceReportV7.systems.find((candidate) => candidate.key === key);
  if (!system) throw new Error(`V7 has no ${key}`);
  return system;
};

const controlsBySystem: Record<string, unknown> = {
  hose_reel: resolveHoseReelControls(definition("hose_reel"), "MFE-FSSR", 7),
  automatic_sprinkler: resolveAutomaticSprinklerControls(definition("automatic_sprinkler"), "MFE-FSSR", 7),
  wet_chemical: resolveCo2Controls(definition("wet_chemical"), "MFE-FSSR", 7)
};

export type Captured = { method: string; path: string; body?: unknown };

export type FakeManagerApi = {
  requests: Captured[];
  puts: (suffix: string) => Captured[];
  stored: (systemKey: string) => Record<string, string>;
  options: { omitFormLayout: boolean; poisonFormLayout: boolean };
};

export async function installFakeManagerApi(page: Page, initialOverrides: Record<string, Record<string, string>> = {
  hose_reel: { "checklist.waterTank.water_level": "Tank Water Level" }
}): Promise<FakeManagerApi> {
  let revision = 5;
  const overrides: Record<string, Record<string, string>> = { hose_reel: {}, automatic_sprinkler: {}, wet_chemical: {}, ...structuredClone(initialOverrides) };
  let riserConfiguration: Record<string, string> = { riserMode: "dry" };
  let evidencePolicyId: string | null = null;
  const locationSets: Record<string, { zones: Array<{ id: string; key: string; displayName: string; sortOrder: number }>; locations: Array<{ id: string; key: string; displayName: string; zoneId: string; presetRowCount: number }> }> = {
    wet_chemical: {
      zones: [{ id: id(961), key: "kitchen", displayName: "Kitchen Level 1", sortOrder: 1 }],
      locations: [{ id: id(971), key: "hood1", displayName: "Hood 1", zoneId: id(961), presetRowCount: 2 }]
    },
    co2_fire_extinguisher: { zones: [], locations: [] }
  };
  const options = { omitFormLayout: false, poisonFormLayout: false };
  const requests: Captured[] = [];

  const enabledSystems = () => [
    { key: "hose_reel", displayName: "Hose Reel System", sortOrder: 1, systemConfiguration: {}, evidencePolicyId: null, labelOverrides: overrides.hose_reel, zones: [], locations: [] },
    { key: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 2, systemConfiguration: {}, evidencePolicyId, labelOverrides: overrides.automatic_sprinkler, zones: [], locations: [] },
    { key: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 3, systemConfiguration: riserConfiguration, evidencePolicyId: null, labelOverrides: {}, zones: [], locations: [] },
    { key: "fire_alarm_detector", displayName: "Fire Alarm & Detector System", sortOrder: 4, systemConfiguration: {}, evidencePolicyId: null, labelOverrides: {}, zones: [], locations: [] },
    { key: "wet_chemical", displayName: "Wet Chemical System", sortOrder: 5, systemConfiguration: {}, evidencePolicyId: null, labelOverrides: overrides.wet_chemical,
      zones: locationSets.wet_chemical!.zones, locations: locationSets.wet_chemical!.locations }
  ];
  const customer = () => ({
    customer: { id: customerId, code: "C950", displayName: "Harbour View Tower", nextServiceDueDate: null, contactPhone: "03-5550 1234", contactPerson: "Ms Tan" },
    sites: [{ id: id(951), code: "PRIMARY", displayName: "Tower A" }],
    configuration: { id: id(952 + revision), revision, enabledSystems: enabledSystems() },
    supportedSystems: [
      { key: "hose_reel", displayName: "Hose Reel System", sortOrder: 1, assignable: true },
      { key: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 2, assignable: true },
      { key: "dry_wet_riser", displayName: "Dry / Wet Riser System", sortOrder: 3, assignable: true },
      { key: "fire_alarm_detector", displayName: "Fire Alarm & Detector System", sortOrder: 4, assignable: true },
      { key: "wet_chemical", displayName: "Wet Chemical System", sortOrder: 5, assignable: true },
      { key: "co2_fire_extinguisher", displayName: "CO2 Fire Extinguisher System", sortOrder: 6, assignable: false, unavailableReason: "Location configuration required" }
    ]
  });

  const labelBody = (systemKey: string, withLayout: boolean) => {
    const controls = controlsBySystem[systemKey];
    const stored = overrides[systemKey] ?? {};
    const labels = collectResolvedLabelPaths(controls).map((entry) => {
      const value = stored[entry.path];
      const overridden = typeof value === "string" && value.trim().length > 0;
      return { path: entry.path, key: entry.key, definitionLabel: entry.definitionLabel, effectiveLabel: overridden ? value.trim() : entry.definitionLabel, overridden };
    });
    const body: Record<string, unknown> = { systemKey, templateVersion: 7, labels, overrides: { ...stored } };
    if (withLayout && !options.omitFormLayout) {
      const layout = buildLabelOverrideFormLayout(systemKey, controls);
      body.formLayout = options.poisonFormLayout
        ? { sections: [{ ...layout.sections[0], fields: [...layout.sections[0]!.fields, { path: "not.a.real.path", control: "text", parentPath: null, result: null, unit: null, remarks: false }] }] }
        : layout;
    }
    return body;
  };

  const locationsBody = (systemKey: string) => {
    const set = locationSets[systemKey]!;
    return {
      systemKey, templateVersion: 7,
      zones: set.zones.map((zone) => ({ ...zone, enabledSystemId: id(990) })),
      locations: set.locations.map((location, index) => ({ ...location, enabledSystemId: id(990), rowPreset: {}, sortOrder: index + 1 }))
    };
  };
  const riserBody = () => ({
    systemKey: "dry_wet_riser", templateVersion: 7,
    schema: { fields: [{ key: "riserMode", label: "Riser mode", control: "select", required: true, options: [{ value: "dry", label: "Dry" }, { value: "wet", label: "Wet" }] }] },
    configuration: { ...riserConfiguration }
  });
  const evidenceBody = () => ({
    systemKey: "automatic_sprinkler", templateVersion: 7,
    field: { key: "evidencePolicyId", label: "Evidence policy", control: "select", required: false },
    policies: [{ id: policyId, code: "LEGACY_PSI_PHOTO", version: 1, label: "Legacy PSI photo evidence (v1)" }],
    evidencePolicyId
  });

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    requests.push({ method, path: path + url.search, ...(body === undefined ? {} : { body }) });
    const json = (payload: unknown, status = 200) => route.fulfill({ status, json: payload, headers: { "cache-control": "no-store" } });

    if (path === "/api/auth/me") return json({ user: { id: 804, username: "manager", role: "admin" } });
    if (path === "/api/manager/customers") return json({ customers: [customer()] });
    if (path === `/api/manager/customers/${customerId}`) return json({ customer: customer() });
    if (path.startsWith("/api/manager/service-visits")) return json({ serviceVisits: [], nextCursor: null, totalCount: 0 });

    const match = path.match(new RegExp(`^/api/manager/customers/${customerId}/systems/([a-z0-9_]+)/([a-z-]+)$`));
    if (match) {
      const [, systemKey, resource] = match as unknown as [string, string, string];
      if (resource === "label-overrides") {
        if (!controlsBySystem[systemKey]) return json({ error: "LABEL_OVERRIDES_UNSUPPORTED_SYSTEM", message: "Label overrides are not supported for this system." }, 404);
        if (method === "GET") return json(labelBody(systemKey, true));
        const map = (body as { labelOverrides?: Record<string, unknown> }).labelOverrides ?? {};
        const valid = new Set(collectResolvedLabelPaths(controlsBySystem[systemKey]).map((entry) => entry.path));
        for (const [labelPath, label] of Object.entries(map)) {
          if (!valid.has(labelPath)) return json({ error: "UNKNOWN_LABEL_PATH", message: `Unknown label path: ${labelPath}` }, 400);
          if (typeof label !== "string" || !label.trim() || label.trim().length > 200 || /REJECT/.test(label)) {
            return json({ error: "INVALID_LABEL_OVERRIDE", message: `Label override for ${labelPath} must be 1-200 characters.` }, 400);
          }
        }
        overrides[systemKey] = Object.fromEntries(Object.entries(map).map(([labelPath, label]) => [labelPath, (label as string).trim()]));
        revision += 1;
        return json({ customer: customer(), ...labelBody(systemKey, false) });
      }
      if (resource === "system-configuration" && systemKey === "dry_wet_riser") {
        if (method === "PUT") { riserConfiguration = { ...(body as { systemConfiguration: Record<string, string> }).systemConfiguration }; revision += 1; return json({ customer: customer(), ...riserBody() }); }
        return json(riserBody());
      }
      if (resource === "evidence-policy" && systemKey === "automatic_sprinkler") {
        if (method === "PUT") { evidencePolicyId = (body as { evidencePolicyId: string | null }).evidencePolicyId; revision += 1; return json({ customer: customer(), ...evidenceBody() }); }
        return json(evidenceBody());
      }
      if (resource === "locations" && locationSets[systemKey]) {
        if (method === "PUT") {
          const draft = body as { zones: Array<{ key: string; displayName: string; sortOrder: number }>; locations: Array<{ key: string; displayName: string; zoneId: string; presetRowCount: number }> };
          const zones = draft.zones.map((zone, index) => ({ id: id(1100 + index), key: zone.key, displayName: zone.displayName, sortOrder: zone.sortOrder }));
          locationSets[systemKey] = {
            zones,
            locations: draft.locations.map((location, index) => ({ id: id(1200 + index), key: location.key, displayName: location.displayName, zoneId: zones.find((zone) => zone.key === location.zoneId)?.id ?? "", presetRowCount: location.presetRowCount }))
          };
          revision += 1;
          return json({ customer: customer(), ...locationsBody(systemKey) });
        }
        return json(locationsBody(systemKey));
      }
      return json({ error: "NOT_FOUND", message: "Not found." }, 404);
    }
    return json({});
  });

  return {
    requests,
    puts: (suffix) => requests.filter((entry) => entry.method === "PUT" && entry.path.endsWith(suffix)),
    stored: (systemKey) => ({ ...(overrides[systemKey] ?? {}) }),
    options
  };
}

/** Sign in as the Manager (role picker) and open the fake customer's page. */
export async function openFakeCustomer(page: Page) {
  await page.goto("/tests/manager-service-editor.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByRole("button", { name: "Add Customer", exact: true }).click();
  await page.getByRole("button", { name: /Harbour View Tower/ }).click();
  await page.getByRole("heading", { name: "Harbour View Tower", level: 2 }).waitFor();
}
