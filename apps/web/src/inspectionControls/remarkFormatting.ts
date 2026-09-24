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
