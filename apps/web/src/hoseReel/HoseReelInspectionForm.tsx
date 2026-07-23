import { useEffect, useMemo, useState } from "react";
import {
  addHoseReelRow,
  getHoseReelSubmitIssues
} from "./hoseReelRepository";
import {
  hoseReelChecklistItems,
  type GoodPoor,
  type HoseReelResponses,
  type MasterSystemInspectionRecord
} from "./hoseReelTypes";

type Props = {
  record: MasterSystemInspectionRecord;
  onSaveDraft: (responses: HoseReelResponses) => Promise<void>;
  onSubmitLocal: (responses: HoseReelResponses) => Promise<void>;
  onEditFailed: () => Promise<void>;
  onClose: () => void;
};

const statusLabels = {
  Draft: "Draft",
  Pending: "Pending Sync",
  Syncing: "Syncing",
  Synced: "Completed",
  Failed: "Needs Attention"
} as const;

const setResult = (value: GoodPoor | null, next: GoodPoor) =>
  value === next ? null : next;

function ResultButtons({
  value,
  onChange,
  readOnly
}: {
  value: GoodPoor | null;
  onChange: (value: GoodPoor | null) => void;
  readOnly: boolean;
}) {
  return (
    <div className="result-buttons" aria-label="Result">
      <button
        type="button"
        className={value === "good" ? "selected-good" : "secondary-command"}
        disabled={readOnly}
        onClick={() => onChange(setResult(value, "good"))}
      >
        Good
      </button>
      <button
        type="button"
        className={value === "poor" ? "selected-poor" : "secondary-command"}
        disabled={readOnly}
        onClick={() => onChange(setResult(value, "poor"))}
      >
        Poor
      </button>
    </div>
  );
}

