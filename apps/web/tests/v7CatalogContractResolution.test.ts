import assert from "node:assert/strict";
import test from "node:test";
import { compatibleCatalogSystem } from "../src/referenceData/systemContractCompatibility";
import type { CatalogSystem, CatalogTemplate, InspectionCatalog } from "../src/referenceData/referenceDataTypes";

// The published MFE-FSSR identities the catalog endpoint returns, in the order it
// returns them (ORDER BY version).  Ordering is the point of this suite: a contract
// lookup that scans the catalog instead of keying off the job's frozen version will
// match the older row first and compare a V7 definition against a V1/V4 contract.
const identities = [
  { version: 1, id: "00000000-0000-4000-8000-000000000501" },
  { version: 2, id: "00000000-0000-4000-8000-000000000802" },
  { version: 3, id: "00000000-0000-4000-8000-000000000803" },
  { version: 4, id: "00000000-0000-4000-8000-000000000804" },
  { version: 5, id: "00000000-0000-4000-8000-000000000805" },
  { version: 6, id: "00000000-0000-4000-8000-000000000806" },
  { version: 7, id: "00000000-0000-4000-8000-000000000807" }
] as const;

const historicalSuppression = (key: string): CatalogSystem => ({
  key,
  displayName: key,
  sortOrder: 1,
  definitionStatus: "confirmed",
  definition: { key, results: ["good", "poor"] }
});

// V7 widens the suppression result set; that widening is exactly what must not be
// compared against the historical contract.
const v7Suppression = (key: string): CatalogSystem => ({
  key,
  displayName: key,
  sortOrder: 1,
  definitionStatus: "confirmed",
  definition: { key, results: ["good", "not_good", "complete_repair", "na"] }
});

function template(version: number, id: string): CatalogTemplate {
  const suppression = version === 7 ? v7Suppression : historicalSuppression;
  return {
    id,
    code: "MFE-FSSR",
    name: "MFE Fire System Service Report Template",
    version,
    selectionPolicy: "preset_only",
    headerDefinition: {},
    reportBoilerplate: {},
    systems: [suppression("co2_fire_extinguisher"), suppression("wet_chemical"), suppression("hydrant")]
  };
}

function catalog(): InspectionCatalog {
  const templates = identities.map((identity) => template(identity.version, identity.id));
  return { template: templates[0]!, templates };
}

function identity(version: number) {
  const found = identities.find((candidate) => candidate.version === version)!;
  return { id: found.id, code: "MFE-FSSR", version: found.version };
}

test("V7 CO2 and Wet Chemical resolve against V7's own contract, not the historical row", () => {
  for (const key of ["co2_fire_extinguisher", "wet_chemical"] as const) {
    const resolved = compatibleCatalogSystem(catalog(), identity(7), key);
    assert.ok(resolved, `${key} must resolve on a V7 job`);
    assert.equal(resolved.template.version, 7);
    assert.equal(resolved.system.key, key);
    assert.deepEqual(resolved.system.definition.results, ["good", "not_good", "complete_repair", "na"]);
  }
});

test("V7 Hydrant resolves against V7's own contract, not the historical row", () => {
  const resolved = compatibleCatalogSystem(catalog(), identity(7), "hydrant");
  assert.ok(resolved, "hydrant must resolve on a V7 job");
  assert.equal(resolved.template.version, 7);
  assert.deepEqual(resolved.system.definition.results, ["good", "not_good", "complete_repair", "na"]);
});

test("historical CO2 and Wet Chemical jobs keep their frozen contract version", () => {
  // CO2's contract is V1 and Wet Chemical's is V4; every pre-V7 template carries
  // them forward identically, so each historical job still resolves.
  for (const version of [1, 2, 3, 4, 5, 6]) {
    for (const key of ["co2_fire_extinguisher", "wet_chemical"] as const) {
      const resolved = compatibleCatalogSystem(catalog(), identity(version), key);
      assert.ok(resolved, `${key} must resolve on a V${version} job`);
      assert.equal(resolved.template.version, version);
      assert.deepEqual(
        resolved.system.definition.results,
        ["good", "poor"],
        `V${version} ${key} must keep the historical result set`
      );
    }
  }
});

test("a cached definition that drifts from its frozen contract version fails closed", () => {
  // The cross-version guard: a V6 job resolves CO2 against the V1 contract, so a
  // V6 row whose definition no longer matches V1 must not be advertised.
  const drifted = catalog();
  const v6 = drifted.templates.find((candidate) => candidate.version === 6)!;
  v6.systems = v6.systems.map((system) => system.key === "co2_fire_extinguisher"
    ? { ...system, definition: { ...system.definition, results: ["good"] } }
    : system);
  assert.equal(compatibleCatalogSystem(drifted, identity(6), "co2_fire_extinguisher"), undefined);
  // The untouched sibling on the same template still resolves.
  assert.ok(compatibleCatalogSystem(drifted, identity(6), "wet_chemical"));
});

test("an unconfirmed definition is never advertised as a usable contract", () => {
  const unconfirmed = catalog();
  const v7 = unconfirmed.templates.find((candidate) => candidate.version === 7)!;
  v7.systems = v7.systems.map((system) => ({ ...system, definitionStatus: "requires_confirmation" as const }));
  assert.equal(compatibleCatalogSystem(unconfirmed, identity(7), "wet_chemical"), undefined);
});
