import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseServerCo2Detail } from "../src/co2/serverCo2Api";
import { parseServerWetChemicalDetail } from "../src/wetChemical/serverWetChemicalApi";
import { ServerWetChemicalView } from "../src/wetChemical/ServerWetChemicalView";

// Real route payloads (see `_provenance` in the JSON). The Wet Chemical API
// returns the shared suppression accepted-detail shape, the same as CO2.
type Payload = Record<string, unknown> & { clientUuid: string; jobId: string };
const payloads = JSON.parse(readFileSync(new URL("./wetChemicalAcceptedDetailPayloads.json", import.meta.url), "utf8")) as { wetChemicalV7: Payload; wetChemicalV4: Payload; co2V7: Payload };
const clone = (value: Payload) => structuredClone(value) as Payload & Record<string, any>;
const parse = (value: Payload) => parseServerWetChemicalDetail(value, value.clientUuid, value.jobId);
const legacyFields = ["clientUuid", "serverFormInstanceId", "jobId", "jobReference", "jobTitle", "customerName", "systemKey", "systemLabel", "instanceKey", "status", "performedAt", "receivedAt", "responses", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];

test("(a) the real Wet Chemical V7 route payload parses with its 4-state results", () => {
  const source = payloads.wetChemicalV7;
  assert.equal((source.template as { version: number }).version, 7);
  const parsed = parse(source);
  assert.ok(parsed, "real V7 route payload must parse");
  assert.deepEqual(Object.keys(parsed).sort(), [...legacyFields].sort());
  assert.equal(parsed.responses.chargerAndBatteries.main_supply.result, "not_good");
  assert.equal(parsed.responses.chargerAndBatteries.main_supply.remarks, "Runtime Wet Chemical Poor A");
  assert.equal(parsed.responses.chargerAndBatteries.charger.result, "na");
  assert.equal(parsed.responses.physicalOutlook.wet_chemical_cylinder.result, "not_good");
  assert.equal(parseServerWetChemicalDetail(source, source.clientUuid, "00000000-0000-4000-8000-000000000999"), undefined, "expected job id still enforced");
  assert.equal(parseServerWetChemicalDetail(source, "00000000-0000-4000-8000-000000000999"), undefined, "requested client uuid still enforced");
});

test("(b) a Wet Chemical V4 accepted payload parses through the same parser and renders", () => {
  const source = payloads.wetChemicalV4;
  assert.equal((source.template as { version: number }).version, 4);
  const parsed = parse(source);
  assert.ok(parsed, "V4 payload must parse");
  assert.deepEqual(parsed, Object.fromEntries(legacyFields.map((key) => [key, source[key]])), "V4 detail is exactly the legacy projection");
  const html = renderToStaticMarkup(createElement(ServerWetChemicalView, { inspection: parsed, onBack: () => {} }));
  for (const expected of ["WET-V4-HISTORICAL", "Kitchen hood panel", "Hood 1", "Hood 2", "V4 row remark", "Historical V4 accepted comments", "battery poor remark"]) assert.ok(html.includes(expected), `render contains ${expected}`);
  assert.equal((html.match(/<input|<textarea|<select/g) ?? []).length, 0, "accepted view stays read-only");
  const v4WithV7Value = clone(source); v4WithV7Value.responses.chargerAndBatteries.main_supply.result = "not_good";
  assert.equal(parse(v4WithV7Value), undefined, "V4 keeps the good/poor model");
  const v7WithLegacyValue = clone(payloads.wetChemicalV7); v7WithLegacyValue.responses.chargerAndBatteries.battery.result = "poor";
  assert.equal(parse(v7WithLegacyValue), undefined, "V7 keeps the 4-state model");
});

test("(b2) V5 and V6 Wet Chemical details (V4 definition, source.templateVersion 4) parse like V4", () => {
  const source = payloads.wetChemicalV4;
  const v4 = parse(source);
  assert.ok(v4, "V4 payload must parse");
  const v4Html = renderToStaticMarkup(createElement(ServerWetChemicalView, { inspection: v4, onBack: () => {} }));
  for (const [id, version] of [["00000000-0000-4000-8000-000000000805", 5], ["00000000-0000-4000-8000-000000000806", 6]] as const) {
    const restamped = clone(source); restamped.template = { ...restamped.template, id, version };
    assert.equal(restamped.displayControls.source.templateVersion, 4);
    const parsed = parse(restamped);
    assert.ok(parsed, `V${version} payload must parse`);
    assert.deepEqual(parsed, v4, `V${version} detail equals the V4 detail`);
    assert.equal(renderToStaticMarkup(createElement(ServerWetChemicalView, { inspection: parsed, onBack: () => {} })), v4Html, `V${version} renders the same markup`);
  }
});

