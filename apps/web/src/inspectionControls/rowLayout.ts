/**
 * Phase 3: the Roller Shutter "how many / same as last time / saved automatically" flow for the row-based systems that
 * keep ONE saved layout per customer (Hydrant, Dry/Wet Riser, Hose Reel). Pure helpers only, no React and no database,
 * so the rules are unit-tested; the system-specific files say what a row, a saved layout and "untouched" mean.
 *
 * A saved layout is the customer's `update-format` proposal for the system's single location (what the Admin approved
 * becomes `rowPreset`), exactly what the manual "Save as format for next visit" button already sends.
 */

/** One layout row as the proposal carries it. `drumType` is Hose Reel's only extra field ('swing' | 'fixed' | ''). */
export type LayoutRow = { assetReference: string; locationText: string; drumType?: string };
export type LayoutLimits = { rows: number; location: number; assetReference: number };
export type RowSetupStep = "count" | "confirm";

/** Which pre-form step a freshly opened Draft needs. Anything the technician has already entered skips it, so reopening
 *  real work never puts a prompt in front of it. */
export function rowSetupStep(input: { untouched: boolean; hasSavedLayout: boolean }): RowSetupStep | null {
  if (!input.untouched) return null;
  return input.hasSavedLayout ? "confirm" : "count";
}

/** A whole number within [min, max], or undefined. Rejects blanks, decimals, signs and exponents. */
export function parseRowCount(raw: string, min: number, max: number): number | undefined {
  const text = raw.trim();
  if (!/^\d{1,3}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
}

/** Why this layout cannot be proposed, or undefined when it can. Mirrors the server's row bounds. */
export function rowLayoutIssue(rows: readonly LayoutRow[], limits: LayoutLimits, noun: string): string | undefined {
  if (!rows.length || rows.length > limits.rows) return `Add at least one ${noun} with a location before it can be saved for next visit.`;
  if (rows.some((row) => !row.locationText.trim())) return `Give every ${noun} a location before it can be saved for next visit.`;
  if (rows.some((row) => row.locationText.length > limits.location || row.assetReference.length > limits.assetReference)) {
    return `A ${noun} location or reference is too long to be saved for next visit.`;
  }
  return undefined;
}

export function rowLayoutDiffers(saved: readonly LayoutRow[], proposed: readonly LayoutRow[]): boolean {
  return saved.length !== proposed.length || proposed.some((row, index) =>
    row.assetReference !== saved[index]!.assetReference || row.locationText !== saved[index]!.locationText
    || (row.drumType ?? "") !== (saved[index]!.drumType ?? ""));
}

export type RowLayoutDecision = { action: "skip" } | { action: "note"; note: string } | { action: "send" };

/** What the submit-time layout save should do. `existingStatus` is the local proposal draft already stored for this job +
 *  system location (a second proposal would overwrite its draft row and strand its outbox item). A proposal the server
 *  held behind an earlier pending one was never sent, so it does not block a new one. */
export function decideRowLayout(
  saved: readonly LayoutRow[], proposed: readonly LayoutRow[], existingStatus: string | undefined, existingHeld: boolean,
  limits: LayoutLimits, noun: string
): RowLayoutDecision {
  if (!rowLayoutDiffers(saved, proposed)) return { action: "skip" };
  const issue = rowLayoutIssue(proposed, limits, noun);
  if (issue) return { action: "note", note: `Inspection submitted. The ${noun} layout was not saved for next visit: ${issue}` };
  if (existingStatus !== undefined && existingStatus !== "Draft" && !existingHeld) {
    return { action: "note", note: `Inspection submitted. A ${noun} layout for this visit was already sent for review.` };
  }
  return { action: "send" };
}

/** The note about this visit's saved layout, derived from the stored proposal so it survives a reload. `held` is a
 *  proposal the server refused because an earlier one is still awaiting review (see proposalMessages.ts). */
export function rowLayoutNote(draft: { status: string } | undefined, held: boolean, noun: string): string {
  if (!draft || draft.status === "Draft") return "";
  if (draft.status === "Synced") return `${capitalise(noun)} layout sent to an Admin for approval. Once approved, it is pre-filled on the next visit.`;
  if (draft.status === "Pending") return `${capitalise(noun)} layout saved on this device. It will be sent to an Admin for approval when online.`;
  if (held) return `A ${noun} layout for this customer is already waiting for Admin review, so this visit's layout was not sent.`;
  return `Inspection submitted. The ${noun} layout needs attention to sync; see the sync status in the header.`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Blank technician rows to append: `count` more rows, numbered after the existing ones. */
export function nextSortOrders(existingCount: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => existingCount + index + 1);
}
