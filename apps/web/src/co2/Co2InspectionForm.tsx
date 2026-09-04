import { useEffect, useMemo, useState } from "react";
import { inspectionSyncMessage } from "../uiPresentation";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import { addCo2DetectorRow, getCo2SubmitIssues } from "./co2Repository";
import { deriveCo2InstanceProgress } from "./co2Progress";
import type {
  Co2ChecklistResponse,
  Co2Responses,
  Co2Result,
  DetectorStatus,
  MasterSystemFormInstanceRecord
} from "./co2Types";
import { collectV7SiblingEvidence, isEvidenceFinding, listV7SuppressionPhotos, v7SubmissionIssues, type V7SiblingEvidence, type V7SuppressionFieldPath } from "./v7Evidence";
import { V7EvidenceField } from "./V7EvidenceField";
import { MultiResultSelector } from "../inspectionControls/MultiResultSelector";

type Props = {
  record: MasterSystemFormInstanceRecord;
  onBack: () => void;
  onSaveDraft: (responses: Co2Responses) => Promise<void>;
  onSubmitLocal: (responses: Co2Responses) => Promise<void>;
  onEditFailed: () => Promise<void>;
};

export function Co2InspectionForm({ record, onBack, onSaveDraft, onSubmitLocal, onEditFailed }: Props) {
  const systemLabel = record.systemKey === "wet_chemical" ? "Wet Chemical" : "CO2";
  const [responses, setResponses] = useState(record.responses);
  const [message, setMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof listV7SuppressionPhotos>>>([]);
  // G9: duplicate detection spans every location-instance of this system in the
  // Job, so the sibling evidence has to be in state next to `photos`.
  const [siblings, setSiblings] = useState<V7SiblingEvidence[]>([]);
  const controls = record.inspectionSnapshot.system.resolvedControls;
  const issues = useMemo(
    () => showValidation
      ? [...getCo2SubmitIssues(record, responses), ...v7SubmissionIssues(record, responses, photos, siblings).map((message) => ({ section: "Evidence", message, targetId: "co2-evidence" }))]
      : [],
    [record, responses, photos, siblings, showValidation]
  );
  const invalidTargets = useMemo(() => new Set(issues.map((issue) => issue.targetId)), [issues]);
  const grouped = useMemo(() => {
    const result = new Map<string, string[]>();
    issues.forEach((issue) => result.set(issue.section, [...(result.get(issue.section) ?? []), issue.message]));
    return [...result.entries()];
  }, [issues]);
  const readOnly = record.syncStatus !== "Draft";

  useEffect(() => setResponses(record.responses), [record]);
  useEffect(() => { if (record.masterTemplate.version === 7) { void listV7SuppressionPhotos(record.clientUuid).then(setPhotos); void collectV7SiblingEvidence(record).then(setSiblings); } else { setPhotos([]); setSiblings([]); } }, [record.clientUuid, record.groupKey, record.masterTemplate.version, record.localUpdatedAt]);
  useEffect(() => { setMessage(""); setShowValidation(false); }, [record.clientUuid]);

  function updateDetector(rowUuid: string, change: Partial<Co2Responses["detectorRows"][number]>) {
    setResponses((current) => ({
      ...current,
      detectorRows: current.detectorRows.map((row) => row.rowUuid === rowUuid ? { ...row, ...change } : row)
    }));
  }

  function updateChecklist(
    group: "chargerAndBatteries" | "physicalOutlook" | "mainFunctionKeys",
    key: string,
    change: Partial<Co2ChecklistResponse>
  ) {
    setResponses((current) => ({
      ...current,
      [group]: { ...current[group], [key]: { ...current[group][key], ...change } }
    }));
  }

  async function save() {
    try {
      await onSaveDraft(responses);
      setMessage(inspectionSyncMessage("Draft"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft could not be saved");
    }
  }

  async function submit() {
    const currentIssues = [...getCo2SubmitIssues(record, responses), ...v7SubmissionIssues(record, responses, photos, siblings).map((message) => ({ section: "Evidence", message, targetId: "co2-evidence" }))];
    setShowValidation(true);
    if (currentIssues.length) {
      window.setTimeout(() => document.getElementById(currentIssues[0].targetId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    try {
      await onSubmitLocal(responses);
      setShowValidation(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CO2 form could not be submitted");
    }
  }

  function checklistSection(
    title: string,
    group: "chargerAndBatteries" | "physicalOutlook" | "mainFunctionKeys",
    definitions: typeof controls.chargerAndBatteries
  ) {
    return <fieldset disabled={readOnly}>
      <legend>{title}</legend>
      {definitions.map((definition) => (
        <section className={`hose-check-row ${invalidTargets.has(`co2-check-${definition.key}`) ? "field-invalid" : ""}`} id={`co2-check-${definition.key}`} key={definition.key}>
          <strong>{definition.label}</strong>
          <ResultSelector<Co2Result>
            definition={definition.result}
            label={`${definition.label} result`}
            value={responses[group][definition.key]?.result ?? null}
            readOnly={readOnly}
            onChange={(result) => updateChecklist(group, definition.key, { result })}
          />
          <RemarksField
            label="Remarks"
            definition={definition.remarks}
            value={responses[group][definition.key]?.remarks ?? ""}
            readOnly={readOnly}
            onChange={(remarks) => updateChecklist(group, definition.key, { remarks })}
          />
          {record.masterTemplate.version === 7 && isEvidenceFinding(responses[group][definition.key]?.result) ? <V7EvidenceField record={record} fieldPath={`${group === "chargerAndBatteries" ? "charger_batteries.charger_battery_checks" : group === "physicalOutlook" ? "physical_outlook.physical_outlook_checks" : "main_function_key.function_checks"}.${definition.key}` as V7SuppressionFieldPath} attachment={photos.find((photo) => photo.fieldPath === `${group === "chargerAndBatteries" ? "charger_batteries.charger_battery_checks" : group === "physicalOutlook" ? "physical_outlook.physical_outlook_checks" : "main_function_key.function_checks"}.${definition.key}`)} onChanged={async () => { setPhotos(await listV7SuppressionPhotos(record.clientUuid)); setSiblings(await collectV7SiblingEvidence(record)); }} /> : null}
        </section>
      ))}
    </fieldset>;
  }

  return <section className="hose-reel-form co2-form" aria-labelledby="co2-form-title">
      <button type="button" className="secondary-command" onClick={onBack}>Back to {systemLabel} Locations</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow">{record.inspectionSnapshot.job.reference}</p>
        <h2 id="co2-form-title">{systemLabel}</h2>
        <p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p>
        <p>{record.inspectionSnapshot.instance.location.displayName} · {record.inspectionSnapshot.instance.zone?.displayName ?? "Unzoned"}</p>
      </div>
      <strong className={`inspection-status status-${record.syncStatus.toLowerCase()}`} role="status">{record.syncStatus === "Draft" ? deriveCo2InstanceProgress(record) : inspectionSyncMessage(record.syncStatus)}</strong>
    </header>
    {record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}
    {grouped.length ? <section className="validation-summary" aria-live="polite"><h3>Complete before submitting</h3>{grouped.map(([section, messages]) => <div key={section}><strong>{section}</strong><ul>{messages.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</section> : null}
    {message ? <p className="form-message">{message}</p> : null}

    <fieldset disabled={readOnly}>
      <legend>{systemLabel} Control Panel</legend>
      <label id="co2-panel-location" className={invalidTargets.has("co2-panel-location") ? "field-invalid" : ""}>
        {controls.controlPanelLocation.label}
        <input maxLength={controls.controlPanelLocation.maxLength} value={responses.controlPanelLocation} onChange={(event) => setResponses((current) => ({ ...current, controlPanelLocation: event.target.value }))} />
      </label>
    </fieldset>

    <fieldset id="co2-detectors" disabled={readOnly}>
      <legend>Detector Table</legend>
      {responses.detectorRows.slice().sort((left, right) => left.displaySequence - right.displaySequence).map((row, index) => (
        <section className={`hose-row-card ${invalidTargets.has(`co2-detector-${row.rowUuid}`) ? "field-invalid" : ""}`} id={`co2-detector-${row.rowUuid}`} key={row.rowUuid}>
          <h3>Detector Row {index + 1}</h3>
          <label>{controls.detectorRows.alarmZone.label}<input maxLength={controls.detectorRows.alarmZone.maxLength} value={row.alarmZone} onChange={(event) => updateDetector(row.rowUuid, { alarmZone: event.target.value })} /></label>
          <label>{controls.detectorRows.location.label}<input maxLength={controls.detectorRows.location.maxLength} value={row.location} onChange={(event) => updateDetector(row.rowUuid, { location: event.target.value })} /></label>
          <div><strong>{controls.detectorRows.heatDetector.label}</strong>{record.masterTemplate.version === 7 ? <MultiResultSelector<DetectorStatus> definition={controls.detectorRows.heatDetector.result} label={`${controls.detectorRows.heatDetector.label} status`} value={Array.isArray(row.heatDetectorStatus) ? row.heatDetectorStatus : null} readOnly={readOnly} onChange={(heatDetectorStatus) => updateDetector(row.rowUuid, { heatDetectorStatus })} /> : <ResultSelector<DetectorStatus> definition={controls.detectorRows.heatDetector.result} label={`${controls.detectorRows.heatDetector.label} status`} value={row.heatDetectorStatus as DetectorStatus | null} readOnly={readOnly} onChange={(heatDetectorStatus) => updateDetector(row.rowUuid, { heatDetectorStatus })} />}</div>
          <div><strong>{controls.detectorRows.smokeDetector.label}</strong>{record.masterTemplate.version === 7 ? <MultiResultSelector<DetectorStatus> definition={controls.detectorRows.smokeDetector.result} label={`${controls.detectorRows.smokeDetector.label} status`} value={Array.isArray(row.smokeDetectorStatus) ? row.smokeDetectorStatus : null} readOnly={readOnly} onChange={(smokeDetectorStatus) => updateDetector(row.rowUuid, { smokeDetectorStatus })} /> : <ResultSelector<DetectorStatus> definition={controls.detectorRows.smokeDetector.result} label={`${controls.detectorRows.smokeDetector.label} status`} value={row.smokeDetectorStatus as DetectorStatus | null} readOnly={readOnly} onChange={(smokeDetectorStatus) => updateDetector(row.rowUuid, { smokeDetectorStatus })} />}</div>
          <RemarksField label="Remarks" definition={controls.detectorRows.remarks} value={row.remarks} readOnly={readOnly} onChange={(remarks) => updateDetector(row.rowUuid, { remarks })} />
          {!readOnly ? <button type="button" className="secondary-command" onClick={() => {
            if (window.confirm("Remove this Draft detector row?")) setResponses((current) => ({ ...current, detectorRows: current.detectorRows.filter((item) => item.rowUuid !== row.rowUuid) }));
          }}>Remove Row</button> : null}
        </section>
      ))}
      {!readOnly ? <button type="button" className="secondary-command" disabled={responses.detectorRows.length >= controls.detectorRows.maximum} onClick={() => setResponses(addCo2DetectorRow)}>Add Detector Row</button> : null}
    </fieldset>

    {checklistSection("Charger & Batteries", "chargerAndBatteries", controls.chargerAndBatteries)}
    {checklistSection("Physical Outlook", "physicalOutlook", controls.physicalOutlook)}
    {checklistSection("Main Function Keys", "mainFunctionKeys", controls.mainFunctionKeys)}
    <fieldset id="co2-comments" className={invalidTargets.has("co2-comments") ? "field-invalid" : ""} disabled={readOnly}>
      <legend>System Comments</legend>
      <RemarksField label="Comments" definition={controls.comments} value={responses.comments} readOnly={readOnly} onChange={(comments) => setResponses((current) => ({ ...current, comments }))} />
    </fieldset>

    {record.syncStatus === "Draft" ? <div className="form-actions sticky-form-actions"><button type="button" className="secondary-command" onClick={() => void save()}>Save Draft</button><button type="button" onClick={() => void submit()}>Submit Inspection</button></div> : null}
    {record.syncStatus === "Failed" || record.syncStatus === "Conflict" ? <button type="button" onClick={() => void onEditFailed()}>Return to Draft</button> : null}
  </section>;
}
