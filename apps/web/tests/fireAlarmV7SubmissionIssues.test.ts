import assert from "node:assert/strict";
import test from "node:test";
import { v7FireAlarmSubmissionIssues } from "../src/fireAlarm/fireAlarmV7Evidence";
import type { FireAlarmResponses } from "../src/fireAlarm/fireAlarmTypes";
import { validCanonicalV7DeviceStates } from "../../api/src/sync/fireAlarmV7Acceptance";

// The client submit gate must refuse anything the server's V7 acceptance validator
// (apps/api/src/sync/fireAlarmV7Acceptance.ts `validResponses`) would reject.  A gap
// here is not cosmetic: the form queues the submission, the technician sees
// "Submitted - waiting to sync", and the server then fails it non-retryably.

const checkGroup = (keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: "" }]));

const primaryRow = (overrides: Record<string, unknown> = {}) => ({
  rowUuid: crypto.randomUUID(),
  source: "technician",
  configuredLocationId: null,
  configuredRowOrdinal: null,
  zoneSnapshot: null,
  locationSnapshot: null,
  displaySequence: 1,
  assetReference: "",
  alarmZone: "Zone 1",
  location: "Level 1 Lobby",
  manualCallPoint: ["normal"],
  flowSwitch: ["normal"],
  heatDetector: ["normal"],
  smokeDetector: ["normal"],
  remarks: "",
  ...overrides
});

function responses(overrides: Record<string, unknown> = {}): FireAlarmResponses {
  return {
    schemaVersion: 2,
    controlPanelLocation: "Main Panel Room",
    primaryDeviceRows: [primaryRow()],
    chargerAndBatteries: checkGroup(["main_supply", "battery", "charger"]),
    mainFunctionKeys: checkGroup([
      "main_alarm_reset", "lamp_test", "evacuate", "ac_supply",
      "dc_supply", "spka_system", "alarm_lift_trip", "signal_gas_discharge"
    ]),
    secondaryAlarmDeviceRows: [],
    comments: "",
    ...overrides
  } as unknown as FireAlarmResponses;
}

test("a complete V7 Fire Alarm draft raises no submission issues", () => {
  assert.deepEqual(v7FireAlarmSubmissionIssues(responses(), []), []);
});

test("zero primary device rows is refused before it can reach the server", () => {
  const issues = v7FireAlarmSubmissionIssues(responses({ primaryDeviceRows: [] }), []);
  assert.ok(
    issues.some((issue) => /At least one primary detector\/device row is required/.test(issue)),
    `expected a primary-row issue, got ${JSON.stringify(issues)}`
  );
});

test("a blank Control Panel Location is refused", () => {
  const issues = v7FireAlarmSubmissionIssues(responses({ controlPanelLocation: "   " }), []);
  assert.ok(issues.some((issue) => /Control Panel Location is required/.test(issue)));
});

test("an incomplete primary row is refused", () => {
  for (const override of [
    { alarmZone: "  " },
    { location: "" },
    { heatDetector: null },
    { smokeDetector: ["unknown"] }
  ]) {
    const issues = v7FireAlarmSubmissionIssues(
      responses({ primaryDeviceRows: [primaryRow(override)] }), []
    );
    assert.ok(
      issues.some((issue) => /Primary row 1 requires/.test(issue)),
      `expected a primary-row issue for ${JSON.stringify(override)}, got ${JSON.stringify(issues)}`
    );
  }
});

test("V7 rejects an empty, duplicated, or reordered detector state before enqueueing", () => {
  for (const value of [[], ["normal", "normal"], ["test", "normal"]]) {
    const issues = v7FireAlarmSubmissionIssues(responses({ primaryDeviceRows: [primaryRow({ heatDetector: value })] }), []);
    assert.ok(issues.some((issue) => /at least one Normal\/Test\/Isolation tick/.test(issue)), JSON.stringify(issues));
  }
});

test("every client-accepted detector-state combination is accepted by the server contract", () => {
  const states = ["normal", "test", "isolation"];
  for (let mask = 1; mask < 8; mask += 1) {
    const value = states.filter((_, index) => (mask & (1 << index)) !== 0);
    const draft = responses({ primaryDeviceRows: [primaryRow({ manualCallPoint: value, flowSwitch: value, heatDetector: value, smokeDetector: value })] });
    assert.deepEqual(v7FireAlarmSubmissionIssues(draft, []), [], `client rejects ${JSON.stringify(value)}`);
    assert.equal(validCanonicalV7DeviceStates(value), true, `server rejects ${JSON.stringify(value)}`);
  }
});

const attachment = (fieldPath: string, sha256: string) => ({
  photoUuid: crypto.randomUUID(), fieldPath, sha256, protocolVersion: 7
} as unknown as Parameters<typeof v7FireAlarmSubmissionIssues>[1][number]);

const twoFindings = () => responses({
  chargerAndBatteries: {
    main_supply: { result: "not_good", remarks: "Supply low" },
    battery: { result: "good", remarks: "" },
    charger: { result: "na", remarks: "" }
  },
  mainFunctionKeys: {
    main_alarm_reset: { result: "complete_repair", remarks: "Reset board replaced" },
    lamp_test: { result: "good", remarks: "" }, evacuate: { result: "good", remarks: "" },
    ac_supply: { result: "good", remarks: "" }, dc_supply: { result: "good", remarks: "" },
    spka_system: { result: "good", remarks: "" }, alarm_lift_trip: { result: "good", remarks: "" },
    signal_gas_discharge: { result: "good", remarks: "" }
  }
});

// G7: the owner attached one photo to two findings.  The server refuses that
// manifest, so without this gate the form queues work that can never be accepted
// — offline, that is unrecoverable field data loss.
test("one photo reused across two findings is refused before it can be queued", () => {
  const issues = v7FireAlarmSubmissionIssues(twoFindings(), [
    attachment("charger_batteries.charger_battery_checks.main_supply", "same-bytes"),
    attachment("main_function_key.function_checks.main_alarm_reset", "same-bytes")
  ]);
  assert.ok(
    issues.some((issue) => /use the same photo; each finding needs its own photo/.test(issue)),
    `expected a duplicate-photo issue, got ${JSON.stringify(issues)}`
  );
});

test("distinct photos on two findings raise no issue", () => {
  assert.deepEqual(v7FireAlarmSubmissionIssues(twoFindings(), [
    attachment("charger_batteries.charger_battery_checks.main_supply", "bytes-a"),
    attachment("main_function_key.function_checks.main_alarm_reset", "bytes-b")
  ]), []);
});

test("a photo left over on a field that is no longer a finding does not count as a duplicate", () => {
  const draft = responses({
    chargerAndBatteries: {
      main_supply: { result: "not_good", remarks: "Supply low" },
      battery: { result: "good", remarks: "" },
      charger: { result: "good", remarks: "" }
    }
  });
  assert.deepEqual(v7FireAlarmSubmissionIssues(draft, [
    attachment("charger_batteries.charger_battery_checks.main_supply", "bytes-a"),
    attachment("charger_batteries.charger_battery_checks.battery", "bytes-a")
  ]), []);
});

test("each V7 finding state requires its own remark and photo", () => {
  const poor = v7FireAlarmSubmissionIssues(
    responses({ chargerAndBatteries: {
      main_supply: { result: "not_good", remarks: "" },
      battery: { result: "good", remarks: "" },
      charger: { result: "good", remarks: "" }
    } }), []
  );
  assert.ok(poor.some((issue) => /requires its own Remark/.test(issue)));
  assert.ok(poor.some((issue) => /requires its own Photo/.test(issue)));
});
