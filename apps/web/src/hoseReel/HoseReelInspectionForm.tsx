import { useEffect, useMemo, useState } from "react";
import { controlsForHoseReelSnapshot } from "../inspectionControls/definitionResolver";
import { MeasurementValueInput } from "../inspectionControls/MeasurementValueInput";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import {
  addHoseReelRow,
  getHoseReelSubmitIssues,
  latestHoseReelReferenceForCustomer,
  setHoseReelDrumCount
} from "./hoseReelRepository";
import {
  type GoodPoor,
  type HoseReelDrumType,
  type HoseReelResponses,
  type MasterSystemInspectionRecord
} from "./hoseReelTypes";
import { inspectionSyncMessage } from "../uiPresentation";
import { HoseReelV7EvidenceField } from "./HoseReelV7EvidenceField";
import {
  isHoseReelV7EvidenceFinding,
  listHoseReelV7Photos,
  type HoseReelV7FieldPath
} from "./hoseReelV7Evidence";

type Props = {
  record: MasterSystemInspectionRecord;
  onSaveDraft: (responses: HoseReelResponses) => Promise<void>;
  onSubmitLocal: (responses: HoseReelResponses) => Promise<void>;
  onEditFailed: () => Promise<void>;
  onClose: () => void;
};

const rowResultFields = {
  drum: "drumResult",
  hose: "hoseResult",
  nozzle: "nozzleResult",
  valve: "valveResult",
  nozzle_box: "nozzleBoxResult"
} as const;

