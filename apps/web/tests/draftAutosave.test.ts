import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DraftAutosaver, type DraftAutosaveStatus } from "../src/inspectionControls/draftAutosave.js";

/**
 * I-04: typed-but-unsaved form text was lost on navigation or a discarded tab, because a Draft was only written by the
 * Save Draft button. These tests pin the autosave rules independent of any single form.
 */

type Values = { remarks: string };

function setup(initial: Values, opts: { enabled?: boolean; failSave?: () => boolean; gate?: () => Promise<void>; echoOf?: (value: Values) => Values } = {}) {
  const state = { value: initial, enabled: opts.enabled ?? true };
  const saved: Values[] = [];
  const statuses: DraftAutosaveStatus[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const saver = new DraftAutosaver<Values>({
    delayMs: 1500,
    getLatest: () => ({ value: state.value, enabled: state.enabled }),
    save: async (value) => {
      await opts.gate?.();
      if (opts.failSave?.()) throw new Error("This record changed elsewhere");
      saved.push(value);
    },
    echoOf: opts.echoOf,
    onStatus: (status) => statuses.push(status),
    setTimer: (callback) => { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimer: (handle) => { timers.delete(handle as number); }
  });
  const type = (remarks: string) => { saver.noteUserEvent(); state.value = { remarks }; saver.valueChanged(); };
  const fire = async () => { const due = [...timers.values()]; timers.clear(); due.forEach((cb) => cb()); await new Promise((r) => setTimeout(r, 0)); };
  return { saver, state, saved, statuses, timers, type, fire };
}

test("opening a Draft and not touching it never writes", async () => {
  const t = setup({ remarks: "a" });
  t.saver.valueChanged();
  assert.equal(t.timers.size, 0);
  await t.saver.flush();
  assert.deepEqual(t.saved, []);
});

test("typing schedules one debounced save of the latest value; each keystroke restarts the wait", async () => {
  const t = setup({ remarks: "" });
  t.type("a"); t.type("ab"); t.type("abc");
  assert.equal(t.timers.size, 1, "one pending timer, not three");
  await t.fire();
  assert.deepEqual(t.saved, [{ remarks: "abc" }]);
  assert.equal(t.saver.isDirty(), false);
  assert.equal(t.statuses.at(-1), "saved");
});

test("flush (tab hidden, leaving the form) saves immediately without waiting for the timer", async () => {
  const t = setup({ remarks: "" });
  t.type("Pump room door sticks");
  await t.saver.flush();
  assert.deepEqual(t.saved, [{ remarks: "Pump room door sticks" }]);
  assert.equal(t.timers.size, 0, "pending timer cleared");
  await t.saver.flush();
  assert.equal(t.saved.length, 1, "a second flush with nothing new is a no-op");
});

test("typing that is reverted to the original is not dirty and is not saved", async () => {
  const t = setup({ remarks: "x" });
  t.type("xy"); t.type("x");
  assert.equal(t.saver.isDirty(), false);
  await t.saver.flush();
  assert.deepEqual(t.saved, []);
});

test("a read-only (Pending/Synced) record is never autosaved", async () => {
  const t = setup({ remarks: "x" }, { enabled: false });
  t.type("changed");
  assert.equal(t.saver.isDirty(), false);
  await t.saver.flush();
  assert.deepEqual(t.saved, []);
});

test("saves are serialised: text typed during a save is saved afterwards, never concurrently", async () => {
  let release: () => void = () => undefined;
  let concurrent = 0, maxConcurrent = 0, calls = 0;
  const t = setup({ remarks: "" }, {
    gate: async () => {
      concurrent += 1; maxConcurrent = Math.max(maxConcurrent, concurrent); calls += 1;
      if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
      concurrent -= 1;
    }
  });
  t.type("first");
  const firstFlush = t.saver.flush();
  await new Promise((r) => setTimeout(r, 0));
  t.type("first and more");
  const secondFlush = t.saver.flush();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 1, "second flush waits for the first");
  release();
  await Promise.all([firstFlush, secondFlush]);
  assert.equal(maxConcurrent, 1);
  assert.deepEqual(t.saved.map((v) => v.remarks), ["first", "first and more"]);
  assert.equal(t.saver.isDirty(), false);
});

test("a failed save keeps the form dirty (leave warning stays) and the next flush retries", async () => {
  let fail = true;
  const t = setup({ remarks: "" }, { failSave: () => fail });
  t.type("important");
  await t.saver.flush();
  assert.equal(t.statuses.at(-1), "error");
  assert.equal(t.saver.isDirty(), true, "still unsaved -> beforeunload keeps warning");
  assert.deepEqual(t.saved, []);
  fail = false;
  await t.saver.flush();
  assert.deepEqual(t.saved, [{ remarks: "important" }]);
  assert.equal(t.saver.isDirty(), false);
});

test("echo of our own save keeps text typed while the save ran; an outside change resets the baseline", async () => {
  const t = setup({ remarks: "" });
  t.type("abc");
  await t.saver.flush(); // saved "abc"
  // user keeps typing before the record echo arrives
  t.state.value = { remarks: "abcdef" };
  let restored: Values | undefined;
  t.saver.recordChanged({ remarks: "abc" }, { remarks: "abcdef" }, (value) => { restored = value; });
  assert.deepEqual(restored, { remarks: "abcdef" }, "newer typing is put back after the form's reset effect");

  // an unrelated record (e.g. other device/refresh) is not ours: nothing restored, not dirty afterwards
  restored = undefined;
  t.saver.recordChanged({ remarks: "server version" }, { remarks: "abcdef" }, (value) => { restored = value; });
  assert.equal(restored, undefined);
  t.state.value = { remarks: "server version" };
  assert.equal(t.saver.isDirty(), false, "no baseline until the next interaction");
});

test("I-18: when the saved copy is canonicalised, its echo is still recognised as our own and newer typing is kept", async () => {
  // Stands in for the pre-V6 Fire Alarm template, whose Save Draft stores a canonical copy of what was typed.
  const canonical = (value: Values): Values => ({ remarks: value.remarks.trim() });
  const t = setup({ remarks: "" }, { echoOf: canonical });
  t.type("abc ");
  await t.saver.flush(); // saves the typed value; the record that comes back is the canonical one
  t.state.value = { remarks: "abc def" }; // typed while the save was running
  let restored: Values | undefined;
  t.saver.recordChanged({ remarks: "abc" }, { remarks: "abc def" }, (value) => { restored = value; });
  assert.deepEqual(restored, { remarks: "abc def" }, "typing made during the save is put back");
  assert.equal(t.saver.isDirty(), true, "and is still saved next");
});

test("I-18: a canonical echo with nothing typed afterwards does not make the form dirty again", async () => {
  const canonical = (value: Values): Values => ({ remarks: value.remarks.trim() });
  const t = setup({ remarks: "" }, { echoOf: canonical });
  t.type("abc ");
  await t.saver.flush();
  t.state.value = { remarks: "abc" }; // the form's reset effect replaced the value with the canonical record
  t.saver.recordChanged({ remarks: "abc" }, { remarks: "abc " }, () => assert.fail("nothing to restore"));
  assert.equal(t.saver.isDirty(), false, "no endless re-save of the canonical copy");
});

test("every inspection form calls useDraftAutosave on its Draft; leaving the form flushes", () => {
  const forms = [
    "automaticSprinkler/AutomaticSprinklerInspectionForm.tsx", "co2/Co2InspectionForm.tsx", "dryWetRiser/DryWetRiserInspectionForm.tsx",
    "fireAlarm/FireAlarmInspectionForm.tsx", "fireIntercom/FireIntercomInspectionForm.tsx", "fireRatedRollerShutter/FireRatedRollerShutterInspectionForm.tsx",
    "fm200/Fm200InspectionForm.tsx", "hoseReel/HoseReelInspectionForm.tsx", "hydrant/HydrantInspectionForm.tsx",
    "portableFireExtinguisher/PortableFireExtinguisherForm.tsx", "smokeVentilation/SmokeVentilationInspectionForm.tsx"
  ];
  for (const form of forms) {
    const source = readFileSync(join(import.meta.dirname, "../src", form), "utf8");
    assert.match(source, /useDraftAutosave\(\{ ?record, responses, setResponses, save: /, form);
    assert.match(source, /enabled: ?record\.syncStatus ?=== ?"Draft"/, `${form} only autosaves Drafts`);
  }
  const hook = readFileSync(join(import.meta.dirname, "../src/inspectionControls/useDraftAutosave.ts"), "utf8");
  for (const needle of ["beforeunload", "pagehide", "visibilitychange", "void saver.flush()", "event.isTrusted"]) assert.ok(hook.includes(needle), needle);
});
