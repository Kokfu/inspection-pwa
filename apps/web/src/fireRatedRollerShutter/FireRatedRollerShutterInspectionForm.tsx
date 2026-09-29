import { useEffect, useState } from "react";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import { RemarksField } from "../inspectionControls/RemarksField";
import { FireRatedRollerShutterV7EvidenceField } from "./FireRatedRollerShutterV7EvidenceField";
import {
  loadTechnicianLocationProposalDraft, newUpdateFormatDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals
} from "../jobs/technicianLocationProposalDraft";
import { submitIssues } from "./fireRatedRollerShutterRepository";
import { fireRatedRollerShutterRowColumns, type FireRatedRollerShutterInspectionRecord, type FireRatedRollerShutterResponses, type FireRatedRollerShutterResult } from "./fireRatedRollerShutterTypes";
import { isFireRatedRollerShutterV7EvidenceFinding, listFireRatedRollerShutterV7Photos, resolveFireRatedRollerShutterRowResultDefinitions, type FireRatedRollerShutterV7FieldPath } from "./fireRatedRollerShutterV7Evidence";

const remarks = { policy: "optional" as const, maxLength: 2000 };

export function FireRatedRollerShutterInspectionForm({ record, actorUserId, canUseServer, onBack, onSaveDraft, onSubmitLocal, onEditFailed }: { record: FireRatedRollerShutterInspectionRecord; actorUserId: number; canUseServer: boolean; onBack: () => void; onSaveDraft: (responses: FireRatedRollerShutterResponses) => Promise<void>; onSubmitLocal: (responses: FireRatedRollerShutterResponses) => Promise<void>; onEditFailed: () => Promise<void> }) {
  const [responses, setResponses] = useState(record.responses); const [message, setMessage] = useState(""); const [show, setShow] = useState(false); const [photos, setPhotos] = useState<Awaited<ReturnType<typeof listFireRatedRollerShutterV7Photos>>>([]);
  const [formatStatus, setFormatStatus] = useState<"idle" | "saving" | "pending" | "synced" | "failed">("idle");
  const [formatError, setFormatError] = useState("");
  const [formatCorrections, setFormatCorrections] = useState<Record<string, { assetReference?: string; locationText?: string }>>({});
  const rowDefinitions = resolveFireRatedRollerShutterRowResultDefinitions(record.inspectionSnapshot.system.definition);
  useEffect(() => setResponses(record.responses), [record]);
  useEffect(() => { void listFireRatedRollerShutterV7Photos(record.clientUuid).then(setPhotos); }, [record.clientUuid, record.localUpdatedAt]);
  const readOnly = record.syncStatus !== "Draft";
  const issues = show ? submitIssues(record, responses, photos) : [];
  const updateRow = (id: string, change: Partial<FireRatedRollerShutterResponses["rows"][number]>) => setResponses((current) => ({ ...current, rows: current.rows.map((row) => row.rowUuid === id ? { ...row, ...change } : row) }));
  const addRow = () => setResponses((current) => ({ ...current, rows: [...current.rows, { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "", autoAlarmModeResult: null, manualModeResult: null, remarks: "", fieldRemarks: {}, sortOrder: current.rows.length + 1 }] }));
  const evidenceFor = (fieldPath: string) => photos.find((photo) => photo.fieldPath === fieldPath);
  const refreshPhotos = async () => setPhotos(await listFireRatedRollerShutterV7Photos(record.clientUuid));
  async function saveAsFormat() {
    setFormatStatus("saving"); setFormatError("");
    try {
      const rows = responses.rows.map((row) => ({
        assetReference: formatCorrections[row.rowUuid]?.assetReference ?? row.assetReference,
        locationText: formatCorrections[row.rowUuid]?.locationText ?? row.locationText
      }));
      if (!rows.length || rows.length > 250 || rows.some((row) => !row.locationText.trim())) throw new Error("Add at least one Shutter with a location before saving a format.");
      const jobId = record.inspectionSnapshot.job.id, customerId = record.inspectionSnapshot.customer.id;
      const locationKey = "general";
      const draft = newUpdateFormatDraft(jobId, customerId, record.systemKey, locationKey, rows);
      await saveTechnicianLocationProposalDraft(draft);
      await queueTechnicianLocationProposal(draft);
      setFormatStatus("pending");
      if (canUseServer && navigator.onLine) {
        await syncPendingLocationProposals(actorUserId);
        const refreshed = await loadTechnicianLocationProposalDraft(jobId, record.systemKey, locationKey);
        setFormatStatus(refreshed?.status === "Synced" ? "synced" : refreshed?.status === "Failed" ? "failed" : "pending");
        if (refreshed?.status === "Failed") setFormatError(refreshed.lastError ?? "This format could not be submitted.");
      }
    } catch (error) {
      setFormatStatus("failed");
      setFormatError(error instanceof Error ? error.message : "This format could not be saved.");
    }
  }
  return <section className="hose-reel-form" aria-labelledby="roller-shutter-title"><button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button><header className="inspection-context"><div><p className="eyebrow">{record.inspectionSnapshot.job.reference}</p><h2 id="roller-shutter-title">Fire Rated Roller Shutter System</h2><p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p><p>{record.inspectionSnapshot.job.title}</p></div><strong>{record.syncStatus === "Synced" ? "Inspection Complete" : record.syncStatus === "Pending" ? "Waiting to Sync" : record.syncStatus === "Failed" || record.syncStatus === "Conflict" ? "Needs Attention" : record.syncStatus === "Syncing" ? "Syncing…" : record.syncStatus}</strong></header>{record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}{message ? <p className="form-message">{message}</p> : null}{show && issues.length ? <section className="validation-summary" role="alert"><h3>Cannot submit yet</h3><ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></section> : null}{["Failed", "Conflict"].includes(record.syncStatus) ? <button type="button" onClick={() => void onEditFailed()}>Edit Failed Inspection</button> : null}
    <fieldset disabled={readOnly}><legend>Inspection Details</legend>
      <label>Date Tested<input type="date" value={responses.dateTested} onChange={(event) => setResponses((current) => ({ ...current, dateTested: event.target.value }))} /></label>
      <label>Zone<input maxLength={200} value={responses.zone} onChange={(event) => setResponses((current) => ({ ...current, zone: event.target.value }))} /></label>
      <label>Inspected By<input maxLength={200} value={responses.inspectedBy} onChange={(event) => setResponses((current) => ({ ...current, inspectedBy: event.target.value }))} /></label>
    </fieldset>
    <fieldset disabled={readOnly}><legend>Roller Shutter Schedule</legend>{responses.rows.map((row, index) => { const configured = row.source === "configured"; return <section className="hose-row-card" key={row.rowUuid}><h4>Shutter {index + 1}</h4><label>Asset Reference<input maxLength={200} value={row.assetReference} disabled={readOnly || configured} onChange={(event) => updateRow(row.rowUuid, { assetReference: event.target.value })} /></label><label>Location<input maxLength={300} value={row.locationText} disabled={readOnly || configured} onChange={(event) => updateRow(row.rowUuid, { locationText: event.target.value })} /></label>{fireRatedRollerShutterRowColumns.map(([field, wireKey, label]) => { const definition = rowDefinitions?.[field]; const result = row[field] as FireRatedRollerShutterResult | null; const finding = isFireRatedRollerShutterV7EvidenceFinding(result); const fieldPath = `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${row.rowUuid}.${wireKey}` as FireRatedRollerShutterV7FieldPath; return <div className="hose-component" key={field}><strong>{label}</strong>{definition ? <ResultSelector<FireRatedRollerShutterResult> definition={definition} label={`${label} result`} value={result} readOnly={readOnly} onChange={(value) => updateRow(row.rowUuid, { [field]: value })} /> : <p className="error-text">Fire Rated Roller Shutter V7 definition is unavailable.</p>}{finding ? <section><RemarksField label={`${label} Remark *`} definition={remarks} value={row.fieldRemarks?.[field] ?? ""} readOnly={readOnly} onChange={(value) => updateRow(row.rowUuid, { fieldRemarks: { ...row.fieldRemarks, [field]: value } })} /><FireRatedRollerShutterV7EvidenceField record={record} fieldPath={fieldPath} attachment={evidenceFor(fieldPath)} onChanged={refreshPhotos} /></section> : null}</div>; })}<RemarksField label="Remarks" definition={remarks} value={row.remarks} readOnly={readOnly} onChange={(value) => updateRow(row.rowUuid, { remarks: value })} />{!readOnly && row.source === "technician" ? <button type="button" className="secondary-command" onClick={() => setResponses((current) => ({ ...current, rows: current.rows.filter((candidate) => candidate.rowUuid !== row.rowUuid).map((candidate, rowIndex) => ({ ...candidate, sortOrder: rowIndex + 1 })) }))}>Remove Row</button> : null}</section>; })}{!readOnly ? <button type="button" className="secondary-command" onClick={addRow}>Add Row</button> : null}
      {!readOnly && responses.rows.some((row) => row.source === "configured") ? <section className="report-summary" aria-label="Correct format for next visit"><h3>Correct format for next visit</h3><p>These changes are proposed for future visits. The inspection keeps its frozen row labels.</p>{responses.rows.filter((row) => row.source === "configured").map((row, index) => <div key={row.rowUuid}><label>Shutter {index + 1} format reference<input maxLength={200} value={formatCorrections[row.rowUuid]?.assetReference ?? row.assetReference} onChange={(event) => { setFormatCorrections((current) => ({ ...current, [row.rowUuid]: { ...current[row.rowUuid], assetReference: event.target.value } })); setFormatStatus("idle"); }} /></label><label>Shutter {index + 1} format location<input maxLength={300} value={formatCorrections[row.rowUuid]?.locationText ?? row.locationText} onChange={(event) => { setFormatCorrections((current) => ({ ...current, [row.rowUuid]: { ...current[row.rowUuid], locationText: event.target.value } })); setFormatStatus("idle"); }} /></label></div>)}</section> : null}
      {!readOnly ? <div className="inline-actions"><button type="button" className="secondary-command" disabled={formatStatus === "saving"} onClick={() => void saveAsFormat()}>{formatStatus === "saving" ? "Saving format…" : "Save as format for next visit"}</button>{formatStatus === "pending" ? <span className="support-metadata">Saved on this device, pending sync.</span> : null}{formatStatus === "synced" ? <span className="support-metadata">Submitted for Supervisor review.</span> : null}{formatStatus === "failed" ? <span className="form-message" role="alert">{formatError}</span> : null}</div> : null}
    </fieldset>
    <fieldset disabled={readOnly}><legend>Comments</legend><RemarksField label="Comments" definition={{ policy: "optional", maxLength: 4000 }} value={responses.comments} readOnly={readOnly} onChange={(comments) => setResponses((current) => ({ ...current, comments }))} /></fieldset>
    {!readOnly ? <div className="form-actions sticky-form-actions"><button type="button" className="secondary-command" onClick={() => void onSaveDraft(responses).then(() => setMessage("Draft saved on this device.")).catch((error) => setMessage(error.message))}>Save Draft</button><button type="button" onClick={() => { setShow(true); if (!submitIssues(record, responses, photos).length) void onSubmitLocal(responses).catch((error) => setMessage(error.message)); }}>Submit Inspection</button></div> : null}
  </section>;
}
