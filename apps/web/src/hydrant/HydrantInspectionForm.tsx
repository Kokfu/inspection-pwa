import { CorrectedCopyAction } from "../attachments/CorrectedCopyAction";
import { useEffect, useState } from "react";
import { useDraftAutosave } from "../inspectionControls/useDraftAutosave";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import { RemarksField } from "../inspectionControls/RemarksField";
import { HydrantV7EvidenceField } from "./HydrantV7EvidenceField";
import {
  loadTechnicianLocationProposalDraft, newUpdateFormatDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals
} from "../jobs/technicianLocationProposalDraft";
import { submitIssues } from "./hydrantRepository";
import { hydrantResultColumns, type HydrantInspectionRecord, type HydrantResponses, type HydrantResult } from "./hydrantTypes";
import { historicalHydrantResultDefinition, isHydrantV7EvidenceFinding, listHydrantV7Photos, resolveHydrantV7ResultDefinitions, type HydrantV7FieldPath } from "./hydrantV7Evidence";

const remarks = { policy: "optional" as const, maxLength: 2000 };
const historicalResult = historicalHydrantResultDefinition;
type FormatStatus = "idle" | "saving" | "pending" | "synced" | "failed";

export function HydrantInspectionForm({ record, actorUserId, canUseServer, onBack, onSaveDraft, onSubmitLocal, onEditFailed, onStartCorrectedCopy }: { record: HydrantInspectionRecord; actorUserId: number; canUseServer: boolean; onBack: () => void; onSaveDraft: (responses: HydrantResponses) => Promise<void>; onSubmitLocal: (responses: HydrantResponses) => Promise<void>; onEditFailed: () => Promise<void>; onStartCorrectedCopy: () => Promise<void> }) {
  const [responses, setResponses] = useState(record.responses); const [message, setMessage] = useState(""); const [show, setShow] = useState(false); const [photos, setPhotos] = useState<Awaited<ReturnType<typeof listHydrantV7Photos>>>([]);
  const [formatStatus, setFormatStatus] = useState<Record<string, FormatStatus>>({});
  const [formatError, setFormatError] = useState<Record<string, string>>({});
  const isV7 = record.masterTemplate.version === 7;
  const v7Definitions = isV7 ? resolveHydrantV7ResultDefinitions(record.inspectionSnapshot.system.definition) : undefined;
  useEffect(() => setResponses(record.responses), [record]);
  const { submit: submitLocal } = useDraftAutosave({ record, responses, setResponses, save: onSaveDraft, submit: onSubmitLocal, enabled: record.syncStatus === "Draft" });
  useEffect(() => { if (isV7) void listHydrantV7Photos(record.clientUuid).then(setPhotos); else setPhotos([]); }, [record.clientUuid, record.localUpdatedAt, isV7]);
  const readOnly = record.syncStatus !== "Draft";
  const issues = show ? submitIssues(record, responses, photos) : [];
  const update = (id: string, change: Partial<HydrantResponses["rows"][number]>) => setResponses((current) => ({ ...current, rows: current.rows.map((row) => row.rowUuid === id ? { ...row, ...change } : row) }));
  const add = () => setResponses((current) => ({ ...current, rows: [...current.rows, { rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "", canvasHose1Result: null, canvasHose2Result: null, diffuserNozzleResult: null, landingValveResult: null, landingValveHandleResult: null, hoseCabinetResult: null, keyLockResult: null, remarks: "", ...(isV7 ? { fieldRemarks: {} } : {}), sortOrder: current.rows.length + 1 }] }));
  const evidenceFor = (fieldPath: string) => photos.find((photo) => photo.fieldPath === fieldPath);
  const refreshPhotos = async () => setPhotos(await listHydrantV7Photos(record.clientUuid));
  async function saveAsFormat(locationId: string, locationKey: string) {
    setFormatStatus((current) => ({ ...current, [locationId]: "saving" })); setFormatError((current) => ({ ...current, [locationId]: "" }));
    try {
      const rows = responses.rows.filter((row) => row.configuredLocationId === locationId).map((row) => ({ assetReference: row.assetReference, locationText: row.locationText }));
      if (!rows.length || rows.length > 500 || rows.some((row) => !row.locationText.trim() || row.locationText.length > 300 || row.assetReference.length > 200)) {
        throw new Error("Complete this location's rows with a valid Location before saving a format.");
      }
      const jobId = record.inspectionSnapshot.job.id, customerId = record.inspectionSnapshot.customer.id;
      const draft = newUpdateFormatDraft(jobId, customerId, record.systemKey, locationKey, rows);
      await saveTechnicianLocationProposalDraft(draft);
      await queueTechnicianLocationProposal(draft);
      setFormatStatus((current) => ({ ...current, [locationId]: "pending" }));
      if (canUseServer && navigator.onLine) {
        await syncPendingLocationProposals(actorUserId);
        const refreshed = await loadTechnicianLocationProposalDraft(jobId, record.systemKey, locationKey);
        setFormatStatus((current) => ({ ...current, [locationId]: refreshed?.status === "Synced" ? "synced" : refreshed?.status === "Failed" ? "failed" : "pending" }));
        if (refreshed?.status === "Failed") setFormatError((current) => ({ ...current, [locationId]: refreshed.lastError ?? "This format could not be submitted." }));
      }
    } catch (error) {
      setFormatStatus((current) => ({ ...current, [locationId]: "failed" }));
      setFormatError((current) => ({ ...current, [locationId]: error instanceof Error ? error.message : "This format could not be saved." }));
    }
  }
  return <section className="hose-reel-form" aria-labelledby="hydrant-title"><button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button><header className="inspection-context"><div><p className="eyebrow">{record.inspectionSnapshot.job.reference}</p><h2 id="hydrant-title">Hydrant System</h2><p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p><p>{record.inspectionSnapshot.job.title}</p></div><strong>{record.syncStatus === "Synced" ? "Inspection Complete" : record.syncStatus === "Pending" ? "Waiting to Sync" : record.syncStatus === "Failed" || record.syncStatus === "Conflict" ? "Needs Attention" : record.syncStatus === "Syncing" ? "Syncing…" : record.syncStatus}</strong></header>{record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}{message ? <p className="form-message">{message}</p> : null}{show && issues.length ? <section className="validation-summary" role="alert"><h3>Cannot submit yet</h3><ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></section> : null}{["Failed", "Conflict"].includes(record.syncStatus) ? <button type="button" onClick={() => void onEditFailed()}>Edit Failed Inspection</button> : null}<CorrectedCopyAction clientUuid={record.clientUuid} syncStatus={record.syncStatus} localUpdatedAt={record.localUpdatedAt} onStart={onStartCorrectedCopy} /><fieldset disabled={readOnly}><legend>Hydrant Type</legend><select aria-label="Hydrant Type" value={responses.hydrantType ?? ""} onChange={(event) => setResponses((current) => ({ ...current, hydrantType: event.target.value === "" ? null : event.target.value as HydrantResponses["hydrantType"] }))}><option value="">Select type</option><option value="pressurize">Pressurize</option><option value="meter">Meter</option><option value="public">Public</option></select></fieldset><fieldset disabled={readOnly}><legend>Hydrant Location Rows</legend>{responses.rows.map((row, index) => { return <section className="hose-row-card" key={row.rowUuid}><h4>Location {index + 1}</h4><label>Location<input value={row.locationText} disabled={readOnly} onChange={(event) => update(row.rowUuid, { locationText: event.target.value })} /></label><label>No. / Reference<input value={row.assetReference} disabled={readOnly} onChange={(event) => update(row.rowUuid, { assetReference: event.target.value })} /></label>{hydrantResultColumns.map(([field, wireKey, label]) => { const definition = isV7 ? v7Definitions?.[field] : historicalResult; const result = row[field] as HydrantResult | null; const finding = isV7 && isHydrantV7EvidenceFinding(result); const fieldPath = `hydrant_set.hydrant_rows.rows.${row.rowUuid}.${wireKey}` as HydrantV7FieldPath; return <div className="hose-component" key={field}><strong>{label}</strong>{definition ? <ResultSelector<HydrantResult> definition={definition} label={`${label} result`} value={result} readOnly={readOnly} onChange={(value) => update(row.rowUuid, { [field]: value })} /> : <p className="error-text">Hydrant V7 definition is unavailable.</p>}{finding ? <section><RemarksField systemKey="hydrant" label={`${label} Remark *`} definition={remarks} value={row.fieldRemarks?.[field] ?? ""} readOnly={readOnly} onChange={(value) => update(row.rowUuid, { fieldRemarks: { ...row.fieldRemarks, [field]: value } })} /><HydrantV7EvidenceField record={record} fieldPath={fieldPath} attachment={evidenceFor(fieldPath)} onChanged={refreshPhotos} /></section> : null}</div>; })}<RemarksField systemKey="hydrant" label="Remarks" definition={remarks} value={row.remarks} readOnly={readOnly} onChange={(value) => update(row.rowUuid, { remarks: value })} />{!readOnly && row.source === "technician" ? <button type="button" className="secondary-command" onClick={() => setResponses((current) => ({ ...current, rows: current.rows.filter((candidate) => candidate.rowUuid !== row.rowUuid).map((candidate, rowIndex) => ({ ...candidate, sortOrder: rowIndex + 1 })) }))}>Remove Row</button> : null}</section>; })}{!readOnly ? <button type="button" className="secondary-command" onClick={add}>Add Row</button> : null}</fieldset>{!readOnly && record.inspectionSnapshot.system.locations.length > 0 ? <fieldset><legend>Save Location Formats</legend>{record.inspectionSnapshot.system.locations.map((location) => { const status = formatStatus[location.id] ?? "idle"; return <div className="inline-actions" key={location.id}><button type="button" className="secondary-command" disabled={status === "saving"} onClick={() => void saveAsFormat(location.id, location.key)}>{status === "saving" ? "Saving format…" : `Save "${location.displayName}" as format for next visit`}</button>{status === "pending" ? <span className="support-metadata">Saved on this device, pending sync.</span> : null}{status === "synced" ? <span className="support-metadata">Submitted for Admin review.</span> : null}{status === "failed" ? <span className="form-message" role="alert">{formatError[location.id]}</span> : null}</div>; })}</fieldset> : null}<fieldset disabled={readOnly}><legend>Comments</legend><RemarksField systemKey="hydrant" label="Comments" definition={{ policy: "optional", maxLength: 4000 }} value={responses.comments} readOnly={readOnly} onChange={(comments) => setResponses((current) => ({ ...current, comments }))} /></fieldset>{!readOnly ? <div className="form-actions sticky-form-actions"><button type="button" className="secondary-command" onClick={() => void onSaveDraft(responses).then(() => setMessage("Draft saved on this device.")).catch((error) => setMessage(error.message))}>Save Draft</button><button type="button" onClick={() => { setShow(true); if (!submitIssues(record, responses, photos).length) void submitLocal().catch((error) => setMessage(error.message)); }}>Submit Inspection</button></div> : null}</section>;
}
