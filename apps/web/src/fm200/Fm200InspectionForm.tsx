import { VisitReference } from "../jobs/VisitReference";
import { CorrectedCopyAction } from "../attachments/CorrectedCopyAction";
import { useEffect, useMemo, useState } from "react";
import { useDraftAutosave } from "../inspectionControls/useDraftAutosave";
import { inspectionSyncMessage } from "../uiPresentation";
import { overriddenLabel } from "../inspections/labelOverrides";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import { getFm200SubmitIssues } from "./fm200Repository";
import { configuredDetectorCount, normalizeDetectorRows, setDetectorRowCount } from "../co2/detectorRowCount";
import { deriveFm200InstanceProgress } from "./fm200Progress";
import {
  loadTechnicianLocationProposalDraft, newUpdateFormatDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals
} from "../jobs/technicianLocationProposalDraft";
import type {
  Fm200ChecklistResponse,
  Fm200DetectorStatus,
  Fm200MasterSystemFormInstanceRecord,
  Fm200Responses,
  Fm200Result
} from "./fm200Types";
import { collectV7SiblingEvidence, isEvidenceFinding, listV7SuppressionPhotos, v7SubmissionIssues, type V7Fm200FieldPath, type V7SiblingEvidence } from "./fm200Evidence";
import { Fm200EvidenceField } from "./Fm200EvidenceField";
import { OptionalPhotoSlot } from "../attachments/OptionalPhotoSlot";
import { isOptionalPhotoResult } from "../attachments/optionalGoodPhoto";
import { MultiResultSelector } from "../inspectionControls/MultiResultSelector";

type Props = {
  record: Fm200MasterSystemFormInstanceRecord;
  actorUserId: number;
  canUseServer: boolean;
  onBack: () => void;
  onSaveDraft: (responses: Fm200Responses) => Promise<void>;
  onSubmitLocal: (responses: Fm200Responses) => Promise<void>;
  onEditFailed: () => Promise<void>;
  onStartCorrectedCopy: () => Promise<void>;
};

