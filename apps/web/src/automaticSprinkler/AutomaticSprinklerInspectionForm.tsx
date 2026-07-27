import { useEffect, useMemo, useState } from "react";
import {
  resolveAutomaticSprinklerEvidencePolicy,
  type AutomaticSprinklerPsiFieldPath
} from "../attachments/automaticSprinklerEvidencePolicy";
import { listInspectionAttachments } from "../attachments/attachmentRepository";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import { PhotoEvidenceField } from "../attachments/PhotoEvidenceField";
import { MeasurementValueInput } from "../inspectionControls/MeasurementValueInput";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import {
  controlsForAutomaticSprinklerSnapshot
} from "./automaticSprinklerDefinition";
import { getAutomaticSprinklerSubmitIssues } from "./automaticSprinklerRepository";
import type {
  AutomaticSprinklerInspectionRecord,
  AutomaticSprinklerResponses,
  SprinklerMeasurementKey,
  SprinklerMeasurementResponse,
  SprinklerRowResponse,
  SprinklerResult
} from "./automaticSprinklerTypes";

type Props = {
  record: AutomaticSprinklerInspectionRecord;
  onBack: () => void;
  onSaveDraft: (responses: AutomaticSprinklerResponses) => Promise<void>;
  onSubmitLocal: (responses: AutomaticSprinklerResponses) => Promise<void>;
  onEditFailed: () => Promise<void>;
  onAttachmentsChange: () => Promise<void>;
};

const statusLabels = {
  Draft: "Draft",
  Pending: "Pending Sync",
  Syncing: "Syncing",
  Synced: "Completed",
  Failed: "Needs Attention",
  Conflict: "Needs Attention"
} as const;

