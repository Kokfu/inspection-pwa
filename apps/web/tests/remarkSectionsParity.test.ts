import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { masterServiceReportV1 } from "../../api/src/inspections/templates/masterServiceReportV1";
import { masterServiceReportV2 } from "../../api/src/inspections/templates/masterServiceReportV2";
import { masterServiceReportV3 } from "../../api/src/inspections/templates/masterServiceReportV3";
import { masterServiceReportV4 } from "../../api/src/inspections/templates/masterServiceReportV4";
import { masterServiceReportV5 } from "../../api/src/inspections/templates/masterServiceReportV5";
import { masterServiceReportV6 } from "../../api/src/inspections/templates/masterServiceReportV6";
import { resolveHoseReelControls } from "../../api/src/inspections/templates/definitionControls";
import { resolveFm200Controls } from "../../api/src/inspections/templates/fm200DefinitionControls";
import { resolveCo2Controls } from "../../api/src/inspections/templates/co2DefinitionControls";
import { resolveFireAlarmControls } from "../../api/src/inspections/templates/fireAlarmDefinitionControls";
import { masterServiceReportV7 } from "../../api/src/inspections/templates/masterServiceReportV7";
import { resolveAutomaticSprinklerControls } from "../../api/src/inspections/templates/automaticSprinklerDefinitionControls";
import { collectResolvedLabelPaths } from "../../api/src/inspections/labelOverrides";
import * as api from "../../api/src/inspections/remarkSections";
import * as web from "../src/inspectionControls/remarkSections";

/**
 * CR-07: the section-key allowlist exists twice (API authority + browser, which needs it offline). The copies are
 * byte-identical, and the keys are not invented: every checklist / measurement key is a label-override canonical
 * path of the REAL resolved Automatic Sprinkler controls, so a template change that adds or renames a row fails here
 * instead of silently leaving a row without a section.
 */
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("the web and API allowlist modules are byte-identical and export the same values", () => {
  assert.equal(read("../src/inspectionControls/remarkSections.ts"), read("../../api/src/inspections/remarkSections.ts"));
  assert.deepEqual(web.sectionRemarkKeysFor("automatic_sprinkler"), api.sectionRemarkKeysFor("automatic_sprinkler"));
  assert.deepEqual(web.sectionRemarkSystemKeys, api.sectionRemarkSystemKeys);
  assert.deepEqual(web.sectionRemarkSystemKeys, ["automatic_sprinkler", "hose_reel", "hydrant", "fire_alarm_detector", "fm200_fire_suppression", "co2_fire_extinguisher"],
    "R4: Automatic Sprinkler plus Hose Reel, Hydrant, Fire Alarm, FM200 and CO2 (the five plain-text services are not listed)");
  for (const systemKey of web.sectionRemarkSystemKeys) assert.deepEqual(web.sectionRemarkKeysFor(systemKey), api.sectionRemarkKeysFor(systemKey), systemKey);
});

const sprinkler = (template: typeof masterServiceReportV7) => template.systems.find((system) => system.key === "automatic_sprinkler");

test("the allowlist equals the label-override canonical paths of the real resolved Sprinkler controls plus the Comments slot", () => {
  const rowPaths = (version: 1 | 7) => collectResolvedLabelPaths(resolveAutomaticSprinklerControls(
    version === 7 ? sprinkler(masterServiceReportV7) : sprinkler(masterServiceReportV1), "MFE-FSSR", version
  )).map((entry) => entry.path).filter((path) => /^checklist\.[^.]+\.[^.]+$/.test(path) || /^measurements\.[^.]+$/.test(path));
  const v7 = rowPaths(7);
  const v1 = rowPaths(1);
  assert.equal(v7.length, 23, "18 checklist rows + 5 measurement rows");
  assert.deepEqual([...web.sectionRemarkKeysFor("automatic_sprinkler")].sort(), [...v7, web.commentsSectionKey].sort());
  assert.ok(v1.every((path) => v7.includes(path)), "every historical (V1-V6) row key is covered by the allowlist");
  assert.equal(new Set(v7).size, v7.length);
});