export function HoseReelInspectionForm({
  record,
  onSaveDraft,
  onSubmitLocal,
  onEditFailed,
  onClose
}: Props) {
  const [responses, setResponses] = useState(record.responses);
  const [message, setMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const validationIssues = useMemo(
    () => showValidation ? getHoseReelSubmitIssues(responses) : [],
    [responses, showValidation]
  );
  const invalidTargets = useMemo(
    () => new Set(validationIssues.map((issue) => issue.targetId)),
    [validationIssues]
  );
  const groupedIssues = useMemo(() => {
    const groups = new Map<string, string[]>();
    validationIssues.forEach((issue) => {
      groups.set(issue.section, [...(groups.get(issue.section) ?? []), issue.message]);
    });
    return [...groups.entries()];
  }, [validationIssues]);

  useEffect(() => {
    setResponses(record.responses);
  }, [record]);

  useEffect(() => {
    setMessage("");
    setShowValidation(false);
  }, [record.clientUuid]);

  const readOnly = record.syncStatus !== "Draft";
  const lifecycleMessage = record.syncStatus === "Pending"
    ? "Inspection submitted locally and waiting for sync."
    : record.syncStatus === "Syncing"
      ? "Inspection is syncing."
      : record.syncStatus === "Synced"
        ? "Inspection synced and completed."
        : "";
  const updateChecklist = (
    key: string,
    change: Partial<HoseReelResponses["checklist"][string]>
  ) => setResponses((current) => ({
    ...current,
    checklist: {
      ...current.checklist,
      [key]: { ...current.checklist[key], ...change }
    }
  }));
  const updateJockey = (
    change: Partial<HoseReelResponses["measurements"]["jockey_pump_pressure"]>
  ) => setResponses((current) => ({
    ...current,
    measurements: {
      ...current.measurements,
      jockey_pump_pressure: {
        ...current.measurements.jockey_pump_pressure,
        ...change
      }
    }
  }));
  const updateStandby = (
    change: Partial<HoseReelResponses["measurements"]["standby_pump_cut_in"]>
  ) => setResponses((current) => ({
    ...current,
    measurements: {
      ...current.measurements,
      standby_pump_cut_in: {
        ...current.measurements.standby_pump_cut_in,
        ...change
      }
    }
  }));
  const updateRow = (
    rowUuid: string,
    change: Partial<HoseReelResponses["rows"][number]>
  ) => setResponses((current) => ({
    ...current,
    rows: current.rows.map((row) =>
      row.rowUuid === rowUuid ? { ...row, ...change } : row
    )
  }));

  async function save() {
    try {
      await onSaveDraft(responses);
      setMessage("Draft saved on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft could not be saved");
    }
  }

  async function submit() {
    const issues = getHoseReelSubmitIssues(responses);
    setShowValidation(true);
    if (issues.length > 0) {
      setMessage("");
      window.setTimeout(() => {
        document.getElementById(issues[0].targetId)?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      });
      return;
    }

    try {
      await onSubmitLocal(responses);
      setShowValidation(false);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inspection could not be submitted");
    }
  }

  return (
    <section className="hose-reel-form" aria-labelledby="hose-reel-form-title">
      <button type="button" className="secondary-command" onClick={onClose}>
        Back to Systems
      </button>
      <header className="inspection-context">
        <div>
          <p className="eyebrow">{record.inspectionSnapshot.job.reference}</p>
          <h2 id="hose-reel-form-title">{record.inspectionSnapshot.job.title}</h2>
          <p>{record.inspectionSnapshot.customer.displayName}</p>
          <p className="secondary-metadata">
            Configuration revision {record.configuration.revisionNumber}
          </p>
        </div>
        <div>
          <span className="status-caption">Hose Reel System</span>
          <strong className={`inspection-status status-${record.syncStatus.toLowerCase()}`}>
            {statusLabels[record.syncStatus]}
          </strong>
        </div>
      </header>

      {record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}
      {lifecycleMessage ? <p className="success-message">{lifecycleMessage}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}
      {validationIssues.length > 0 ? (
        <section className="validation-summary" role="alert" aria-labelledby="validation-title">
          <h3 id="validation-title">Cannot submit yet</h3>
          {groupedIssues.map(([section, issues]) => (
            <div key={section}>
              <strong>{section}</strong>
              <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          ))}
        </section>
      ) : null}
      {record.syncStatus === "Failed" ? (
        <button type="button" onClick={() => void onEditFailed()}>
          Edit Failed Inspection
        </button>
      ) : null}

      <fieldset disabled={readOnly}>
        <legend>Water Tank</legend>
        {hoseReelChecklistItems.slice(0, 4).map(([key, label]) => (
          <div
            className={`hose-check-row ${invalidTargets.has(`check-${key}`) ? "field-invalid" : ""}`}
            id={`check-${key}`}
            key={key}
          >
            <strong>{label}</strong>
            <ResultButtons
              value={responses.checklist[key]?.result ?? null}
              readOnly={readOnly}
              onChange={(result) => updateChecklist(key, { result })}
            />
            <label>
              Remarks
              <textarea
                value={responses.checklist[key]?.remarks ?? ""}
                onChange={(event) => updateChecklist(key, { remarks: event.target.value })}
              />
            </label>
          </div>
        ))}
      </fieldset>

      <fieldset disabled={readOnly}>
        <legend>Pump House</legend>
        {hoseReelChecklistItems.slice(4).map(([key, label]) => (
          <div
            className={`hose-check-row ${invalidTargets.has(`check-${key}`) ? "field-invalid" : ""}`}
            id={`check-${key}`}
            key={key}
          >
            <strong>{label}</strong>
            <ResultButtons
              value={responses.checklist[key]?.result ?? null}
              readOnly={readOnly}
              onChange={(result) => updateChecklist(key, { result })}
            />
            <label>
              Remarks
              <textarea
                value={responses.checklist[key]?.remarks ?? ""}
                onChange={(event) => updateChecklist(key, { remarks: event.target.value })}
              />
            </label>
          </div>
        ))}
        <div
          className={`measurement-card ${invalidTargets.has("jockey-measurement") ? "field-invalid" : ""}`}
          id="jockey-measurement"
        >
          <strong>Jockey Correct Cut In / Cut Out PSI</strong>
          <label>
            Cut In
            <input
              type="number"
              value={responses.measurements.jockey_pump_pressure.values.cut_in ?? ""}
              onChange={(event) => updateJockey({
                values: {
                  ...responses.measurements.jockey_pump_pressure.values,
                  cut_in: event.target.value === "" ? null : Number(event.target.value)
                }
              })}
            />
          </label>
          <label>
            Cut Out
            <input
              type="number"
              value={responses.measurements.jockey_pump_pressure.values.cut_out ?? ""}
              onChange={(event) => updateJockey({
                values: {
                  ...responses.measurements.jockey_pump_pressure.values,
                  cut_out: event.target.value === "" ? null : Number(event.target.value)
                }
              })}
            />
          </label>
          <ResultButtons
            value={responses.measurements.jockey_pump_pressure.result}
            readOnly={readOnly}
            onChange={(result) => updateJockey({ result })}
          />
          <label>
            Remarks
            <textarea
              value={responses.measurements.jockey_pump_pressure.remarks}
              onChange={(event) => updateJockey({ remarks: event.target.value })}
            />
          </label>
        </div>
        <div
          className={`measurement-card ${invalidTargets.has("standby-measurement") ? "field-invalid" : ""}`}
          id="standby-measurement"
        >
          <strong>Correct Stand-By Pump Cut In PSI</strong>
          <label>
            Cut In
            <input
              type="number"
              value={responses.measurements.standby_pump_cut_in.values.value ?? ""}
              onChange={(event) => updateStandby({
                values: { value: event.target.value === "" ? null : Number(event.target.value) }
              })}
            />
          </label>
          <ResultButtons
            value={responses.measurements.standby_pump_cut_in.result}
            readOnly={readOnly}
            onChange={(result) => updateStandby({ result })}
          />
          <label>
            Remarks
            <textarea
              value={responses.measurements.standby_pump_cut_in.remarks}
              onChange={(event) => updateStandby({ remarks: event.target.value })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={readOnly}>
        <legend>Hose Reel Drum</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={responses.drumTypes.swing}
            onChange={(event) => setResponses((current) => ({
              ...current,
              drumTypes: { ...current.drumTypes, swing: event.target.checked }
            }))}
          />
          Swing Type
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={responses.drumTypes.fixed}
            onChange={(event) => setResponses((current) => ({
              ...current,
              drumTypes: { ...current.drumTypes, fixed: event.target.checked }
            }))}
          />
          Fixed Type
        </label>
        <p className="form-message">
          Both selections are temporarily allowed while source cardinality is pending confirmation.
        </p>
      </fieldset>

      <fieldset id="hose-reel-locations" disabled={readOnly}>
        <legend>Hose Reel Locations</legend>
        {responses.rows
          .slice()
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((row, index) => (
            <section
              className={`hose-row-card ${invalidTargets.has(`hose-row-${row.rowUuid}`) ? "field-invalid" : ""}`}
              id={`hose-row-${row.rowUuid}`}
              key={row.rowUuid}
            >
              <h4>Location {index + 1} {row.source === "configured" ? "(configured)" : "(inspection-only)"}</h4>
              <label>
                Location
                <input
                  value={row.locationText}
                  onChange={(event) => updateRow(row.rowUuid, { locationText: event.target.value })}
                />
              </label>
              <label>
                No. / Reference
                <input
                  value={row.assetReference ?? ""}
                  onChange={(event) => updateRow(row.rowUuid, { assetReference: event.target.value || null })}
                />
              </label>
              {([
                ["drumResult", "Drum"],
                ["hoseResult", "Hose"],
                ["nozzleResult", "Nozzle"],
                ["valveResult", "Valve"],
                ["nozzleBoxResult", "Nozzle Box"]
              ] as const).map(([field, label]) => (
                <div className="hose-component" key={field}>
                  <strong>{label}</strong>
                  <ResultButtons
                    value={row[field]}
                    readOnly={readOnly}
                    onChange={(result) => updateRow(row.rowUuid, { [field]: result })}
                  />
                </div>
              ))}
              <label>
                Remarks
                <textarea
                  value={row.remarks}
                  onChange={(event) => updateRow(row.rowUuid, { remarks: event.target.value })}
                />
              </label>
              {!readOnly ? (
                <button
                  type="button"
                  className="secondary-command"
                  onClick={() => {
                    if (window.confirm("Remove this Draft location row?")) {
                      setResponses((current) => ({
                        ...current,
                        rows: current.rows.filter((item) => item.rowUuid !== row.rowUuid)
                      }));
                    }
                  }}
                >
                  Remove Row
                </button>
              ) : null}
            </section>
          ))}
        {!readOnly ? (
          <button type="button" className="secondary-command" onClick={() => setResponses(addHoseReelRow)}>
            Add Row
          </button>
        ) : null}
      </fieldset>

      <fieldset
        className={invalidTargets.has("hose-reel-comments") ? "field-invalid" : ""}
        id="hose-reel-comments"
        disabled={readOnly}
      >
        <legend>Comments</legend>
        <textarea
          value={responses.comments}
          onChange={(event) => setResponses((current) => ({
            ...current,
            comments: event.target.value
          }))}
        />
      </fieldset>

      {record.syncStatus === "Draft" ? (
        <div className="form-actions sticky-form-actions">
          <button type="button" className="secondary-command" onClick={() => void save()}>
            Save Draft
          </button>
          <button type="button" onClick={() => void submit()}>
            Submit Local
          </button>
        </div>
      ) : null}
    </section>
  );
}