export function Fm200InspectionForm({ record, actorUserId, canUseServer, onBack, onSaveDraft, onSubmitLocal, onEditFailed, onStartCorrectedCopy }: Props) {
  const systemLabel = "FM200 System";
  const [responses, setResponses] = useState(() => record.syncStatus === "Draft" ? normalizeDetectorRows(record.responses, record.inspectionSnapshot.system, record.inspectionSnapshot.instance) : record.responses);
  const [message, setMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [formatStatus, setFormatStatus] = useState<"idle" | "saving" | "pending" | "synced" | "failed">("idle");
  const [formatError, setFormatError] = useState("");
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof listV7SuppressionPhotos>>>([]);
  // G9: duplicate detection spans every location-instance of this system in the
  // Job, so the sibling evidence has to be in state next to `photos`.
  const [siblings, setSiblings] = useState<V7SiblingEvidence[]>([]);
  // CANONICAL controls — un-overridden. Drives every key, evidence `fieldPath`,
  // response wiring, submit gate and V7 branch. Never carries a customer label.
  const controls = record.inspectionSnapshot.system.resolvedControls;
  // Display-only: the frozen per-customer label for one canonical tree path,
  // else the definition label. Reads the non-synced `record.displayLabelOverrides`
  // (set from the job snapshot at record creation; a job frozen before an
  // override, or a customer with none, yields the definition label). Never
  // touches `controls`.
  const labelAt = (path: string, definitionLabel: string) =>
    overriddenLabel(record.displayLabelOverrides, path, definitionLabel);
  const issues = useMemo(
    () => showValidation
      ? [...getFm200SubmitIssues(record, responses), ...v7SubmissionIssues(record, responses, photos, siblings).map((message) => ({ section: "Evidence", message, targetId: "fm200-evidence" }))]
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

  useEffect(() => setResponses(record.syncStatus === "Draft" ? normalizeDetectorRows(record.responses, record.inspectionSnapshot.system, record.inspectionSnapshot.instance) : record.responses), [record]);
  const { submit: submitLocal } = useDraftAutosave({ record, responses, setResponses, save: onSaveDraft, submit: onSubmitLocal, enabled: record.syncStatus === "Draft" });
  useEffect(() => { if (record.masterTemplate.version === 7) { void listV7SuppressionPhotos(record.clientUuid).then(setPhotos); void collectV7SiblingEvidence(record).then(setSiblings); } else { setPhotos([]); setSiblings([]); } }, [record.clientUuid, record.groupKey, record.masterTemplate.version, record.localUpdatedAt]);
  useEffect(() => { setMessage(""); setShowValidation(false); }, [record.clientUuid]);

  function updateDetector(rowUuid: string, change: Partial<Fm200Responses["detectorRows"][number]>) {
    setResponses((current) => ({
      ...current,
      detectorRows: current.detectorRows.map((row) => row.rowUuid === rowUuid ? { ...row, ...change } : row)
    }));
  }

  function updateChecklist(
    group: "chargerAndBatteries" | "physicalOutlook" | "mainFunctionKeys",
    key: string,
    change: Partial<Fm200ChecklistResponse>
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

  async function saveAsFormat() {
    setFormatStatus("saving"); setFormatError("");
    try {
      const rows = responses.detectorRows.map((row) => ({ alarmZone: row.alarmZone, location: row.location }));
      const jobId = record.inspectionSnapshot.job.id, customerId = record.inspectionSnapshot.customer.id;
      const locationKey = record.inspectionSnapshot.instance.location.key;
      const draft = newUpdateFormatDraft(jobId, customerId, record.inspectionSnapshot.system.systemKey, locationKey, rows);
      await saveTechnicianLocationProposalDraft(draft);
      await queueTechnicianLocationProposal(draft);
      setFormatStatus("pending");
      if (canUseServer && navigator.onLine) {
        await syncPendingLocationProposals(actorUserId);
        const refreshed = await loadTechnicianLocationProposalDraft(jobId, record.inspectionSnapshot.system.systemKey, locationKey);
        setFormatStatus(refreshed?.status === "Synced" ? "synced" : refreshed?.status === "Failed" ? "failed" : "pending");
        if (refreshed?.status === "Failed") setFormatError(refreshed.lastError ?? "This format could not be submitted.");
      }
    } catch (error) {
      setFormatStatus("failed");
      setFormatError(error instanceof Error ? error.message : "This format could not be saved.");
    }
  }

  async function submit() {
    const currentIssues = [...getFm200SubmitIssues(record, responses), ...v7SubmissionIssues(record, responses, photos, siblings).map((message) => ({ section: "Evidence", message, targetId: "fm200-evidence" }))];
    setShowValidation(true);
    if (currentIssues.length) {
      window.setTimeout(() => document.getElementById(currentIssues[0].targetId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    try {
      await submitLocal();
      setShowValidation(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "FM200 form could not be submitted");
    }
  }

  function checklistSection(
    title: string,
    group: "chargerAndBatteries" | "physicalOutlook" | "mainFunctionKeys",
    definitions: typeof controls.chargerAndBatteries
  ) {
    return <fieldset disabled={readOnly}>
      <legend>{title}</legend>
      {definitions.map((definition) => {
        const shownLabel = labelAt(`${group}.${definition.key}`, definition.label);
        const evidencePath = `${group === "chargerAndBatteries" ? "charger_batteries.charger_battery_checks" : group === "physicalOutlook" ? "physical_outlook.physical_outlook_checks" : "main_function_key.function_checks"}.${definition.key}`;
        const evidenceAttachment = photos.find((photo) => photo.fieldPath === evidencePath);
        const resultValue = responses[group][definition.key]?.result;
        const refreshEvidence = async () => { setPhotos(await listV7SuppressionPhotos(record.clientUuid)); setSiblings(await collectV7SiblingEvidence(record)); };
        return (
        <section className={`hose-check-row ${invalidTargets.has(`fm200-check-${definition.key}`) ? "field-invalid" : ""}`} id={`fm200-check-${definition.key}`} key={definition.key}>
          <strong>{shownLabel}</strong>
          <ResultSelector<Fm200Result>
            definition={definition.result}
            label={`${shownLabel} result`}
            value={responses[group][definition.key]?.result ?? null}
            readOnly={readOnly}
            onChange={(result) => updateChecklist(group, definition.key, { result })}
          />
          <RemarksField systemKey="fm200_fire_suppression"
            label="Remarks"
            definition={definition.remarks}
            value={responses[group][definition.key]?.remarks ?? ""}
            readOnly={readOnly}
            onChange={(remarks) => updateChecklist(group, definition.key, { remarks })}
          />
          {record.masterTemplate.version === 7 && isEvidenceFinding(resultValue) ? <Fm200EvidenceField record={record} fieldPath={evidencePath as V7Fm200FieldPath} attachment={evidenceAttachment} onChanged={refreshEvidence} /> : null}
          {/* CR-01: a Good / N.A. result may carry ONE optional photo. It is never required and never blocks Submit. */}
          {record.masterTemplate.version === 7 && isOptionalPhotoResult(resultValue) && (!readOnly || evidenceAttachment) ? <OptionalPhotoSlot inspectionClientUuid={record.clientUuid} attachment={evidenceAttachment} editable={!readOnly} onChanged={refreshEvidence}><Fm200EvidenceField record={record} fieldPath={evidencePath as V7Fm200FieldPath} attachment={evidenceAttachment} onChanged={refreshEvidence} /></OptionalPhotoSlot> : null}
        </section>
      );
      })}
    </fieldset>;
  }

  return <section className="hose-reel-form co2-form" aria-labelledby="fm200-form-title">
      <button type="button" className="secondary-command" onClick={onBack}>Back to {systemLabel} Locations</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow"><VisitReference job={record.inspectionSnapshot.job} /></p>
        <h2 id="fm200-form-title">{systemLabel}</h2>
        <p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p>
        <p>{record.inspectionSnapshot.instance.location.displayName} · {record.inspectionSnapshot.instance.zone?.displayName ?? "Unzoned"}</p>
      </div>
      <strong className={`inspection-status status-${record.syncStatus.toLowerCase()}`} role="status">{record.syncStatus === "Draft" ? deriveFm200InstanceProgress(record) : inspectionSyncMessage(record.syncStatus)}</strong>
    </header>
    {record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}
    {grouped.length ? <section className="validation-summary" aria-live="polite"><h3>Complete before submitting</h3>{grouped.map(([section, messages]) => <div key={section}><strong>{section}</strong><ul>{messages.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</section> : null}
    {message ? <p className="form-message">{message}</p> : null}

    <fieldset disabled={readOnly}>
      <legend>{systemLabel} Control Panel</legend>
      <label id="fm200-panel-location" className={invalidTargets.has("fm200-panel-location") ? "field-invalid" : ""}>
        {labelAt("controlPanelLocation", controls.controlPanelLocation.label)}
        <input maxLength={controls.controlPanelLocation.maxLength} value={responses.controlPanelLocation} onChange={(event) => setResponses((current) => ({ ...current, controlPanelLocation: event.target.value }))} />
      </label>
    </fieldset>

    <fieldset id="fm200-detectors" disabled={readOnly}>
      <legend>Detector Table</legend>
      <label>
        Number of detectors inspected
        <input type="number" min={Math.max(1, configuredDetectorCount(record.inspectionSnapshot.system, record.inspectionSnapshot.instance))} max={controls.detectorRows.maximum} inputMode="numeric" value={responses.detectorRows.length}
          onChange={(event) => setResponses((current) => setDetectorRowCount(current, record.inspectionSnapshot.system, record.inspectionSnapshot.instance, Number(event.target.value), controls.detectorRows.maximum))} />
      </label>
      {!readOnly ? <p className="form-message">Configured rows stay in place. Clear a filled technician row before reducing the count.</p> : null}
      {!readOnly ? <div className="inline-actions">
        <button type="button" className="secondary-command" disabled={formatStatus === "saving"} onClick={() => void saveAsFormat()}>
          {formatStatus === "saving" ? "Saving format…" : "Save as format for next visit"}
        </button>
        {formatStatus === "pending" ? <span className="support-metadata">Saved on this device, pending sync.</span> : null}
        {formatStatus === "synced" ? <span className="support-metadata">Submitted for Admin review.</span> : null}
        {formatStatus === "failed" ? <span className="form-message" role="alert">{formatError}</span> : null}
      </div> : null}
      {responses.detectorRows.slice().sort((left, right) => left.displaySequence - right.displaySequence).map((row, index) => (
        <section className={`hose-row-card ${invalidTargets.has(`fm200-detector-${row.rowUuid}`) ? "field-invalid" : ""}`} id={`fm200-detector-${row.rowUuid}`} key={row.rowUuid}>
          <h3>Detector Row {index + 1}</h3>
          <label>{labelAt("detectorRows.alarmZone", controls.detectorRows.alarmZone.label)}<input maxLength={controls.detectorRows.alarmZone.maxLength} value={row.alarmZone} onChange={(event) => updateDetector(row.rowUuid, { alarmZone: event.target.value })} /></label>
          <label>{labelAt("detectorRows.location", controls.detectorRows.location.label)}<input maxLength={controls.detectorRows.location.maxLength} value={row.location} onChange={(event) => updateDetector(row.rowUuid, { location: event.target.value })} /></label>
          {(() => { const heatLabel = labelAt("detectorRows.heatDetector", controls.detectorRows.heatDetector.label); return <div><strong>{heatLabel}</strong>{record.masterTemplate.version === 7 ? <MultiResultSelector<Fm200DetectorStatus> definition={controls.detectorRows.heatDetector.result} label={`${heatLabel} status`} value={Array.isArray(row.heatDetectorStatus) ? row.heatDetectorStatus : null} readOnly={readOnly} onChange={(heatDetectorStatus) => updateDetector(row.rowUuid, { heatDetectorStatus })} /> : <ResultSelector<Fm200DetectorStatus> definition={controls.detectorRows.heatDetector.result} label={`${heatLabel} status`} value={row.heatDetectorStatus as Fm200DetectorStatus | null} readOnly={readOnly} onChange={(heatDetectorStatus) => updateDetector(row.rowUuid, { heatDetectorStatus })} />}</div>; })()}
          {(() => { const smokeLabel = labelAt("detectorRows.smokeDetector", controls.detectorRows.smokeDetector.label); return <div><strong>{smokeLabel}</strong>{record.masterTemplate.version === 7 ? <MultiResultSelector<Fm200DetectorStatus> definition={controls.detectorRows.smokeDetector.result} label={`${smokeLabel} status`} value={Array.isArray(row.smokeDetectorStatus) ? row.smokeDetectorStatus : null} readOnly={readOnly} onChange={(smokeDetectorStatus) => updateDetector(row.rowUuid, { smokeDetectorStatus })} /> : <ResultSelector<Fm200DetectorStatus> definition={controls.detectorRows.smokeDetector.result} label={`${smokeLabel} status`} value={row.smokeDetectorStatus as Fm200DetectorStatus | null} readOnly={readOnly} onChange={(smokeDetectorStatus) => updateDetector(row.rowUuid, { smokeDetectorStatus })} />}</div>; })()}
          <RemarksField systemKey="fm200_fire_suppression" label="Remarks" definition={controls.detectorRows.remarks} value={row.remarks} readOnly={readOnly} onChange={(remarks) => updateDetector(row.rowUuid, { remarks })} />
        </section>
      ))}
    </fieldset>

    {checklistSection("Charger & Batteries", "chargerAndBatteries", controls.chargerAndBatteries)}
    {checklistSection("Physical Outlook", "physicalOutlook", controls.physicalOutlook)}
    {checklistSection("Main Function Keys", "mainFunctionKeys", controls.mainFunctionKeys)}
    <fieldset id="fm200-comments" className={invalidTargets.has("fm200-comments") ? "field-invalid" : ""} disabled={readOnly}>
      <legend>System Comments</legend>
      <RemarksField systemKey="fm200_fire_suppression" label="Comments" definition={controls.comments} value={responses.comments} readOnly={readOnly} onChange={(comments) => setResponses((current) => ({ ...current, comments }))} />
    </fieldset>

    {record.syncStatus === "Draft" ? <div className="form-actions sticky-form-actions"><button type="button" className="secondary-command" onClick={() => void save()}>Save Draft</button><button type="button" onClick={() => void submit()}>Submit Inspection</button></div> : null}
    {record.syncStatus === "Failed" || record.syncStatus === "Conflict" ? <button type="button" onClick={() => void onEditFailed()}>Return to Draft</button> : null}<CorrectedCopyAction clientUuid={record.clientUuid} syncStatus={record.syncStatus} localUpdatedAt={record.localUpdatedAt} onStart={onStartCorrectedCopy} />
  </section>;
}