test("(b3) template version must match the server source-version mapping (7 -> 7, 4..6 -> 4)", () => {
  for (const version of [4, 5, 6]) {
    const value = clone(payloads.wetChemicalV7); value.template.version = version;
    assert.equal(parse(value), undefined, `V7 controls with template.version ${version} must be rejected`);
  }
  const v4AsV7 = clone(payloads.wetChemicalV4); v4AsV7.template.version = 7;
  assert.equal(parse(v4AsV7), undefined, "V4 controls with template.version 7 must be rejected");
  const v4AsV3 = clone(payloads.wetChemicalV4); v4AsV3.template.version = 3;
  assert.equal(parse(v4AsV3), undefined, "V4 controls with template.version 3 must be rejected (Wet Chemical starts at V4)");
});

const rejections: Array<[string, (value: Payload & Record<string, any>) => void]> = [
  ["evidencePolicyId present", (value) => { value.evidencePolicyId = null; }],
  ["legacy evidencePolicy* shape (all four keys)", (value) => { Object.assign(value, { evidencePolicyId: null, evidencePolicyVersion: null, evidencePolicyDefinition: null, evidencePolicySha256: null }); }],
  ["unknown extra key", (value) => { value.extra = true; }],
  ["missing zoneId", (value) => { delete value.zoneId; }],
  ["bad instanceKey", (value) => { value.instanceKey = "location:00000000-0000-4000-8000-000000000004"; }],
  ["non-uuid locationId", (value) => { value.locationId = "kitchen"; value.instanceKey = "location:kitchen"; }],
  ["wrong systemKey", (value) => { value.systemKey = "co2_fire_extinguisher"; }],
  ["wrong systemLabel", (value) => { value.systemLabel = "CO2 Fire Extinguisher System"; }],
  ["non-uuid zoneId", (value) => { value.zoneId = "zone-1"; }],
  ["displaySequence 0", (value) => { value.displaySequence = 0; }],
  ["template code", (value) => { value.template.code = "OTHER"; }],
  ["template extra key", (value) => { value.template.extra = 1; }],
  ["non-uuid template id", (value) => { value.template.id = "wet-chemical-v7"; }],
  ["configuration extra key", (value) => { value.configuration.extra = 1; }],
  ["configuration missing revisionNumber", (value) => { delete value.configuration.revisionNumber; }],
  ["configuration non-uuid revisionId", (value) => { value.configuration.revisionId = "rev-1"; }],
  ["configuration revisionNumber 0", (value) => { value.configuration.revisionNumber = 0; }],
  ["millisecond timestamp", (value) => { value.performedAt = "2026-09-19T00:00:00.000Z"; }],
  ["impossible timestamp", (value) => { value.receivedAt = "2026-02-30T00:00:00.000000Z"; }],
  ["blank creator username", (value) => { value.deviceReportedCreatorUsername = " "; }],
  ["unknown displayControls key", (value) => { value.displayControls.source.extra = true; }],
  ["unknown response result", (value) => { value.responses.chargerAndBatteries.battery.result = "not_relevant"; }]
];

test("(c) malformed, legacy-shaped or foreign Wet Chemical payloads fail closed", () => {
  let rejected = 0;
  for (const source of [payloads.wetChemicalV7, payloads.wetChemicalV4]) {
    for (const [name, mutate] of rejections) {
      const value = clone(source); mutate(value);
      assert.equal(parse(value), undefined, `V${(source.template as { version: number }).version}: ${name} must be rejected`);
      rejected++;
    }
  }
  assert.equal(rejected, rejections.length * 2);
  const withCreators = clone(payloads.wetChemicalV7); withCreators.deviceReportedCreatorUsername = "tech-a"; withCreators.verifiedOriginalCreatorUsername = "tech-a";
  assert.ok(parse(withCreators), "creator usernames may be text");
});

test("(d) a CO2 payload is rejected by the Wet Chemical parser and vice versa", () => {
  const co2 = payloads.co2V7, wet = payloads.wetChemicalV7;
  assert.ok(parseServerCo2Detail(co2, co2.clientUuid), "real CO2 route payload parses as CO2");
  assert.equal(parse(co2), undefined, "CO2 payload rejected by the Wet Chemical parser");
  assert.equal(parseServerCo2Detail(wet, wet.clientUuid), undefined, "Wet Chemical V7 payload rejected by the CO2 parser");
  assert.equal(parseServerCo2Detail(payloads.wetChemicalV4, payloads.wetChemicalV4.clientUuid), undefined, "Wet Chemical V4 payload rejected by the CO2 parser");
  const relabelled = clone(co2); relabelled.systemKey = "wet_chemical"; relabelled.systemLabel = "Wet Chemical System";
  assert.equal(parse(relabelled), undefined, "CO2 body relabelled as Wet Chemical is still rejected (frozen controls are CO2)");
});