export function AutomaticSprinklerInspectionForm({
  record,
  onBack,
  onSaveDraft,
  onSubmitLocal,
  onEditFailed,
  onAttachmentsChange
}: Props) {
  const [responses, setResponses] = useState(record.responses);
  const [message, setMessage] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const [attachments, setAttachments] = useState<InspectionAttachmentRecord[]>([]);
  const controls = useMemo(
    () => controlsForAutomaticSprinklerSnapshot(record.inspectionSnapshot),
    [record.inspectionSnapshot]
  );
  const issues = useMemo(
    () => showValidation ? getAutomaticSprinklerSubmitIssues(responses, record.inspectionSnapshot) : [],
    [record.inspectionSnapshot, responses, showValidation]
  );
  const invalidTargets = useMemo(() => new Set(issues.map((issue) => issue.targetId)), [issues]);
  const groupedIssues = useMemo(() => {
    const groups = new Map<string, string[]>();
    issues.forEach((issue) => groups.set(issue.section, [...(groups.get(issue.section) ?? []), issue.message]));
    return [...groups.entries()];
  }, [issues]);
  const readOnly = record.syncStatus !== "Draft";
  const evidenceStatus = record.syncStatus === "Synced"
    ? attachments.some((attachment) => attachment.syncStatus === "Uploading")
      ? "Uploading Evidence"
      : attachments.some((attachment) =>
        attachment.syncStatus === "Failed" || attachment.syncStatus === "Conflict"
      )
        ? "Photo Upload Failed"
        : attachments.some((attachment) =>
          attachment.syncStatus === "Pending" || attachment.syncStatus === "Draft"
        )
          ? "Pending Evidence"
          : "Completed"
    : statusLabels[record.syncStatus];
  const evidencePolicy = useMemo(() => {
    try {
      return resolveAutomaticSprinklerEvidencePolicy(
        record.inspectionSnapshot.system.evidencePolicy
      );
    } catch {
      return undefined;
    }
  }, [record.inspectionSnapshot.system.evidencePolicy]);

  useEffect(() => setResponses(record.responses), [record]);
  async function refreshAttachments() {
    setAttachments(await listInspectionAttachments(record.clientUuid));
    await onAttachmentsChange();
  }
  useEffect(() => {
    void refreshAttachments();
  }, [record.clientUuid, record.localUpdatedAt, record.syncStatus]);
  useEffect(() => {
    setMessage("");
    setShowValidation(false);
  }, [record.clientUuid]);

  function updateChecklist(
    section: "waterTank" | "pumpHouse" | "mainAlarmValve",
    key: string,
    change: { result?: SprinklerResult | null; remarks?: string }
  ) {
    setResponses((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: {
          ...(current[section] as Record<string, SprinklerRowResponse>)[key],
          ...change
        }
      }
    }));
  }

  function updateMeasurement(
    key: SprinklerMeasurementKey,
    change: Partial<SprinklerMeasurementResponse<string>>
  ) {
    setResponses((current) => ({
      ...current,
      measurements: {
        ...current.measurements,
        [key]: { ...current.measurements[key], ...change }
      } as AutomaticSprinklerResponses["measurements"]
    }));
  }

  function checklistRow(
    section: "waterTank" | "pumpHouse" | "mainAlarmValve",
    key: string
  ) {
    const definitions = controls.checklist[section];
    const definition = definitions.find((candidate) => candidate.key === key);
    const response = (responses[section] as Record<string, SprinklerRowResponse>)[key];
    if (!definition || !response) return null;
    const targetId = `sprinkler-${key}`;
    return <section className={`hose-check-row ${invalidTargets.has(targetId) ? "field-invalid" : ""}`} id={targetId} key={key}>
      <strong>{definition.label}</strong>
      <ResultSelector<SprinklerResult>
        definition={definition.result}
        label={`${definition.label} result`}
        value={response.result}
        readOnly={readOnly}
        onChange={(result) => updateChecklist(section, key, { result })}
      />
      <RemarksField
        label="Remarks"
        definition={definition.remarks}
        value={response.remarks}
        readOnly={readOnly}
        onChange={(remarks) => updateChecklist(section, key, { remarks })}
      />
    </section>;
  }

  function measurementRow(key: string) {
    const measurementKey = key as SprinklerMeasurementKey;
    const definition = controls.measurements.find((candidate) => candidate.key === measurementKey);
    const response = responses.measurements[measurementKey];
    if (!definition || !response) return null;
    const targetId = `sprinkler-${key}`;
    return <section className={`measurement-card ${invalidTargets.has(targetId) ? "field-invalid" : ""}`} id={targetId} key={key}>
      <strong>{definition.label}</strong>
      {definition.values.map((valueDefinition) => (
        <div className="psi-value-with-evidence" key={valueDefinition.key}>
          <MeasurementValueInput
            definition={valueDefinition}
            value={response.values[valueDefinition.key as keyof typeof response.values]}
            readOnly={readOnly}
            onChange={(value) => updateMeasurement(measurementKey, {
              values: { ...response.values, [valueDefinition.key]: value }
            })}
          />
          {evidencePolicy ? (() => {
            const fieldPath =
              `measurements.${measurementKey}.${valueDefinition.key}` as AutomaticSprinklerPsiFieldPath;
            return <PhotoEvidenceField
              record={record}
              fieldPath={fieldPath}
              policy={evidencePolicy}
              attachment={attachments.find((candidate) => candidate.fieldPath === fieldPath)}
              onChange={refreshAttachments}
            />;
          })() : null}
        </div>
      ))}
      <ResultSelector<SprinklerResult>
        definition={definition.result}
        label={`${definition.label} result`}
        value={response.result}
        readOnly={readOnly}
        onChange={(result) => updateMeasurement(measurementKey, { result })}
      />
      <RemarksField
        label="Remarks"
        definition={definition.remarks}
        value={response.remarks}
        readOnly={readOnly}
        onChange={(remarks) => updateMeasurement(measurementKey, { remarks })}
      />
    </section>;
  }

  function sectionRows(section: "waterTank" | "pumpHouse" | "mainAlarmValve") {
    return controls.layout[section].map((row) =>
      row.kind === "measurement"
        ? measurementRow(row.key)
        : checklistRow(section, row.key)
    );
  }

  async function save() {
    try {
      await onSaveDraft(responses);
      setMessage("Draft saved on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft could not be saved");
    }
  }

  async function submit() {
    const currentIssues = getAutomaticSprinklerSubmitIssues(responses, record.inspectionSnapshot);
    setShowValidation(true);
    if (currentIssues.length > 0) {
      setMessage("");
      window.setTimeout(() => document.getElementById(currentIssues[0].targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      }));
      return;
    }
    try {
      await onSubmitLocal(responses);
      await refreshAttachments();
      setShowValidation(false);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Automatic Sprinkler inspection could not be submitted");
    }
  }

  const lifecycleMessage = record.syncStatus === "Pending"
    ? "Inspection submitted locally and waiting for sync."
    : record.syncStatus === "Syncing"
      ? "Inspection is syncing."
      : record.syncStatus === "Synced" && evidenceStatus === "Completed"
        ? "Inspection data and attached evidence are synced."
        : record.syncStatus === "Synced"
          ? "Inspection data is synced; attached evidence still needs attention."
        : "";

  return <section className="hose-reel-form sprinkler-form" aria-labelledby="sprinkler-form-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow">{record.inspectionSnapshot.job.reference}</p>
        <h2 id="sprinkler-form-title">{record.inspectionSnapshot.job.title}</h2>
        <p>{record.inspectionSnapshot.customer.displayName}</p>
        <p className="secondary-metadata">Configuration revision {record.configuration.revisionNumber}</p>
      </div>
      <div>
        <span className="status-caption">Automatic Sprinkler System</span>
        <strong className={`inspection-status status-${record.syncStatus.toLowerCase()}`}>
          {evidenceStatus}
        </strong>
      </div>
    </header>
    {record.lastSyncError ? <p className="error-text">{record.lastSyncError}</p> : null}
    {lifecycleMessage ? <p className="success-message">{lifecycleMessage}</p> : null}
    {message ? <p className="form-message">{message}</p> : null}
    {groupedIssues.length > 0 ? <section className="validation-summary" role="alert" aria-labelledby="sprinkler-validation-title">
      <h3 id="sprinkler-validation-title">Cannot submit yet</h3>
      {groupedIssues.map(([section, messages]) => <div key={section}>
        <strong>{section}</strong>
        <ul>{messages.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>)}
    </section> : null}
    {record.syncStatus === "Failed" || record.syncStatus === "Conflict"
      ? <button type="button" onClick={() => void onEditFailed()}>Edit Failed Inspection</button>
      : null}

    <fieldset disabled={readOnly}><legend>Water Tank</legend>{sectionRows("waterTank")}</fieldset>
    <fieldset disabled={readOnly}><legend>Pump House</legend>{sectionRows("pumpHouse")}</fieldset>
    <fieldset disabled={readOnly}><legend>Main Alarm Valve</legend>{sectionRows("mainAlarmValve")}</fieldset>
    <fieldset id="sprinkler-comments" className={invalidTargets.has("sprinkler-comments") ? "field-invalid" : ""} disabled={readOnly}>
      <legend>Comments</legend>
      <RemarksField
        label="Comments"
        definition={controls.comments}
        value={responses.comments}
        readOnly={readOnly}
        onChange={(comments) => setResponses((current) => ({ ...current, comments }))}
      />
    </fieldset>

    {record.syncStatus === "Draft" ? <div className="form-actions sticky-form-actions">
      <button type="button" className="secondary-command" onClick={() => void save()}>Save Draft</button>
      <button type="button" onClick={() => void submit()}>Submit Local</button>
    </div> : null}
  </section>;
}
