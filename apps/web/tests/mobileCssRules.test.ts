import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * I-25 (tap targets), I-26 (12 px text floor), I-27 (visible keyboard focus): rules from the mobile-first-ui skill,
 * pinned on the CSS source so a new raw 36 px button, a 10 px label or a faint focus ring is caught without a phone.
 */
const cssFiles = ["src/styles/app.css", "src/manager/managerServiceEditor.css"].map((path) => ({ path, text: readFileSync(join(process.cwd(), path), "utf8") }));

type Rule = { file: string; selector: string; body: string };
function rules(): Rule[] {
  const found: Rule[] = [];
  for (const { path, text } of cssFiles) {
    const source = text.replace(/\/\*[^]*?\*\//g, "");
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) found.push({ file: path, selector: match[1].trim().replace(/\s+/g, " "), body: match[2] });
  }
  return found;
}
const all = rules();
const decl = (body: string, property: string) => [...body.matchAll(new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

const interactive = /(^|[ ,>+~])(button|summary|a)(\b|\[|:|\.|,|$)|\[role="(tab|button)"\]|command|wording-label|-tab\b/;
/** Header buttons are sized by the I-06 block (min-height var(--tap)) declared last; the earlier compact rules are overridden. */
const overriddenHeader = /\.app-account button/;

test("I-25: no interactive element is given a fixed height under the 44 px tap size", () => {
  const offenders: string[] = [];
  for (const rule of all) {
    if (!interactive.test(rule.selector) || overriddenHeader.test(rule.selector)) continue;
    if (/::?(before|after)/.test(rule.selector)) continue;
    for (const property of ["min-height", "height"]) for (const value of decl(rule.body, property)) {
      const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
      if (px && Number(px[1]) < 44) offenders.push(`${rule.file}: ${rule.selector} { ${property}: ${value} }`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("I-25/I-26: the tap-size and 12 px text rules are not scoped away from Customer Configuration, Services or Final Report", () => {
  const scoped = all.filter((rule) => /:not\(:is\(\[aria-labelledby="/.test(rule.selector)
    && (decl(rule.body, "min-height").includes("var(--tap)") || decl(rule.body, "font-size").includes("var(--text-xs)")));
  assert.deepEqual(scoped.map((rule) => rule.selector.slice(0, 70)), []);
});

test("I-26: no text is smaller than the 12 px floor (icon glyph pseudo-elements excepted)", () => {
  const offenders: string[] = [];
  for (const rule of all) {
    if (/::?(before|after)/.test(rule.selector)) continue;
    for (const value of decl(rule.body, "font-size")) {
      const rem = /^(\d*\.?\d+)rem$/.exec(value), px = /^(\d*\.?\d+)px$/.exec(value);
      const size = rem ? Number(rem[1]) * 16 : px ? Number(px[1]) : undefined;
      if (size !== undefined && size < 12) offenders.push(`${rule.file}: ${rule.selector.slice(0, 60)} { font-size: ${value} }`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("I-27: the focus ring is solid enough for 3:1 and covers links, summary, tabs and role=button", () => {
  const app = cssFiles[0].text;
  const token = /--focus-outline:\s*([^;]+);/.exec(app)?.[1] ?? "";
  assert.ok(token && !/\/\s*\d+%/.test(token) && !/rgb\(31 135 146/.test(token), `--focus-outline must be an opaque colour, got "${token}"`);
  for (const css of cssFiles) assert.doesNotMatch(css.text, /outline:[^;]*rgb\(31 135 146 \/ \d+%\)/, `${css.path}: no translucent hard-coded focus outline`);
  const focusRules = all.filter((rule) => /:focus-visible/.test(rule.selector) && decl(rule.body, "outline").some((value) => /var\(--focus-outline\)/.test(value))).map((rule) => rule.selector).join(" ,, ");
  for (const needle of ["button:focus-visible", "a[href]:focus-visible", "summary:focus-visible", '[role="tab"]:focus-visible', '[role="button"]:focus-visible']) {
    assert.ok(focusRules.includes(needle), `${needle} uses var(--focus-outline)`);
  }
});

test("I-27: focus on the dark header and Menu bar is drawn in white, not dark-on-dark", () => {
  const dark = all.filter((rule) => /:focus-visible/.test(rule.selector) && /app-header|app-mobile-navigation/.test(rule.selector) && decl(rule.body, "outline-color").some((value) => /var\(--on-brand\)/.test(value)));
  assert.ok(dark.length >= 2, "header and mobile Menu have a white focus colour");
});

test("I-30: .job-card is border-box, so width:100% plus its padding cannot overflow a 360 px list item", () => {
  const boxes = all.filter((rule) => rule.selector === ".job-card" && decl(rule.body, "box-sizing").includes("border-box"));
  assert.ok(boxes.length >= 1, ".job-card sets box-sizing: border-box");
});

test("I-28: the compact header rules are phone-only; the desktop header rules are untouched", () => {
  const css = readFileSync(join(import.meta.dirname, "../src/styles/app.css"), "utf8");
  const block = css.slice(css.lastIndexOf("/* I-28"));
  assert.ok(block.length > 0, "I-28 block present");
  // every rule that rearranges the header lives inside a max-width media query
  const outside = block.replace(/@media \(max-width: \d+px\) \{[^]*?\n\}\n?/g, "");
  assert.doesNotMatch(outside, /\.app-header|\.brand-lockup|\.app-mobile-navigation|\.connection-state|\.app-build/);
  assert.match(block, /@media \(max-width: 767px\)/);
  // desktop declarations that existed before stay as they were
  assert.match(css, /\.app-header \{ grid-template-columns: minmax\(0, 1fr\) auto; align-items: center; gap: 18px;/);
  assert.match(css, /\.header-utilities \{ display: grid; justify-items: end; gap: 7px; \}/);
  // the phone block keeps 44 px targets (Menu summary has no vertical padding but still min-height --tap)
  assert.match(css, /\.app-mobile-navigation summary \{[^}]*min-height: var\(--tap\)/);
  assert.doesNotMatch(block, /min-height: \d+px/);
});
