import { useState } from "react";
import { maxShutterRows, parseShutterCount, type RollerShutterSetupStep, type ShutterLayoutRow } from "./fireRatedRollerShutterSetup";

const previewLimit = 8;

/** Shown before the Roller Shutter form on a fresh Draft: ask how many shutters, or confirm the
 *  customer's saved layout. Entirely local -- it never waits for, or depends on, the network. */
export function FireRatedRollerShutterSetupPrompt({ step, savedRows, onStart }: {
  step: RollerShutterSetupStep;
  savedRows: readonly ShutterLayoutRow[];
  onStart: (additionalRows: number) => void;
}) {
  const counting = step === "count";
  const [raw, setRaw] = useState(counting ? "1" : "0");
  const [error, setError] = useState("");
  const min = counting ? 1 : 0;
  const max = counting ? maxShutterRows : maxShutterRows - savedRows.length;
  function start() {
    const count = parseShutterCount(raw, min, max);
    if (count === undefined) { setError(`Enter a whole number from ${min} to ${max}.`); return; }
    setError("");
    onStart(count);
  }
  return <section className="report-summary" aria-labelledby="roller-shutter-setup-title">
    <h3 id="roller-shutter-setup-title">{counting ? "How many shutters?" : "Same shutters as last time"}</h3>
    {counting
      ? <p>Enter how many roller shutters you will inspect. You can add or remove rows afterwards. The shutter names you type are remembered for the next visit once a Supervisor approves them.</p>
      : <>
        <p>This customer has {savedRows.length} saved shutter{savedRows.length === 1 ? "" : "s"}. They are already in the form, so you only need to fill in the results.</p>
        <ul>
          {savedRows.slice(0, previewLimit).map((row, index) => <li key={index}>{row.assetReference ? `${row.assetReference} – ` : ""}{row.locationText}</li>)}
        </ul>
        {savedRows.length > previewLimit ? <p>and {savedRows.length - previewLimit} more</p> : null}
      </>}
    <label>{counting ? "Number of shutters" : "Extra shutters this visit (optional)"}
      <input type="number" inputMode="numeric" min={min} max={max} value={raw}
        onChange={(event) => { setRaw(event.target.value); setError(""); }} />
    </label>
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="inline-actions"><button type="button" onClick={start}>Start Inspection</button></div>
  </section>;
}
