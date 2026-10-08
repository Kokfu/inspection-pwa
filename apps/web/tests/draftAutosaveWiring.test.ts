import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * I-17 / I-18: every form that autosaves must submit through the hook's submit() (which waits for a running autosave),
 * never straight through its onSubmitLocal prop.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

const forms = sourceFiles(join(process.cwd(), "src")).filter((path) => readFileSync(path, "utf8").includes("useDraftAutosave({"));

test("the eleven autosaving forms are found", () => {
  assert.ok(forms.length >= 11, `found ${forms.length}`);
});

test("I-17: every autosaving form passes submit: onSubmitLocal and calls submitLocal(), never onSubmitLocal(responses)", () => {
  for (const path of forms) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /const \{ submit: submitLocal \} = useDraftAutosave\(\{[^]*?submit: onSubmitLocal,/, `${path}: hook gets the submit callback`);
    assert.match(source, /submitLocal\(\)/, `${path}: Submit goes through submitLocal()`);
    assert.doesNotMatch(source, /onSubmitLocal\(\s*responses/, `${path}: no direct onSubmitLocal(responses) call remains`);
  }
});
