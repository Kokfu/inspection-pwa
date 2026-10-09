import { CorrectedCopyAction } from "../attachments/CorrectedCopyAction";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDraftAutosave } from "../inspectionControls/useDraftAutosave";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import { RemarksField } from "../inspectionControls/RemarksField";
import { FireRatedRollerShutterV7EvidenceField } from "./FireRatedRollerShutterV7EvidenceField";
import {
  loadTechnicianLocationProposalDraft, newUpdateFormatDraft, queueTechnicianLocationProposal,
  saveTechnicianLocationProposalDraft, syncPendingLocationProposals
} from "../jobs/technicianLocationProposalDraft";
import { configuredFireRatedRollerShutterRows, submitIssues } from "./fireRatedRollerShutterRepository";
import { FireRatedRollerShutterIssueSummary } from "./FireRatedRollerShutterIssueSummary";
import { FireRatedRollerShutterSetupPrompt } from "./FireRatedRollerShutterSetupPrompt";
import { addPlannedZoneRows, addRowToZone, addTechnicianShutterRows, addZone, decideLayoutProposal, defaultCollapsedKeys, layoutDiffersFrom, layoutIssue, layoutRowsFromResponses, maxShutterRows, maxZoneTextLength, newRowFor, renameTechnicianZone, rollerShutterSetupStep, zoneGroupKey, zoneGroups, zoneNameTaken, zoneProgress, type RollerShutterSetupStep, type RollerShutterStart, type ShutterLayoutCorrections, type ShutterLayoutRow } from "./fireRatedRollerShutterSetup";
import { fireRatedRollerShutterRowColumns, type FireRatedRollerShutterInspectionRecord, type FireRatedRollerShutterResponses, type FireRatedRollerShutterResult } from "./fireRatedRollerShutterTypes";
import { isFireRatedRollerShutterV7EvidenceFinding, listFireRatedRollerShutterV7Photos, resolveFireRatedRollerShutterRowResultDefinitions, type FireRatedRollerShutterV7FieldPath } from "./fireRatedRollerShutterV7Evidence";

const remarks = { policy: "optional" as const, maxLength: 2000 };

