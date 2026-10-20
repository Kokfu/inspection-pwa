export function appendCommonRemark(value: string, wording: string, detail: string, maxLength: number): string {
  const phrase = `${wording}${detail ? ` — ${detail}` : ""}`;
  const next = value.trim() ? `${value.trimEnd()}\n${phrase}` : phrase;
  if (next.length > maxLength) throw new Error(`Remark exceeds ${maxLength} characters.`);
  return next;
}

export function appendOtherRemark(base: string, other: string, maxLength: number): string {
  const next = other ? `${base.trimEnd()}${base.trim() ? "\n" : ""}${other}` : base;
  if (next.length > maxLength) throw new Error(`Remark exceeds ${maxLength} characters.`);
  return next;
}

/** Single-row picker writes the whole field, including clear and free text. */
export function replaceRemark(wording: string, detail: string, maxLength: number): string {
  return appendCommonRemark("", wording, detail, maxLength);
}

type RemarkChoice = { id: string; wording: string; detailOptions: string[] };

/** Derive controls from persisted text; never rewrite a draft just by opening it. */
export function singleRemarkSelection(value: string, choices: RemarkChoice[]) {
  const lines = value.split("\n").filter((line) => line.trim());
  if (lines.length > 1) return { id: "", detail: "", legacy: true };
  if (!value) return { id: "", detail: "", legacy: false };
  for (const item of choices) {
    if (value === item.wording) return { id: item.id, detail: "", legacy: false };
    for (const detail of item.detailOptions) {
      if (value === `${item.wording} — ${detail}`) return { id: item.id, detail, legacy: false };
    }
  }
  return { id: "others", detail: "", legacy: false };
}
