import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { masterServiceReportV1 } from "../../api/src/inspections/templates/masterServiceReportV1";
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
  assert.deepEqual(web.sectionRemarkSystemKeys, ["automatic_sprinkler"], "Phase 1 pilot is Automatic Sprinkler only");
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

test("no other system's form opts in to section remarks in Phase 1", () => {
  const roots = new URL("../src/", import.meta.url);
  const offenders: string[] = [];
  const walk = (directory: URL) => {
    for (const name of readdirSync(directory)) {
      const target = new URL(name + (statSync(new URL(name, directory)).isDirectory() ? "/" : ""), directory);
      if (statSync(target).isDirectory()) { walk(target); continue; }
      if (!/\.tsx$/.test(name) || name === "RemarksField.tsx" || name === "AutomaticSprinklerInspectionForm.tsx") continue;
      const elements = readFileSync(target, "utf8").match(/<RemarksField\b[\s\S]*?\/>/g) ?? [];
      if (elements.some((element) => /\b(sectionKey|customerId)=/.test(element))) offenders.push(join(directory.pathname, name));
    }
  };
  walk(roots);
  assert.deepEqual(offenders, []);
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
  assert.match(database, /\| "commonRemark" \| "sectionRemark" \| "technicianCustomer"/, "sectionRemark is a type-only addition to the outbox entityType union");
  assert.equal((database.match(/\.version\(/g) ?? []).length, (database.match(/\.stores\(/g) ?? []).length);
  assert.doesNotMatch(database, /sectionRemarks?\s*:/, "no new object store or index for section remarks");
});