const drumTypeLabel = (type: HoseReelDrumType) => (type === "swing" ? "Swing" : "Fixed");

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
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof listHoseReelV7Photos>>>([]);
  const [priorReference, setPriorReference] = useState<Awaited<ReturnType<typeof latestHoseReelReferenceForCustomer>>>(undefined);
  const isV7 = record.masterTemplate.version === 7;
  const isSchema3 = responses.schemaVersion === 3;
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
      ? getHoseReelSubmitIssues(responses, record.inspectionSnapshot, record, photos)
      : [],
    [controls, photos, record, record.inspectionSnapshot, responses, showValidation]
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

  useEffect(() => {
    if (isV7) void listHoseReelV7Photos(record.clientUuid).then(setPhotos);
    else setPhotos([]);
  }, [isV7, record.clientUuid, record.localUpdatedAt]);

  useEffect(() => {
    if (isV7 && record.syncStatus === "Draft") {
      void latestHoseReelReferenceForCustomer(record.inspectionSnapshot.customer.id, record.clientUuid)
        .then(setPriorReference, () => setPriorReference(undefined));
    } else {
      setPriorReference(undefined);
    }
  }, [isV7, record.clientUuid, record.inspectionSnapshot.customer.id, record.syncStatus]);

  const readOnly = record.syncStatus !== "Draft";
  const evidenceFor = (fieldPath: HoseReelV7FieldPath) => photos.find((photo) => photo.fieldPath === fieldPath);
  const refreshPhotos = async () => setPhotos(await listHoseReelV7Photos(record.clientUuid));
  const lifecycleMessage = record.syncStatus === "Draft" ? "" : inspectionSyncMessage(record.syncStatus);
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
    const issues = getHoseReelSubmitIssues(responses, record.inspectionSnapshot, record, photos);
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
          <h2 id="hose-reel-form-title">Hose Reel System</h2>
          <p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p>
          <p>{record.inspectionSnapshot.job.title}</p>
        </div>
        <div>
          <strong className={`inspection-status status-${record.syncStatus.toLowerCase()}`}>
            {inspectionSyncMessage(record.syncStatus)}
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
            {isV7 && isHoseReelV7EvidenceFinding(responses.checklist[definition.key]?.result) ? (
              <HoseReelV7EvidenceField
                record={record}
                fieldPath={`hose_reel_checks.${definition.key}` as HoseReelV7FieldPath}
                attachment={evidenceFor(`hose_reel_checks.${definition.key}` as HoseReelV7FieldPath)}
                onChanged={refreshPhotos}
              />
            ) : null}
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
            {isV7 && isHoseReelV7EvidenceFinding(responses.checklist[definition.key]?.result) ? (
              <HoseReelV7EvidenceField
                record={record}
                fieldPath={`hose_reel_checks.${definition.key}` as HoseReelV7FieldPath}
                attachment={evidenceFor(`hose_reel_checks.${definition.key}` as HoseReelV7FieldPath)}
                onChanged={refreshPhotos}
              />
            ) : null}
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
          {isV7 && isHoseReelV7EvidenceFinding(responses.measurements.jockey_pump_pressure.result) ? (
            <HoseReelV7EvidenceField
              record={record}
              fieldPath="hose_reel_measurements.jockey_pump_pressure"
              attachment={evidenceFor("hose_reel_measurements.jockey_pump_pressure")}
              onChanged={refreshPhotos}
            />
          ) : null}
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
          {isV7 && isHoseReelV7EvidenceFinding(responses.measurements.standby_pump_cut_in.result) ? (
            <HoseReelV7EvidenceField
              record={record}
              fieldPath="hose_reel_measurements.standby_pump_cut_in"
              attachment={evidenceFor("hose_reel_measurements.standby_pump_cut_in")}
              onChanged={refreshPhotos}
            />
          ) : null}
        </div>
      </fieldset>

      {isV7 ? (
        <fieldset disabled={readOnly}>
          <legend>Test Run Fire Pump 30 Minutes</legend>
          {(controls.checklist.testRunFirePump ?? []).map((definition) => (
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
              {isHoseReelV7EvidenceFinding(responses.checklist[definition.key]?.result) ? (
                <HoseReelV7EvidenceField
                  record={record}
                  fieldPath={`hose_reel_checks.${definition.key}` as HoseReelV7FieldPath}
                  attachment={evidenceFor(`hose_reel_checks.${definition.key}` as HoseReelV7FieldPath)}
                  onChanged={refreshPhotos}
                />
              ) : null}
            </div>
          ))}
        </fieldset>
      ) : null}

      {isSchema3 ? (
        <fieldset
          className={invalidTargets.has("hose-reel-drum-count") ? "field-invalid" : ""}
          id="hose-reel-drum-count"
          disabled={readOnly}
        >
          <legend>Hose Reel Drums</legend>
          <label>
            Number of hose reel drums inspected
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={responses.drumCount ?? 0}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setResponses((current) => setHoseReelDrumCount(current, Number.isNaN(next) ? 0 : next));
              }}
            />
          </label>
          <p className="form-message">
            Each drum below is entered separately and picks its own type (Swing or Fixed).
          </p>
          {priorReference ? (
            <aside className="form-hint">
              <strong>Previous visit for this customer{priorReference.jobReference ? ` (${priorReference.jobReference})` : ""}:</strong>{" "}
              {priorReference.drumCount} drum{priorReference.drumCount === 1 ? "" : "s"}
              {priorReference.drumTypes.length > 0
                ? ` — ${priorReference.drumTypes.map((type, index) => `Drum ${index + 1}: ${type ? drumTypeLabel(type) : "Not recorded"}`).join(", ")}`
                : ""}
              . Reference only — not applied automatically.
            </aside>
          ) : null}
        </fieldset>
      ) : responses.drumTypes ? (
        <fieldset disabled={readOnly}>
          <legend>Hose Reel Drum</legend>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={responses.drumTypes.swing}
              onChange={(event) => setResponses((current) => ({
                ...current,
                drumTypes: { ...(current.drumTypes ?? { swing: false, fixed: false }), swing: event.target.checked }
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
                drumTypes: { ...(current.drumTypes ?? { swing: false, fixed: false }), fixed: event.target.checked }
              }))}
            />
            Fixed Type
          </label>
          <p className="form-message">
            Select all applicable drum types.
          </p>
        </fieldset>
      ) : null}

      <fieldset id="hose-reel-locations" disabled={readOnly}>
        <legend>{isSchema3 ? "Hose Reel Drums" : "Hose Reel Locations"}</legend>
        {responses.rows
          .slice()
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((row, index) => (
            <section
              className={`hose-row-card ${invalidTargets.has(`hose-row-${row.rowUuid}`) ? "field-invalid" : ""}`}
              id={`hose-row-${row.rowUuid}`}
              key={row.rowUuid}
            >
              <h4>{isSchema3 ? "Drum" : "Location"} {index + 1} {row.source === "configured" ? "(configured)" : "(inspection-only)"}</h4>
              {isSchema3 ? (
                <fieldset className="drum-type-selector">
                  <legend>Drum Type *</legend>
                  {(["swing", "fixed"] as const).map((type) => (
                    <label className="radio-label" key={type}>
                      <input
                        type="radio"
                        name={`drum-type-${row.rowUuid}`}
                        value={type}
                        checked={row.drumType === type}
                        disabled={readOnly}
                        onChange={() => updateRow(row.rowUuid, { drumType: type })}
                      />
                      {drumTypeLabel(type)}
                    </label>
                  ))}
                </fieldset>
              ) : null}
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
                const result = row[field];
                const fieldPath = `hose_reel_drum.hose_reel_rows.rows.${row.rowUuid}.${definition.key}` as HoseReelV7FieldPath;
                return (
                <div className="hose-component" key={definition.key}>
                  <strong>{definition.label}</strong>
                  <ResultSelector<GoodPoor>
                    definition={definition.result}
                    label={`${definition.label} result`}
                    value={result}
                    readOnly={readOnly}
                    onChange={(result) => updateRow(row.rowUuid, { [field]: result })}
                  />
                  {isV7 && isHoseReelV7EvidenceFinding(result) ? (
                    <section>
                      <RemarksField
                        label={`${definition.label} Remark *`}
                        definition={controls.repeatableRows.remarks}
                        value={row.fieldRemarks?.[field] ?? ""}
                        readOnly={readOnly}
                        onChange={(remark) => updateRow(row.rowUuid, {
                          fieldRemarks: { ...row.fieldRemarks, [field]: remark }
                        })}
                      />
                      <HoseReelV7EvidenceField
                        record={record}
                        fieldPath={fieldPath}
                        attachment={evidenceFor(fieldPath)}
                        onChanged={refreshPhotos}
                      />
                    </section>
                  ) : null}
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
              {!readOnly && row.source === "technician" ? (
                <button
                  type="button"
                  className="secondary-command"
                  onClick={() => {
                    if (window.confirm(isSchema3 ? "Remove this Draft drum section?" : "Remove this Draft location row?")) {
                      setResponses((current) => {
                        const rows = current.rows.filter((item) => item.rowUuid !== row.rowUuid);
                        return {
                          ...current,
                          rows,
                          ...(current.schemaVersion === 3 ? { drumCount: rows.length } : {})
                        };
                      });
                    }
                  }}
                >
                  {isSchema3 ? "Remove Drum" : "Remove Row"}
                </button>
              ) : null}
            </section>
          ))}
        {!readOnly ? (
          <button type="button" className="secondary-command" onClick={() => setResponses(addHoseReelRow)}>
            {isSchema3 ? "Add Drum" : "Add Row"}
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
            Submit Inspection
          </button>
        </div>
      ) : null}
    </section>
  );
}
