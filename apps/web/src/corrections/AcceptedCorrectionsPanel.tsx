import { useEffect, useState } from "react";

/**
 * T5c: corrections made to an Accepted record after submission, shown above the accepted detail.
 *
 * The record itself is immutable, so the detail below always shows the values exactly as accepted; this
 * panel is what makes a later correction visible — old value, new value, who made it, when and why.
 * Read-only for everyone (technicians see their own records; supervisors and admins see any). It is
 * best-effort: an accepted record must still render if this request fails.
 */
export type AcceptedCorrection = {
  id: string; fieldPath: string; label: string; sequence: number;
  previousValue: string | number | null; newValue: string | number | null;
  reason: string; correctedBy: string; correctedByRole: "admin" | "supervisor"; correctedAt: string;
};

const resultLabels: Record<string, string> = { good: "Good", not_good: "Not Good", complete_repair: "Complete Repair", na: "N.A." };
const show = (value: string | number | null) => value === null || value === "" ? "—" : resultLabels[String(value)] ?? String(value);
const isValue = (value: unknown) => value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

function parse(value: unknown): AcceptedCorrection[] | undefined {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { corrections?: unknown }).corrections)) return undefined;
  const rows = (value as { corrections: unknown[] }).corrections;
  const parsed: AcceptedCorrection[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) return undefined;
    const correction = row as Record<string, unknown>;
    if (typeof correction.id !== "string" || typeof correction.fieldPath !== "string" || typeof correction.label !== "string"
      || !Number.isSafeInteger(correction.sequence) || !isValue(correction.previousValue) || !isValue(correction.newValue)
      || typeof correction.reason !== "string" || typeof correction.correctedBy !== "string"
      || (correction.correctedByRole !== "admin" && correction.correctedByRole !== "supervisor")
      || typeof correction.correctedAt !== "string") return undefined;
    parsed.push(correction as unknown as AcceptedCorrection);
  }
  return parsed;
}

function formatWhen(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : value;
}

export function AcceptedCorrectionsPanel({ clientUuid }: { clientUuid: string }) {
  const [corrections, setCorrections] = useState<AcceptedCorrection[]>([]);
  /** A check that failed is never silence: the record below may carry corrections this panel cannot show. */
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setCorrections([]); setUnavailable(false);
    void (async () => {
      try {
        const response = await fetch(`/api/inspections/${encodeURIComponent(clientUuid)}/corrections`, { credentials: "same-origin", cache: "no-store" });
        // 401/403/404: this reader is not shown corrections for this record at all, so there is nothing to say.
        if ([401, 403, 404].includes(response.status)) return;
        const parsed = response.ok ? parse(await response.json()) : undefined;
        if (!active) return;
        if (parsed) setCorrections(parsed);
        else setUnavailable(true);
      } catch {
        // The accepted detail renders with or without this panel; the reader is still told the check failed.
        if (active) setUnavailable(true);
      }
    })();
    return () => { active = false; };
  }, [clientUuid]);

  if (unavailable) {
    return <p className="operational-message operational-message--warning" role="status">
      Corrections made after submission could not be checked. The inspection below is shown as accepted.
    </p>;
  }
  if (!corrections.length) return null;
  const ordered = [...corrections].sort((left, right) => left.correctedAt.localeCompare(right.correctedAt) || left.sequence - right.sequence);
  return <section className="operational-message operational-message--warning" aria-labelledby={`accepted-corrections-${clientUuid}`}>
    <h3 id={`accepted-corrections-${clientUuid}`}>{ordered.length} {ordered.length === 1 ? "correction" : "corrections"} after submission</h3>
    <p>The inspection below is shown exactly as it was accepted. These corrections were recorded separately.</p>
    <ul>{ordered.map((correction) => <li key={correction.id}>
      <strong>{correction.label}</strong>: {show(correction.previousValue)} → <strong>{show(correction.newValue)}</strong>
      {" · "}{correction.correctedBy} ({correction.correctedByRole}) · {formatWhen(correction.correctedAt)} · {correction.reason}
    </li>)}</ul>
  </section>;
}
