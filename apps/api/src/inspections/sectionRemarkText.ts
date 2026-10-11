/**
 * CR-07: the one place a technician-typed section remark is normalised and validated on the server.
 *
 * BYTE-IDENTICAL TWO COPIES: apps/api/src/inspections/sectionRemarkText.ts (server authority) and
 * apps/web/src/inspectionControls/sectionRemarkText.ts (the browser needs the same rules offline).
 * apps/web/tests/sectionRemarkTextParity.test.ts asserts the bytes match and runs both over the same inputs.
 *
 * Rejected BEFORE whitespace is collapsed, so a newline or tab can never be silently turned into a space:
 *   - control characters (Unicode Cc: C0, DEL, C1) -- this includes newline, carriage return and tab;
 *   - invisible / direction-forcing characters: U+200B-200F (zero-width, LRM/RLM), U+202A-202E (bidi
 *     embedding and override), U+2060-2064 (word joiner and invisible operators), U+2066-2069 (bidi
 *     isolates), U+FEFF (zero-width no-break space);
 *   - unpaired surrogates.
 * Then: NFC, every run of whitespace becomes one space, trim. Length is counted in code points (what
 * PostgreSQL's length() counts), 3..300.
 */
export const sectionRemarkMinLength = 3;
export const sectionRemarkMaxLength = 300;

export type SectionRemarkTextProblem = "NOT_TEXT" | "CONTROL_CHARACTER" | "INVISIBLE_CHARACTER" | "TOO_SHORT" | "TOO_LONG";
export type SectionRemarkTextResult =
  | { ok: true; wording: string }
  | { ok: false; code: SectionRemarkTextProblem; message: string };

const control = /\p{Cc}/u;
const invisible = /[\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}]/u;
const unpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function normaliseSectionRemarkWording(input: unknown): SectionRemarkTextResult {
  if (typeof input !== "string") return { ok: false, code: "NOT_TEXT", message: "The remark must be text." };
  if (control.test(input)) return { ok: false, code: "CONTROL_CHARACTER", message: "The remark must be one line of plain text." };
  if (invisible.test(input) || unpairedSurrogate.test(input)) {
    return { ok: false, code: "INVISIBLE_CHARACTER", message: "The remark contains a hidden or invalid character." };
  }
  const wording = input.normalize("NFC").replace(/\s+/gu, " ").trim();
  const length = [...wording].length;
  if (length < sectionRemarkMinLength) {
    return { ok: false, code: "TOO_SHORT", message: `The remark must be at least ${sectionRemarkMinLength} characters.` };
  }
  if (length > sectionRemarkMaxLength) {
    return { ok: false, code: "TOO_LONG", message: `The remark must be at most ${sectionRemarkMaxLength} characters.` };
  }
  return { ok: true, wording };
}

/** The key two remarks are compared on (case-insensitive, after normalising). */
export function sectionRemarkCompareKey(wording: string): string {
  return wording.toLocaleLowerCase();
}