test("every V7 and V1 Sprinkler layout row maps through the shared helpers to an allowlisted key", () => {
  for (const version of [7, 1] as const) {
    const controls = resolveAutomaticSprinklerControls(version === 7 ? sprinkler(masterServiceReportV7) : sprinkler(masterServiceReportV1), "MFE-FSSR", version);
    const sections = (Object.keys(controls.layout) as Array<keyof typeof controls.layout>).filter((section) => controls.layout[section] !== undefined);
    let rows = 0;
    for (const section of sections) {
      for (const row of controls.layout[section] ?? []) {
        const key = row.kind === "measurement" ? web.measurementRemarkSectionKey(row.key) : web.checklistRemarkSectionKey(section as web.SprinklerChecklistSection, row.key);
        assert.ok(web.isSectionRemarkKey("automatic_sprinkler", key), `V${version} ${section}.${row.key} -> ${key}`);
        assert.ok(api.isSectionRemarkKey("automatic_sprinkler", key));
        rows += 1;
      }
    }
    assert.ok(rows >= 20);
  }
});

test("unknown systems and keys are not allowlisted", () => {
  for (const check of [web.isSectionRemarkKey, api.isSectionRemarkKey]) {
    assert.equal(check("hose_reel", "comments"), false);
    assert.equal(check("automatic_sprinkler", "checklist.waterTank.nope"), false);
    assert.equal(check("automatic_sprinkler", "checklist.waterTank"), false);
    assert.equal(check("automatic_sprinkler", "measurements.jockey_pump_pressure.values.cut_in"), false);
    assert.equal(check("automatic_sprinkler", "comments "), false);
    assert.equal(check("automatic_sprinkler", undefined), false);
    assert.equal(check(undefined, "comments"), false);
  }
});

function formSource() { return read("../src/automaticSprinkler/AutomaticSprinklerInspectionForm.tsx"); }

test("every RemarksField site in the Automatic Sprinkler form carries a customer and an allowlisted section key", () => {
  const source = formSource();
  const elements = source.match(/<RemarksField[\s\S]*?\/>/g) ?? [];
  assert.equal(elements.length, 3, "checklist row, measurement row and Comments are the only remark sites");
  const keys = elements.map((element) => /sectionKey=\{([^}]+\(?[^}]*\)?)\}/.exec(element)?.[1] ?? "");
  assert.ok(keys.every(Boolean), "each site has a sectionKey");
  assert.deepEqual(keys.map((key) => key.replace(/\(.*$/, "")), ["checklistRemarkSectionKey", "measurementRemarkSectionKey", "commentsSectionKey"]);
  for (const element of elements) {
    assert.match(element, /customerId=\{remarkCustomerId\}/);
    assert.match(element, /systemKey="automatic_sprinkler"/);
  }
  assert.match(source, /const remarkCustomerId = record\.inspectionSnapshot\.customer\.id;/);
});

const r4Forms = {
  hose_reel: "../src/hoseReel/HoseReelInspectionForm.tsx", hydrant: "../src/hydrant/HydrantInspectionForm.tsx",
  fire_alarm_detector: "../src/fireAlarm/FireAlarmInspectionForm.tsx", fm200_fire_suppression: "../src/fm200/Fm200InspectionForm.tsx",
  co2_fire_extinguisher: "../src/co2/Co2InspectionForm.tsx"
} as const;
const plainTextForms = [
  "../src/dryWetRiser/DryWetRiserInspectionForm.tsx", "../src/smokeVentilation/SmokeVentilationInspectionForm.tsx",
  "../src/fireIntercom/FireIntercomInspectionForm.tsx", "../src/fireRatedRollerShutter/FireRatedRollerShutterInspectionForm.tsx"
];

test("R4: only the six allowlisted services' forms opt in to section remarks; the plain-text services do not", () => {
  const roots = new URL("../src/", import.meta.url);
  const allowed = new Set(["RemarksField.tsx", "AutomaticSprinklerInspectionForm.tsx", ...Object.values(r4Forms).map((path) => path.split("/").pop()!)]);
  const offenders: string[] = [];
  const walk = (directory: URL) => {
    for (const name of readdirSync(directory)) {
      const target = new URL(name + (statSync(new URL(name, directory)).isDirectory() ? "/" : ""), directory);
      if (statSync(target).isDirectory()) { walk(target); continue; }
      if (!/\.tsx$/.test(name) || allowed.has(name)) continue;
      const elements = readFileSync(target, "utf8").match(/<RemarksField\b[\s\S]*?\/>/g) ?? [];
      if (elements.some((element) => /\b(sectionKey|customerId)=/.test(element))) offenders.push(join(directory.pathname, name));
    }
  };
  walk(roots);
  assert.deepEqual(offenders, []);
  for (const path of plainTextForms) assert.doesNotMatch(read(path), /<RemarksField[^>]*systemKey=/, path);
});

