import { useState } from "react";
import { parseRowCount, type LayoutRow, type RowSetupStep } from "./rowLayout";

const previewLimit = 8;

/** What the pre-form step hands back: the total number of rows to inspect (first visit) or extra rows on top of the saved layout. */
export type RowSetupStart = { total: number } | { extra: number };

type Props = {
  step: RowSetupStep;
  /** Singular and plural of what is counted, lower case: "hydrant" / "hydrants". */
  noun: string; plural: string;
  maxRows: number;
  savedRows: readonly LayoutRow[];
  /** Hose Reel rows also carry a drum type; it is shown after the location. */
  showDrumType?: boolean;
  onStart: (start: RowSetupStart) => void;
};

/**
 * Phase 3: shown before the form on a fresh Draft: ask how many rows there are, or confirm the customer's saved layout.
 * Entirely local -- it never waits for, or depends on, the network. Same look as the Roller Shutter prompts (`.setup-prompt`).
 */
export function RowSetupPrompt(props: Props) {
  return props.step === "count" ? <CountPrompt {...props} /> : <ConfirmPrompt {...props} />;
}

function CountPrompt({ noun, plural, maxRows, onStart }: Props) {
  const [raw, setRaw] = useState("1");
  const [error, setError] = useState("");
  function start() {
    const total = parseRowCount(raw, 1, maxRows);
    if (total === undefined) { setError(`Enter a whole number from 1 to ${maxRows}.`); return; }
    setError("");
    onStart({ total });
  }
  return <section className="report-summary setup-prompt" aria-labelledby="row-setup-title">
    <h3 id="row-setup-title">How many {plural}?</h3>
    <p>Enter how many {plural} this customer has. The form then opens ready to fill in. The locations you type are remembered for the next visit once an Admin approves them.</p>
    <label>Number of {plural}
      <input type="number" inputMode="numeric" min={1} max={maxRows} value={raw} onChange={(event) => { setRaw(event.target.value); setError(""); }} />
    </label>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="inline-actions"><button type="button" onClick={start}>Start Inspection</button></div>
    <p className="support-metadata">Not sure yet? Start with one {noun}; you can add more inside the form.</p>
  </section>;
}

function ConfirmPrompt({ noun, plural, maxRows, savedRows, showDrumType, onStart }: Props) {
  const [raw, setRaw] = useState("0");
  const [error, setError] = useState("");
  const max = Math.max(0, maxRows - savedRows.length);
  function start() {
    const extra = parseRowCount(raw, 0, max);
    if (extra === undefined) { setError(`Enter a whole number from 0 to ${max}.`); return; }
    setError("");
    onStart({ extra });
  }
  const line = (row: LayoutRow) => `${row.assetReference ? `${row.assetReference} – ` : ""}${row.locationText}${showDrumType && row.drumType ? ` (${row.drumType})` : ""}`;
  return <section className="report-summary setup-prompt" aria-labelledby="row-setup-title">
    <h3 id="row-setup-title">Same {plural} as last time</h3>
    <p>This customer has {savedRows.length} saved {savedRows.length === 1 ? noun : plural}. They are already in the form; just fill in the results.</p>
    <ul>{savedRows.slice(0, previewLimit).map((row, index) => <li key={index}>{line(row)}</li>)}</ul>
    {savedRows.length > previewLimit ? <p>and {savedRows.length - previewLimit} more</p> : null}
    <label>Extra {plural} this visit (optional)
      <input type="number" inputMode="numeric" min={0} max={max} value={raw} onChange={(event) => { setRaw(event.target.value); setError(""); }} />
    </label>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="inline-actions"><button type="button" onClick={start}>Start Inspection</button></div>
  </section>;
}