export function FireRatedRollerShutterInspectionForm({ record, actorUserId, canUseServer, onBack, onSaveDraft, onSubmitLocal, onEditFailed, onStartCorrectedCopy }: { record: FireRatedRollerShutterInspectionRecord; actorUserId: number; canUseServer: boolean; onBack: () => void; onSaveDraft: (responses: FireRatedRollerShutterResponses) => Promise<void>; onSubmitLocal: (responses: FireRatedRollerShutterResponses) => Promise<void>; onEditFailed: () => Promise<void>; onStartCorrectedCopy: () => Promise<void> }) {
  const [responses, setResponses] = useState(record.responses); const [message, setMessage] = useState(""); const [show, setShow] = useState(false); const [photos, setPhotos] = useState<Awaited<ReturnType<typeof listFireRatedRollerShutterV7Photos>>>([]);
  const [formatStatus, setFormatStatus] = useState<"idle" | "saving" | "pending" | "synced" | "failed">("idle");
  const [formatError, setFormatError] = useState("");
  const [formatCorrections, setFormatCorrections] = useState<ShutterLayoutCorrections>({});
  const [layoutNote, setLayoutNote] = useState("");
  const [zoneNameNote, setZoneNameNote] = useState("");
  const summaryRef = useRef<HTMLElement>(null);
  // Which zone groups are collapsed. null = the default (all but the first); once the technician toggles one it is explicit.
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string> | null>(null);
  // The pre-form step is decided once per record from its persisted content, then only ever cleared:
  // removing rows or editing while filling the form must never bring the prompt back.
  const [setup, setSetup] = useState<{ uuid: string; step: RollerShutterSetupStep | null }>(() => ({ uuid: record.clientUuid, step: record.syncStatus === "Draft" ? rollerShutterSetupStep(record.responses) : null }));
  const setupStep = setup.uuid === record.clientUuid ? setup.step : record.syncStatus === "Draft" ? rollerShutterSetupStep(record.responses) : null;
  const savedLayout = useMemo<ShutterLayoutRow[]>(() => configuredFireRatedRollerShutterRows(record.inspectionSnapshot.system, record.responses.schemaVersion).map((row) => ({ assetReference: row.assetReference, locationText: row.locationText, zoneText: row.zoneText ?? "" })), [record.inspectionSnapshot.system, record.responses.schemaVersion]);
  const rowDefinitions = resolveFireRatedRollerShutterRowResultDefinitions(record.inspectionSnapshot.system.definition);
  useEffect(() => setResponses(record.responses), [record]);
  const { submit: submitLocal } = useDraftAutosave({ record, responses, setResponses, save: onSaveDraft, submit: onSubmitLocal, enabled: record.syncStatus === "Draft" });
  useEffect(() => { void listFireRatedRollerShutterV7Photos(record.clientUuid).then(setPhotos); }, [record.clientUuid, record.localUpdatedAt]);
  const readOnly = record.syncStatus !== "Draft";
  const issues = show ? submitIssues(record, responses, photos) : [];
  const updateRow = (id: string, change: Partial<FireRatedRollerShutterResponses["rows"][number]>) => setResponses((current) => ({ ...current, rows: current.rows.map((row) => row.rowUuid === id ? { ...row, ...change } : row) }));
  const addRow = () => setResponses((current) => ({ ...current, rows: [...current.rows, newRowFor(current, current.rows.length + 1)] }));
  const startInspection = (start: RollerShutterStart) => {
    setResponses((current) => "plan" in start ? addPlannedZoneRows(current, start.plan) : addTechnicianShutterRows(current, start.extraRows));
    setSetup({ uuid: record.clientUuid, step: null });
  };
  const evidenceFor = (fieldPath: string) => photos.find((photo) => photo.fieldPath === fieldPath);
  const refreshPhotos = async () => setPhotos(await listFireRatedRollerShutterV7Photos(record.clientUuid));
  const jobId = record.inspectionSnapshot.job.id, customerId = record.inspectionSnapshot.customer.id, layoutKey = "general";
  /** Queue the layout locally (outbox first), then sync when online. Shared by the manual button and the submit-time save. */
  async function sendLayout(rows: ShutterLayoutRow[]): Promise<"pending" | "synced" | "failed"> {
    const draft = newUpdateFormatDraft(jobId, customerId, record.systemKey, layoutKey, rows);
    await saveTechnicianLocationProposalDraft(draft);
    await queueTechnicianLocationProposal(draft);
    setFormatStatus("pending");
    if (!(canUseServer && navigator.onLine)) return "pending";
    await syncPendingLocationProposals(actorUserId);
    const refreshed = await loadTechnicianLocationProposalDraft(jobId, record.systemKey, layoutKey);
    const outcome = refreshed?.status === "Synced" ? "synced" : refreshed?.status === "Failed" ? "failed" : "pending";
    setFormatStatus(outcome);
    if (refreshed?.status === "Failed") setFormatError(refreshed.lastError ?? "This format could not be submitted.");
    return outcome;
  }
  async function saveAsFormat() {
    setFormatStatus("saving"); setFormatError("");
    try {
      const rows = layoutRowsFromResponses(responses, formatCorrections);
      const issue = layoutIssue(rows);
      if (issue) throw new Error(issue);
      await sendLayout(rows);
    } catch (error) {
      setFormatStatus("failed");
      setFormatError(error instanceof Error ? error.message : "This format could not be saved.");
    }
  }
  /** After a successful local submit, remember this visit's shutters for the next one -- no extra button.
   *  Only a layout that differs from the frozen one is proposed (an unchanged layout would only add
   *  Supervisor work), and never over a proposal already made for this visit. The inspection itself
   *  is already safely queued, so nothing here may fail the submit. */
  async function saveLayoutAfterSubmit(submitted: FireRatedRollerShutterResponses) {
    try {
      const rows = layoutRowsFromResponses(submitted, formatCorrections);
      if (!layoutDiffersFrom(savedLayout, rows)) return;
      const existing = await loadTechnicianLocationProposalDraft(jobId, record.systemKey, layoutKey);
      const decision = decideLayoutProposal(savedLayout, rows, existing?.status);
      if (decision.action === "note") { setLayoutNote(decision.note); return; }
      if (decision.action === "skip") return;
      const outcome = await sendLayout(rows);
      setLayoutNote(outcome === "synced" ? "Shutter layout sent to a Supervisor for approval. Once approved, it is pre-filled on the next visit."
        : outcome === "pending" ? "Shutter layout saved on this device. It will be sent to a Supervisor for approval when online."
        : "Inspection submitted. The shutter layout needs attention to sync; see the sync status in the header.");
    } catch (error) {
      setLayoutNote(`Inspection submitted. The shutter layout could not be saved for next visit: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  const zoned = responses.schemaVersion === 2;
  const atRowLimit = responses.rows.length >= maxShutterRows;
  const groups = zoneGroups(responses.rows);
  const showZoneHeadings = zoned && (groups.length > 1 || (groups[0]?.zoneText ?? "") !== "");
  const configuredRows = responses.rows.filter((row) => row.source === "configured");
  const hasPhoto = (rowUuid: string, wireKey: string) => evidenceFor(`roller_shutter_schedule.roller_shutter_schedule_rows.rows.${rowUuid}.${wireKey}`) !== undefined;
  const collapsed: ReadonlySet<string> = showZoneHeadings ? (collapsedKeys ?? defaultCollapsedKeys(groups)) : new Set<string>();
  const toggleZone = (key: string) => setCollapsedKeys(() => { const next = new Set(collapsed); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  /** A failed Submit opens every zone that still has unfinished shutters, so the problem is on screen. */
  const openIncompleteZones = () => setCollapsedKeys(new Set([...collapsed].filter((key) => {
    const group = groups.find((candidate) => zoneGroupKey(candidate) === key);
    return !group || (() => { const progress = zoneProgress(group, hasPhoto); return progress.complete === progress.total; })();
  })));
  const setCorrection = (rowUuid: string, change: { assetReference?: string; locationText?: string; zoneText?: string }) => {
    setFormatCorrections((current) => ({ ...current, [rowUuid]: { ...current[rowUuid], ...change } }));
    setFormatStatus("idle");
  };
  function renderRow(row: FireRatedRollerShutterResponses["rows"][number], label: number) {
    const configured = row.source === "configured";
    return <section className="hose-row-card" key={row.rowUuid}><h4>Shutter {label}</h4>
      <label>Asset Reference<input maxLength={200} value={row.assetReference} disabled={readOnly || configured} onChange={(event) => updateRow(row.rowUuid, { assetReference: event.target.value })} /></label>
      <label>Location<input maxLength={300} value={row.locationText} disabled={readOnly || configured} onChange={(event) => updateRow(row.rowUuid, { locationText: event.target.value })} /></label>
      {fireRatedRollerShutterRowColumns.map(([field, wireKey, columnLabel]) => {
        const definition = rowDefinitions?.[field];
        const result = row[field] as FireRatedRollerShutterResult | null;
        const finding = isFireRatedRollerShutterV7EvidenceFinding(result);
        const fieldPath = `roller_shutter_schedule.roller_shutter_schedule_rows.rows.${row.rowUuid}.${wireKey}` as FireRatedRollerShutterV7FieldPath;
        return <div className="hose-component" key={field}><strong>{columnLabel}</strong>
          {definition ? <ResultSelector<FireRatedRollerShutterResult> definition={definition} label={`${columnLabel} result`} value={result} readOnly={readOnly} onChange={(value) => updateRow(row.rowUuid, { [field]: value })} /> : <p className="error-text">Fire Rated Roller Shutter V7 definition is unavailable.</p>}
          {finding ? <section><RemarksField label={`${columnLabel} Remark *`} definition={remarks} value={row.fieldRemarks?.[field] ?? ""} readOnly={readOnly} onChange={(value) => updateRow(row.rowUuid, { fieldRemarks: { ...row.fieldRemarks, [field]: value } })} /><FireRatedRollerShutterV7EvidenceField record={record} fieldPath={fieldPath} attachment={evidenceFor(fieldPath)} onChanged={refreshPhotos} /></section> : null}
        </div>;
      })}
      <RemarksField label="Remarks" definition={remarks} value={row.remarks} readOnly={readOnly} onChange={(value) => updateRow(row.rowUuid, { remarks: value })} />
      {!readOnly && row.source === "technician" ? <button type="button" className="secondary-command" onClick={() => setResponses((current) => ({ ...current, rows: current.rows.filter((candidate) => candidate.rowUuid !== row.rowUuid).map((candidate, rowIndex) => ({ ...candidate, sortOrder: rowIndex + 1 })) }))}>Remove Row</button> : null}
    </section>;
  }
  return <section className="hose-reel-form" aria-labelledby="roller-shutter-title"><button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button><header className="inspection-context"><div><p className="eyebrow">{record.inspectionSnapshot.job.reference}</p><h2 id="roller-shutter-title">Fire Rated Roller Shutter System</h2><p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p><p>{record.inspectionSnapshot.job.title}</p></div><strong>{record.syncStatus === "Synced" ? "Inspection Complete" : record.syncStatus === "Pending" ? "Waiting to Sync" : record.syncStatus === "Failed" || record.syncStatus === "Conflict" ? "Needs Attention" : record.syncStatus === "Syncing" ? "Syncing…" : record.syncStatus}</strong></header>{record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}{message ? <p className="form-message">{message}</p> : null}{layoutNote ? <p className="form-message" role="status">{layoutNote}</p> : null}{show && issues.length ? <section ref={summaryRef} className="validation-summary" role="alert"><h3>Cannot submit yet</h3><FireRatedRollerShutterIssueSummary responses={responses} issues={issues} /></section> : null}{["Failed", "Conflict"].includes(record.syncStatus) ? <button type="button" onClick={() => void onEditFailed()}>Edit Failed Inspection</button> : null}<CorrectedCopyAction clientUuid={record.clientUuid} syncStatus={record.syncStatus} localUpdatedAt={record.localUpdatedAt} onStart={onStartCorrectedCopy} />
    {setupStep ? <FireRatedRollerShutterSetupPrompt key={`${record.clientUuid}:${setupStep}`} step={setupStep} savedRows={savedLayout} onStart={startInspection} /> : <>
    <fieldset disabled={readOnly}><legend>Inspection Details</legend>
      <label>Date Tested<input type="date" value={responses.dateTested} onChange={(event) => setResponses((current) => ({ ...current, dateTested: event.target.value }))} /></label>
      {showZoneHeadings ? null : <label>Zone<input maxLength={200} value={responses.zone} onChange={(event) => setResponses((current) => ({ ...current, zone: event.target.value }))} /></label>}
      <label>Inspected By<input maxLength={200} value={responses.inspectedBy} onChange={(event) => setResponses((current) => ({ ...current, inspectedBy: event.target.value }))} /></label>
    </fieldset>
    <fieldset disabled={readOnly}><legend>Roller Shutter Schedule</legend>
      {zoneNameNote ? <p className="form-message" role="status">{zoneNameNote}</p> : null}
      {showZoneHeadings ? <div className="inline-actions">
        <button type="button" className="secondary-command" disabled={collapsed.size === 0} onClick={() => setCollapsedKeys(new Set())}>Expand all zones</button>
        <button type="button" className="secondary-command" disabled={groups.every((group) => collapsed.has(zoneGroupKey(group)))} onClick={() => setCollapsedKeys(new Set(groups.map(zoneGroupKey)))}>Collapse all zones</button>
      </div> : null}
      {groups.map((group) => {
        const name = group.zoneText;
        const key = zoneGroupKey(group);
        const isCollapsed = collapsed.has(key);
        const progress = zoneProgress(group, hasPhoto);
        return <section className="location-group" key={key} aria-label={showZoneHeadings ? `Zone ${name || "(unnamed)"}` : undefined}>
          {showZoneHeadings ? <div className="zone-header">
            <h3>{name || "Unnamed zone"}</h3>
            <span className="support-metadata">{progress.complete} of {progress.total} complete</span>
            <button type="button" className="secondary-command" aria-expanded={!isCollapsed} aria-controls={`zone-rows-${key}`}
              aria-label={`${isCollapsed ? "Show" : "Hide"} shutters in ${name || "unnamed zone"}`} onClick={() => toggleZone(key)}>{isCollapsed ? "Show shutters" : "Hide shutters"}</button>
          </div> : null}
          {showZoneHeadings && !group.hasConfigured && !readOnly
            ? <label>Zone name<input maxLength={maxZoneTextLength} value={name} onChange={(event) => {
              const next = event.target.value;
              if (zoneNameTaken(responses, name, next)) { setZoneNameNote(`Another zone is already named "${next}". Choose a different name.`); return; }
              setZoneNameNote("");
              setResponses((current) => renameTechnicianZone(current, name, next));
            }} /></label> : null}
          <div id={`zone-rows-${key}`} className="zone-rows" hidden={isCollapsed}>
            {group.rows.map((row, index) => renderRow(row, index + 1))}
            {!readOnly && zoned ? <button type="button" className="secondary-command" disabled={atRowLimit} onClick={() => setResponses((current) => addRowToZone(current, name))}>{showZoneHeadings ? `Add shutter to ${name || "this zone"}` : "Add Row"}</button> : null}
          </div>
        </section>;
      })}
      {!readOnly && (!zoned || groups.length === 0) ? <button type="button" className="secondary-command" disabled={atRowLimit} onClick={addRow}>Add Row</button> : null}
      {!readOnly && zoned ? <button type="button" className="secondary-command" disabled={atRowLimit} onClick={() => setResponses((current) => addZone(current))}>Add Zone</button> : null}
      {!readOnly && configuredRows.length > 0 ? <section className="report-summary" aria-label="Correct format for next visit"><h3>Correct format for next visit</h3><p>These changes are proposed for future visits. The inspection keeps its frozen row labels.</p>{configuredRows.map((row, index) => <div key={row.rowUuid}>
        <label>Shutter {index + 1} format reference<input maxLength={200} value={formatCorrections[row.rowUuid]?.assetReference ?? row.assetReference} onChange={(event) => setCorrection(row.rowUuid, { assetReference: event.target.value })} /></label>
        <label>Shutter {index + 1} format location<input maxLength={300} value={formatCorrections[row.rowUuid]?.locationText ?? row.locationText} onChange={(event) => setCorrection(row.rowUuid, { locationText: event.target.value })} /></label>
        {zoned ? <label>Shutter {index + 1} format zone<input maxLength={maxZoneTextLength} value={formatCorrections[row.rowUuid]?.zoneText ?? row.zoneText ?? ""} onChange={(event) => setCorrection(row.rowUuid, { zoneText: event.target.value })} /></label> : null}
      </div>)}</section> : null}
      {!readOnly ? <div className="inline-actions"><button type="button" className="secondary-command" disabled={formatStatus === "saving"} onClick={() => void saveAsFormat()}>{formatStatus === "saving" ? "Saving format…" : "Save as format for next visit"}</button>{formatStatus === "pending" ? <span className="support-metadata">Saved on this device, pending sync.</span> : null}{formatStatus === "synced" ? <span className="support-metadata">Submitted for Supervisor review.</span> : null}{formatStatus === "failed" ? <span className="form-message" role="alert">{formatError}</span> : null}</div> : null}
    </fieldset>
    <fieldset disabled={readOnly}><legend>Comments</legend><RemarksField label="Comments" definition={{ policy: "optional", maxLength: 4000 }} value={responses.comments} readOnly={readOnly} onChange={(comments) => setResponses((current) => ({ ...current, comments }))} /></fieldset>
    {!readOnly ? <div className="form-actions sticky-form-actions"><button type="button" className="secondary-command" onClick={() => void onSaveDraft(responses).then(() => setMessage("Draft saved on this device.")).catch((error) => setMessage(error.message))}>Save Draft</button><button type="button" onClick={() => { setShow(true); if (submitIssues(record, responses, photos).length) { openIncompleteZones(); window.setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })); } else { const submitted = responses; void submitLocal().then(() => saveLayoutAfterSubmit(submitted)).catch((error) => setMessage(error.message)); } }}>Submit Inspection</button></div> : null}
    </>}
  </section>;
}
