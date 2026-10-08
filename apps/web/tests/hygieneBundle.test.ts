import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

/** I-29 hygiene bundle: static checks that each small fix stays in place. */
const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const css = read("src/styles/app.css");
const block = css.slice(css.lastIndexOf("/* I-29"));

test("I-29 (1): the viewport allows content under a notch and the shell pads for the safe area", () => {
  assert.match(read("index.html"), /<meta name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(block, /env\(safe-area-inset-top\)/);
});

test("I-29 (2): controls opt out of the double-tap-zoom delay", () => {
  assert.match(block, /button[^{]*\{ touch-action: manipulation; \}/);
});

test("I-29 (3): the Hydrant Type select has an accessible name", () => {
  assert.match(read("src/hydrant/HydrantInspectionForm.tsx"), /<legend>Hydrant Type<\/legend><select aria-label="Hydrant Type"/);
});

test("I-29 (4): headings do not skip a level on the Job page, Common Remarks and the service editor", () => {
  assert.match(read("src/jobs/TechnicianHome.tsx"), /<h2>\{selectedJob\.configurationSnapshot\.customer\.displayName\}<\/h2>/);
  assert.match(read("src/manager/ManagerCommonRemarks.tsx"), /<h3 className="common-remark-edit-title">Edit common remark<\/h3>/);
  assert.doesNotMatch(read("src/manager/ManagerCommonRemarks.tsx"), /<h4/);
  assert.match(read("src/manager/ManagerServiceEditor.tsx"), /<h3>\{section\.repeatable\.rowHeading\} 1 /);
  // the replaced level keeps its look
  assert.match(block, /\.job-context h2 \{ margin: 0; \}/);
  assert.match(block, /\.job-context-title h2 \{ font-size: clamp\(1\.45rem, 4vw, 2rem\)/);
  assert.match(read("src/manager/managerServiceEditor.css"), /\.manager-wording-sample-row > h3 \{ margin: 0; font-size: 1rem;/);
});

test("I-29 (5): photos in PhotoEvidenceField and ServerAutomaticSprinklerView declare width and height", () => {
  for (const path of ["src/attachments/PhotoEvidenceField.tsx", "src/automaticSprinkler/ServerAutomaticSprinklerView.tsx"]) {
    const images = read(path).match(/<img [^>]*>/g) ?? [];
    assert.ok(images.length >= 2, path);
    for (const image of images) assert.match(image, /width=\{\d+\} height=\{\d+\}/, `${path}: ${image}`);
  }
  assert.match(block, /\.photo-thumbnail img, \.photo-full-view img, \.accepted-evidence-photo \{ height: auto; \}/);
});

test("I-29 (6): customer, company and reminder inputs declare autocomplete and phone keyboards", () => {
  for (const path of ["src/jobs/TechnicianAddCustomer.tsx", "src/manager/ManagerAddCustomer.tsx"]) {
    const text = read(path);
    const inputs = (text.match(/<input [^>]*>/g) ?? []).filter((input) => !/type="checkbox"/.test(input));
    assert.equal(inputs.length, 7, path);
    for (const input of inputs) assert.match(input, /autoComplete="off"/, `${path}: ${input}`);
    assert.equal((text.match(/type="tel" inputMode="tel"/g) ?? []).length, 2, `${path}: telephone and fax`);
  }
  const profile = read("src/manager/ManagerCompanyProfile.tsx");
  assert.match(profile, /<input type=\{options\.type \?\? "text"\} autoComplete="off"/);
  assert.equal((profile.match(/type: "tel"/g) ?? []).length, 3);
  assert.match(read("src/manager/ManagerEmailReminders.tsx"), /type="email" name="email" autoComplete="off"/);
});

test("I-29 (7): loading and progress texts use the ellipsis character", () => {
  const offenders = sourceFiles(join(root, "src")).flatMap((path) => read(relative(root, path)).split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /[A-Za-z]\.\.\.["'`<]/.test(line) && !/\.\.\.[A-Za-z({[]/.test(line))
    .map(({ index }) => `${relative(root, path)}:${index + 1}`));
  assert.deepEqual(offenders, []);
});

test("I-29 (8): the bare fieldset inside the customer form card has no second border", () => {
  assert.match(block, /\.customer-form-card > fieldset:not\(\.manager-service-picker\) \{[^}]*border: 0;/);
});

test("I-29 (9): destructive buttons use the danger style and the disabled reason is linked", () => {
  const home = read("src/jobs/TechnicianHome.tsx");
  assert.match(home, /className="secondary-command danger-command" disabled=\{!canDeleteSelectedJob\} aria-describedby=\{canDeleteSelectedJob \? undefined : "delete-visit-unavailable-note"\}/);
  assert.match(home, /id="delete-visit-unavailable-note"/);
  assert.match(home, /className="secondary-command danger-command" disabled=\{!canArchiveSelectedJob\}/);
  assert.match(read("src/manager/ManagerFinalReportView.tsx"), /className="secondary-command danger-command" onClick=\{\(\) => setWithdrawing\(true\)\}>Withdraw approval/);
});