test("R4: every row-level RemarksField site of the five forms carries customer, visit and a section key; Comments boxes carry none", () => {
  const expectedSites: Record<keyof typeof r4Forms, { scoped: number; comments: number }> = {
    hose_reel: { scoped: 7, comments: 1 }, hydrant: { scoped: 2, comments: 1 }, fire_alarm_detector: { scoped: 5, comments: 1 },
    fm200_fire_suppression: { scoped: 2, comments: 1 }, co2_fire_extinguisher: { scoped: 2, comments: 1 }
  };
  for (const [systemKey, path] of Object.entries(r4Forms) as Array<[keyof typeof r4Forms, string]>) {
    const source = read(path);
    const elements = source.match(/<RemarksField\b[\s\S]*?\/>/g) ?? [];
    const scoped = elements.filter((element) => /\bsectionKey=/.test(element));
    const comments = elements.filter((element) => !/\bsectionKey=/.test(element));
    assert.equal(scoped.length, expectedSites[systemKey].scoped, `${systemKey}: row-level sites`);
    assert.equal(comments.length, expectedSites[systemKey].comments, `${systemKey}: Comments boxes`);
    for (const element of scoped) {
      assert.match(element, /customerId=\{remarkCustomerId\}/, systemKey);
      assert.match(element, /jobId=\{record\.jobId\}/, systemKey);
      assert.match(element, /sectionLabel=/, systemKey);
      assert.ok(systemKey === "co2_fire_extinguisher" ? /systemKey=\{record\.systemKey === "co2_fire_extinguisher"/.test(element) : element.includes(`systemKey="${systemKey}"`), `${systemKey} site names its own system`);
    }
    for (const element of comments) assert.match(element, /label=(\{visibleLabels\.comments\}|"Comments")/, `${systemKey}: the unscoped box is Comments`);
    assert.match(source, /const remarkCustomerId = record\.inspectionSnapshot\.customer\.id;/, systemKey);
    assert.match(source, /<RemarkRequestStatus customerId=\{remarkCustomerId\} systemKey="(hose_reel|hydrant|fire_alarm_detector|fm200_fire_suppression|co2_fire_extinguisher)"/, `${systemKey}: technician read-back`);
  }
});

test("R4: the allowlists equal the real template slots (union over every template version that has the system), one key per slot", () => {
  const templates = [masterServiceReportV1, masterServiceReportV2, masterServiceReportV3, masterServiceReportV4, masterServiceReportV5, masterServiceReportV6, masterServiceReportV7];
  const union = new Map<string, Set<string>>();
  const add = (name: string, key: string) => { if (!union.has(name)) union.set(name, new Set()); union.get(name)!.add(key); };
  const attempt = (action: () => void) => { try { action(); } catch { /* the system is not defined (or not resolvable) in this template version */ } };
  for (const template of templates) {
    const system = (key: string) => template.systems.find((candidate) => candidate.key === key);
    attempt(() => {
      const controls = resolveHoseReelControls(system("hose_reel"), "MFE-FSSR", template.version);
      controls.checklist.waterTank.forEach((item) => add("hose.waterTank", item.key));
      controls.checklist.pumpHouse.forEach((item) => add("hose.pumpHouse", item.key));
      (controls.checklist.testRunFirePump ?? []).forEach((item) => add("hose.testRun", item.key));
      controls.measurements.forEach((item) => add("hose.measurements", item.key));
      controls.repeatableRows.resultColumns.forEach((item) => add("hose.columns", item.key));
    });
    for (const [name, resolve, systemKey] of [["fm200", resolveFm200Controls, "fm200_fire_suppression"], ["co2", resolveCo2Controls, "co2_fire_extinguisher"]] as const) {
      attempt(() => {
        const controls = resolve(system(systemKey), "MFE-FSSR", template.version);
        for (const group of ["chargerAndBatteries", "physicalOutlook", "mainFunctionKeys"] as const) controls[group].forEach((item) => add(`${name}.${group}`, item.key));
      });
    }
    attempt(() => {
      const controls = resolveFireAlarmControls(system("fire_alarm_detector"), "MFE-FSSR", template.version);
      controls.chargerAndBatteries.forEach((item) => add("fa.chargerAndBatteries", item.key));
      controls.mainFunctionKeys.forEach((item) => add("fa.mainFunctionKeys", item.key));
    });
    const hydrant = system("hydrant") as { sections: Array<{ blocks: Array<{ key: string; columns?: Array<{ key: string }> }> }> } | undefined;
    for (const section of hydrant?.sections ?? []) for (const block of section.blocks) {
      if (block.key === "hydrant_rows") for (const column of block.columns ?? []) add("hydrant.columns", column.key);
    }
  }
  const sorted = (name: string) => [...(union.get(name) ?? [])].sort();
  assert.deepEqual([...web.hoseReelRemarkRows.checklistWaterTank].sort(), sorted("hose.waterTank"));
  assert.deepEqual([...web.hoseReelRemarkRows.checklistPumpHouse].sort(), sorted("hose.pumpHouse"));
  assert.deepEqual([...web.hoseReelRemarkRows.checklistTestRunFirePump].sort(), sorted("hose.testRun"));
  assert.deepEqual([...web.hoseReelRemarkRows.measurements].sort(), sorted("hose.measurements"));
  assert.deepEqual([...web.hoseReelRemarkRows.rowColumns].sort(), sorted("hose.columns"));
  assert.deepEqual([...web.hydrantRemarkColumns].sort(), sorted("hydrant.columns").filter((key) => !["asset_reference", "location", "remarks"].includes(key)));
  assert.deepEqual([...web.fireAlarmRemarkRows.chargerAndBatteries].sort(), sorted("fa.chargerAndBatteries"));
  assert.deepEqual([...web.fireAlarmRemarkRows.mainFunctionKeys].sort(), sorted("fa.mainFunctionKeys"));
  for (const name of ["fm200", "co2"]) for (const group of ["chargerAndBatteries", "physicalOutlook", "mainFunctionKeys"] as const) {
    assert.deepEqual([...web.suppressionRemarkRows[group]].sort(), sorted(`${name}.${group}`), `${name}.${group}`);
  }
  for (const systemKey of web.sectionRemarkSystemKeys) {
    const keys = web.sectionRemarkKeysFor(systemKey);
    assert.equal(new Set(keys).size, keys.length, `${systemKey}: no duplicate key`);
    if (systemKey !== "automatic_sprinkler") assert.ok(!keys.includes("comments"), `${systemKey}: the Comments box is not a section`);
  }
  assert.equal(web.sectionRemarkKeysFor("fm200_fire_suppression").length, 20);
  assert.deepEqual(web.sectionRemarkKeysFor("fm200_fire_suppression"), web.sectionRemarkKeysFor("co2_fire_extinguisher"));
});

test("the generic /api/sync loop excludes sectionRemark outbox items", () => {
  const engine = read("../src/sync/syncEngine.ts");
  const filter = /\.filter\(\(item\) =>(?:(?!\.filter)[\s\S])*?item\.entityType !== "inspectionAttachment"[\s\S]*?shouldSync\(item\)/.exec(engine)?.[0] ?? "";
  assert.match(filter, /item\.entityType !== "sectionRemark"/, "sectionRemark must be excluded or the generic loop would POST it to /api/sync");
  assert.match(filter, /item\.entityType !== "commonRemark"/);
  assert.match(engine, /await syncPendingSectionRemarks\(\)/);
});

test("the Dexie schema declarations did not change for CR-07", () => {
  const database = read("../src/db/localDatabase.ts");
  // R3 added "remarkRequest" to the same union (type-only, still no store/index/version): see the test below.
  assert.match(database, /\| "commonRemark" \| "sectionRemark" \| "remarkRequest" \| "technicianCustomer"/, "sectionRemark is a type-only addition to the outbox entityType union");
  assert.equal((database.match(/\.version\(/g) ?? []).length, (database.match(/\.stores\(/g) ?? []).length);
  assert.doesNotMatch(database, /sectionRemarks?\s*:/, "no new object store or index for section remarks");
});

test("R3: remarkRequest is a type-only outbox entityType, excluded from the generic /api/sync loop, with no new store or schema version", () => {
  const database = read("../src/db/localDatabase.ts");
  const engine = read("../src/sync/syncEngine.ts");
  assert.match(database, /"sectionRemark" \| "remarkRequest" \| "technicianCustomer"/);
  assert.equal((database.match(/\.version\(/g) ?? []).length, (database.match(/\.stores\(/g) ?? []).length);
  assert.doesNotMatch(database, /remarkRequests?\s*:/, "no new object store or index for remark requests");
  const filter = /\.filter\(\(item\) =>(?:(?!\.filter)[\s\S])*?item\.entityType !== "inspectionAttachment"[\s\S]*?shouldSync\(item\)/.exec(engine)?.[0] ?? "";
  assert.match(filter, /item\.entityType !== "remarkRequest"/, "remarkRequest must be excluded or the generic loop would POST it to /api/sync");
  assert.match(engine, /await syncPendingRemarkRequests\(syncActorId\)/);
});
