import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as api from "../../api/src/inspections/sectionRemarkText";
import * as web from "../src/inspectionControls/sectionRemarkText";

/**
 * CR-07: the browser validates a typed remark offline with the same rules the server applies. The two modules are
 * byte-identical and, as a second guard, give the same answer over the same inputs.
 */
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const cp = (...codes: number[]) => String.fromCodePoint(...codes);

test("the web and API text modules are byte-identical", () => {
  assert.equal(read("../src/inspectionControls/sectionRemarkText.ts"), read("../../api/src/inspections/sectionRemarkText.ts"));
});

const accepted: Array<[string, string, string]> = [
  ["plain", "S.A.J main water supply valve", "S.A.J main water supply valve"],
  ["trims", "   padded   ", "padded"],
  ["collapses spaces", "a    b     c", "a b c"],
  ["no-break space collapses", `a${cp(0xa0, 0xa0)}b${cp(0x2003)}c`, "a b c"],
  ["NFC composes", `Cafe${cp(0x301)} au lait`, `Caf${cp(0xe9)} au lait`],
  ["exactly 3", "abc", "abc"],
  ["exactly 300", "z".repeat(300), "z".repeat(300)],
  ["300 emoji code points", cp(0x1f600).repeat(300), cp(0x1f600).repeat(300)],
  ["3 emoji", cp(0x1f600).repeat(3), cp(0x1f600).repeat(3)],
  ["unicode letters", "水箱需要维修", "水箱需要维修"]
];
const rejected: Array<[string, unknown, string]> = [
  ["newline", "a\nb", "CONTROL_CHARACTER"], ["carriage return", "a\rb", "CONTROL_CHARACTER"], ["tab", "a\tb", "CONTROL_CHARACTER"],
  ["NUL", "a\u0000b", "CONTROL_CHARACTER"], ["DEL", `a${cp(0x7f)}b`, "CONTROL_CHARACTER"], ["C1", `a${cp(0x85)}b`, "CONTROL_CHARACTER"],
  ["ZWSP", `a${cp(0x200b)}b`, "INVISIBLE_CHARACTER"], ["ZWNJ", `a${cp(0x200c)}b`, "INVISIBLE_CHARACTER"], ["ZWJ", `a${cp(0x200d)}b`, "INVISIBLE_CHARACTER"],
  ["LRM", `a${cp(0x200e)}b`, "INVISIBLE_CHARACTER"], ["RLM", `a${cp(0x200f)}b`, "INVISIBLE_CHARACTER"],
  ["LRE", `a${cp(0x202a)}b`, "INVISIBLE_CHARACTER"], ["RLE", `a${cp(0x202b)}b`, "INVISIBLE_CHARACTER"], ["PDF", `a${cp(0x202c)}b`, "INVISIBLE_CHARACTER"],
  ["LRO", `a${cp(0x202d)}b`, "INVISIBLE_CHARACTER"], ["RLO", `a${cp(0x202e)}b`, "INVISIBLE_CHARACTER"],
  ["LRI", `a${cp(0x2066)}b`, "INVISIBLE_CHARACTER"], ["RLI", `a${cp(0x2067)}b`, "INVISIBLE_CHARACTER"], ["FSI", `a${cp(0x2068)}b`, "INVISIBLE_CHARACTER"], ["PDI", `a${cp(0x2069)}b`, "INVISIBLE_CHARACTER"],
  ["word joiner", `a${cp(0x2060)}b`, "INVISIBLE_CHARACTER"], ["BOM", `a${cp(0xfeff)}b`, "INVISIBLE_CHARACTER"],
  ["lone high surrogate", `a${String.fromCharCode(0xd800)}b`, "INVISIBLE_CHARACTER"], ["lone low surrogate", `a${String.fromCharCode(0xdc00)}b`, "INVISIBLE_CHARACTER"],
  ["2 chars", "ab", "TOO_SHORT"], ["empty", "", "TOO_SHORT"], ["spaces only", "      ", "TOO_SHORT"], ["2 emoji", cp(0x1f600).repeat(2), "TOO_SHORT"],
  ["301", "z".repeat(301), "TOO_LONG"], ["301 emoji", cp(0x1f600).repeat(301), "TOO_LONG"],
  ["number", 12345, "NOT_TEXT"], ["null", null, "NOT_TEXT"], ["undefined", undefined, "NOT_TEXT"], ["object", { wording: "abc" }, "NOT_TEXT"], ["array", ["abc"], "NOT_TEXT"]
];

test("both copies accept, normalise and reject identically", () => {
  for (const [name, input, wording] of accepted) {
    assert.deepEqual(web.normaliseSectionRemarkWording(input), { ok: true, wording }, `web ${name}`);
    assert.deepEqual(api.normaliseSectionRemarkWording(input), { ok: true, wording }, `api ${name}`);
  }
  for (const [name, input, code] of rejected) {
    const fromWeb = web.normaliseSectionRemarkWording(input), fromApi = api.normaliseSectionRemarkWording(input);
    assert.equal(fromWeb.ok, false, `web ${name}`);
    assert.equal(fromWeb.ok === false && fromWeb.code, code, `web ${name}`);
    assert.deepEqual(fromWeb, fromApi, `parity ${name}`);
  }
});

test("the compare key is case-insensitive and both copies agree", () => {
  assert.equal(web.sectionRemarkCompareKey("Main SUPPLY Valve"), "main supply valve");
  assert.equal(web.sectionRemarkCompareKey("Main SUPPLY Valve"), api.sectionRemarkCompareKey("Main SUPPLY Valve"));
  assert.equal(web.sectionRemarkMinLength, api.sectionRemarkMinLength);
  assert.equal(web.sectionRemarkMaxLength, api.sectionRemarkMaxLength);
});
