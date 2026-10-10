import { useState } from "react";
import {
  maxShutterRows, maxZones, parseShutterCount, parseZonePlan, type RollerShutterSetupStep, type RollerShutterStart, type ShutterLayoutRow
} from "./fireRatedRollerShutterSetup";

const previewLimit = 8;

/** Shown before the Roller Shutter form on a fresh Draft: ask how many zones and locations, or confirm the
 *  customer's saved layout. Entirely local -- it never waits for, or depends on, the network. */
export function FireRatedRollerShutterSetupPrompt({ step, savedRows, onStart }: {
  step: RollerShutterSetupStep;
  savedRows: readonly ShutterLayoutRow[];
  onStart: (start: RollerShutterStart) => void;
}) {
  return step === "count"
    ? <CountPrompt onStart={onStart} />
    : <ConfirmPrompt savedRows={savedRows} onStart={onStart} />;
}

function CountPrompt({ onStart }: { onStart: (start: RollerShutterStart) => void }) {
  const [zones, setZones] = useState("1");
  const [perZone, setPerZone] = useState("1");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const zoneCount = parseShutterCount(zones, 1, maxZones) ?? 0;
  function start() {
    const parsed = parseZonePlan(zones, perZone, overrides);
    if ("error" in parsed) { setError(parsed.error); return; }
    setError("");
    onStart({ plan: parsed.plan });
  }
  return <section className="report-summary" aria-labelledby="roller-shutter-setup-title">
    <h3 id="roller-shutter-setup-title">How many zones and locations?</h3>
    <p>Enter how many zones this customer has and how many locations (roller shutters) are in each. The form then opens ready to fill in. The names you type are remembered for the next visit once an Admin approves them.</p>
    <label>Number of zones
      <input type="number" inputMode="numeric" min={1} max={maxZones} value={zones}
        onChange={(event) => { setZones(event.target.value); setError(""); }} />
    </label>
    <label>Locations in each zone
      <input type="number" inputMode="numeric" min={1} max={maxShutterRows} value={perZone}
        onChange={(event) => { setPerZone(event.target.value); setError(""); }} />
    </label>
    {zoneCount > 1 ? <details>
      <summary>Different number of locations in some zones?</summary>
      {Array.from({ length: zoneCount }, (_, index) => <label key={index}>Zone {index + 1} locations
        <input type="number" inputMode="numeric" min={1} max={maxShutterRows} placeholder={perZone} value={overrides[index] ?? ""}
          onChange={(event) => { const value = event.target.value; setOverrides((current) => ({ ...current, [index]: value })); setError(""); }} />
      </label>)}
    </details> : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="inline-actions"><button type="button" onClick={start}>Start Inspection</button></div>
  </section>;
}

function ConfirmPrompt({ savedRows, onStart }: { savedRows: readonly ShutterLayoutRow[]; onStart: (start: RollerShutterStart) => void }) {
  const zoned = savedRows.some((row) => (row.zoneText ?? "") !== "");
  const [raw, setRaw] = useState("0");
  const [error, setError] = useState("");
  const max = maxShutterRows - savedRows.length;
  const zoneNames = [...new Set(savedRows.map((row) => row.zoneText ?? ""))];
  function start() {
    if (zoned) { onStart({ extraRows: 0 }); return; }
    const count = parseShutterCount(raw, 0, max);
    if (count === undefined) { setError(`Enter a whole number from 0 to ${max}.`); return; }
    setError("");
    onStart({ extraRows: count });
  }
  const line = (row: ShutterLayoutRow) => `${row.assetReference ? `${row.assetReference} – ` : ""}${row.locationText}`;
  return <section className="report-summary" aria-labelledby="roller-shutter-setup-title">
    <h3 id="roller-shutter-setup-title">Same shutters as last time</h3>
    <p>This customer has {savedRows.length} saved shutter{savedRows.length === 1 ? "" : "s"}{zoned ? ` in ${zoneNames.length} zone${zoneNames.length === 1 ? "" : "s"}` : ""}. They are already in the form, so you only need to fill in the results.</p>
    {zoned
      ? zoneNames.map((zone) => {
        const rows = savedRows.filter((row) => (row.zoneText ?? "") === zone);
        return <div key={zone}><strong>{zone || "No zone"}</strong> ({rows.length})<ul>{rows.slice(0, previewLimit).map((row, index) => <li key={index}>{line(row)}</li>)}</ul>{rows.length > previewLimit ? <p>and {rows.length - previewLimit} more</p> : null}</div>;
      })
      : <><ul>{savedRows.slice(0, previewLimit).map((row, index) => <li key={index}>{line(row)}</li>)}</ul>
        {savedRows.length > previewLimit ? <p>and {savedRows.length - previewLimit} more</p> : null}</>}
    {zoned ? <p>Add a shutter to a zone, or add a new zone, inside the form if something has changed.</p> : <label>Extra shutters this visit (optional)
      <input type="number" inputMode="numeric" min={0} max={max} value={raw} onChange={(event) => { setRaw(event.target.value); setError(""); }} />
    </label>}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="inline-actions"><button type="button" onClick={start}>Start Inspection</button></div>
  </section>;
}
