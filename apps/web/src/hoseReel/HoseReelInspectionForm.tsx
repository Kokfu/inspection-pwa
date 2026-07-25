import { useEffect, useMemo, useState } from "react";
import { controlsForHoseReelSnapshot } from "../inspectionControls/definitionResolver";
import { MeasurementValueInput } from "../inspectionControls/MeasurementValueInput";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import {
  addHoseReelRow,
  getHoseReelSubmitIssues
} from "./hoseReelRepository";
import {
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

const rowResultFields = {
  drum: "drumResult",
  hose: "hoseResult",
  nozzle: "nozzleResult",
  valve: "valveResult",
  nozzle_box: "nozzleBoxResult"
} as const;

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
  const controlResolution = useMemo(() => {
    try {
      return { controls: controlsForHoseReelSnapshot(record.inspectionSnapshot) };
    } catch (error) {
      return {
        controls: undefined,
        error: error instanceof Error
          ? error.message
          : "Inspection controls are unavailable"
      };
    }
  }, [record.inspectionSnapshot]);
  const controls = controlResolution.controls;
  const validationIssues = useMemo(
    () => showValidation && controls
      ? getHoseReelSubmitIssues(responses, record.inspectionSnapshot)
      : [],
    [controls, record.inspectionSnapshot, responses, showValidation]
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
    if (!controls) {
      setMessage(controlResolution.error ?? "Inspection controls are unavailable");
      return;
    }
    const issues = getHoseReelSubmitIssues(responses, record.inspectionSnapshot);
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

  if (!controls) {
    return (
      <section className="hose-reel-form" aria-labelledby="hose-reel-form-title">
        <button type="button" className="secondary-command" onClick={onClose}>
          Back to Systems
        </button>
        <h2 id="hose-reel-form-title">Hose Reel inspection unavailable</h2>
        <p className="error-text" role="alert">
          {controlResolution.error ?? "The frozen inspection definition is invalid."}
        </p>
      </section>
    );
  }

  const jockeyDefinition = controls.measurements.find(
    (item) => item.key === "jockey_pump_pressure"
  );
  const standbyDefinition = controls.measurements.find(
    (item) => item.key === "standby_pump_cut_in"
  );
  if (!jockeyDefinition || !standbyDefinition) {
    return (
      <section className="hose-reel-form" aria-labelledby="hose-reel-form-title">
        <button type="button" className="secondary-command" onClick={onClose}>
          Back to Systems
        </button>
        <h2 id="hose-reel-form-title">Hose Reel inspection unavailable</h2>
        <p className="error-text" role="alert">
          Required measurement controls are missing from the frozen definition.
        </p>
      </section>
    );
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
        {controls.checklist.waterTank.map((definition) => (
          <div
            className={`hose-check-row ${invalidTargets.has(`check-${definition.key}`) ? "field-invalid" : ""}`}
            id={`check-${definition.key}`}
            key={definition.key}
          >
            <strong>{definition.label}</strong>
            <ResultSelector<GoodPoor>
              definition={definition.result}
              label={`${definition.label} result`}
              value={responses.checklist[definition.key]?.result ?? null}
              readOnly={readOnly}
              onChange={(result) => updateChecklist(definition.key, { result })}
            />
            <RemarksField
              label="Remarks"
              definition={definition.remarks}
              value={responses.checklist[definition.key]?.remarks ?? ""}
              readOnly={readOnly}
              onChange={(remarks) => updateChecklist(definition.key, { remarks })}
            />
          </div>
        ))}
      </fieldset>

      <fieldset disabled={readOnly}>
        <legend>Pump House</legend>
        {controls.checklist.pumpHouse.map((definition) => (
          <div
            className={`hose-check-row ${invalidTargets.has(`check-${definition.key}`) ? "field-invalid" : ""}`}
            id={`check-${definition.key}`}
            key={definition.key}
          >
            <strong>{definition.label}</strong>
            <ResultSelector<GoodPoor>
              definition={definition.result}
              label={`${definition.label} result`}
              value={responses.checklist[definition.key]?.result ?? null}
              readOnly={readOnly}
              onChange={(result) => updateChecklist(definition.key, { result })}
            />
            <RemarksField
              label="Remarks"
              definition={definition.remarks}
              value={responses.checklist[definition.key]?.remarks ?? ""}
              readOnly={readOnly}
              onChange={(remarks) => updateChecklist(definition.key, { remarks })}
            />
          </div>
        ))}
        <div
          className={`measurement-card ${invalidTargets.has("jockey-measurement") ? "field-invalid" : ""}`}
          id="jockey-measurement"
        >
          <strong>{jockeyDefinition.label}</strong>
          {jockeyDefinition.values.map((definition) => (
            <MeasurementValueInput
              definition={definition}
              key={definition.key}
              value={responses.measurements.jockey_pump_pressure.values[
                definition.key as keyof HoseReelResponses["measurements"]["jockey_pump_pressure"]["values"]
              ]}
              readOnly={readOnly}
              onChange={(value) => updateJockey({
                values: {
                  ...responses.measurements.jockey_pump_pressure.values,
                  [definition.key]: value
                }
              })}
            />
          ))}
          <ResultSelector<GoodPoor>
            definition={jockeyDefinition.result}
            label={`${jockeyDefinition.label} result`}
            value={responses.measurements.jockey_pump_pressure.result}
            readOnly={readOnly}
            onChange={(result) => updateJockey({ result })}
          />
          <RemarksField
            label="Remarks"
            definition={jockeyDefinition.remarks}
            value={responses.measurements.jockey_pump_pressure.remarks}
            readOnly={readOnly}
            onChange={(remarks) => updateJockey({ remarks })}
          />
        </div>
        <div
          className={`measurement-card ${invalidTargets.has("standby-measurement") ? "field-invalid" : ""}`}
          id="standby-measurement"
        >
          <strong>{standbyDefinition.label}</strong>
          {standbyDefinition.values.map((definition) => (
            <MeasurementValueInput
              definition={definition}
              key={definition.key}
              value={responses.measurements.standby_pump_cut_in.values[
                definition.key as keyof HoseReelResponses["measurements"]["standby_pump_cut_in"]["values"]
              ]}
              readOnly={readOnly}
              onChange={(value) => updateStandby({
                values: { ...responses.measurements.standby_pump_cut_in.values, [definition.key]: value }
              })}
            />
          ))}
          <ResultSelector<GoodPoor>
            definition={standbyDefinition.result}
            label={`${standbyDefinition.label} result`}
            value={responses.measurements.standby_pump_cut_in.result}
            readOnly={readOnly}
            onChange={(result) => updateStandby({ result })}
          />
          <RemarksField
            label="Remarks"
            definition={standbyDefinition.remarks}
            value={responses.measurements.standby_pump_cut_in.remarks}
            readOnly={readOnly}
            onChange={(remarks) => updateStandby({ remarks })}
          />
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
              {controls.repeatableRows.resultColumns.map((definition) => {
                const field = rowResultFields[definition.key as keyof typeof rowResultFields];
                if (!field) return null;
                return (
                <div className="hose-component" key={definition.key}>
                  <strong>{definition.label}</strong>
                  <ResultSelector<GoodPoor>
                    definition={definition.result}
                    label={`${definition.label} result`}
                    value={row[field]}
                    readOnly={readOnly}
                    onChange={(result) => updateRow(row.rowUuid, { [field]: result })}
                  />
                </div>
                );
              })}
              <RemarksField
                label="Remarks"
                definition={controls.repeatableRows.remarks}
                value={row.remarks}
                readOnly={readOnly}
                onChange={(remarks) => updateRow(row.rowUuid, { remarks })}
              />
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
        <RemarksField
          label="Comments"
          definition={controls.comments}
          value={responses.comments}
          readOnly={readOnly}
          onChange={(comments) => setResponses((current) => ({
            ...current,
            comments
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
