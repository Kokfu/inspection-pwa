import { useEffect, useMemo, useState } from "react";
import {
  resolveAutomaticSprinklerEvidencePolicy,
  type AutomaticSprinklerPsiFieldPath
} from "../attachments/automaticSprinklerEvidencePolicy";
import { listInspectionAttachments } from "../attachments/attachmentRepository";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import { PhotoEvidenceField } from "../attachments/PhotoEvidenceField";
import { overriddenLabel } from "../inspections/labelOverrides";
import { MeasurementValueInput } from "../inspectionControls/MeasurementValueInput";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import {
  controlsForAutomaticSprinklerSnapshot
} from "./automaticSprinklerDefinition";
import { getAutomaticSprinklerSubmitIssues } from "./automaticSprinklerRepository";
import { AutomaticSprinklerV7EvidenceField } from "./AutomaticSprinklerV7EvidenceField";
import { isAutomaticSprinklerV7EvidenceFinding, type AutomaticSprinklerV7FieldPath, v7AutomaticSprinklerSubmissionIssues } from "./automaticSprinklerV7Evidence";
import type {
  AutomaticSprinklerInspectionRecord,
  AutomaticSprinklerResponses,
  SprinklerMeasurementKey,
  SprinklerMeasurementResponse,
  SprinklerRowResponse,
  SprinklerResult,
  AutomaticSprinklerV7ChecklistKey
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
  Pending: "Waiting to Sync",
  Syncing: "Syncing…",
  Synced: "Inspection Complete",
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
  const isV7 = record.masterTemplate.version === 7;
  // Display-only: the frozen per-customer label for one canonical tree path,
  // else the definition label. Reads the non-synced `record.displayLabelOverrides`
  // and never `controls` - every response key, evidence `fieldPath`, submit-gate
  // read and V7 branch below stays on the canonical resolved tree.
  const labelAt = (path: string, definitionLabel: string) =>
    overriddenLabel(record.displayLabelOverrides, path, definitionLabel);
  const controls = useMemo(
    () => controlsForAutomaticSprinklerSnapshot(record.inspectionSnapshot),
    [record.inspectionSnapshot]
  );
  const issues = useMemo(
    () => showValidation ? [
      ...getAutomaticSprinklerSubmitIssues(responses, record.inspectionSnapshot),
      ...v7AutomaticSprinklerSubmissionIssues(record, responses, attachments).map((message) => ({ section: "V7 Evidence", message, targetId: "sprinkler-comments" }))
    ] : [],
    [attachments, record, record.inspectionSnapshot, responses, showValidation]
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
      ? "Uploading Evidence…"
      : attachments.some((attachment) =>
        attachment.syncStatus === "Failed" || attachment.syncStatus === "Conflict"
      )
        ? "Needs Attention"
        : attachments.some((attachment) =>
          attachment.syncStatus === "Pending" || attachment.syncStatus === "Draft"
        )
          ? "Waiting for Evidence"
          : "Inspection Complete"
    : statusLabels[record.syncStatus];
  const evidencePolicy = useMemo(() => {
    // The legacy Cut-In / Cut-Out PSI photo lifecycle belongs to V1-V6 records
    // only. A V7 sprinkler carries V7 finding evidence exclusively and its
    // accepted form instance has no frozen evidence policy, so a captured PSI
    // photo could never upload (403 EVIDENCE_NOT_ALLOWED) and would strand the
    // outbox. Never surface the control on a V7 record.
    if (isV7) return undefined;
    try {
      return resolveAutomaticSprinklerEvidencePolicy(
        record.inspectionSnapshot.system.evidencePolicy
      );
    } catch {
      return undefined;
    }
  }, [isV7, record.inspectionSnapshot.system.evidencePolicy]);

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
    section: "waterTank" | "pumpHouse" | "mainAlarmValve" | "testRunFirePump",
    key: string,
    change: { result?: SprinklerResult | null; remarks?: string }
  ) {
    setResponses((current) => current.schemaVersion === 2
      ? { ...current, checklist: { ...current.checklist, [key]: { ...current.checklist[key as AutomaticSprinklerV7ChecklistKey], ...change } } }
      : { ...current, [section]: { ...(current[section as "waterTank" | "pumpHouse" | "mainAlarmValve"]), [key]: { ...(current[section as "waterTank" | "pumpHouse" | "mainAlarmValve"] as Record<string, SprinklerRowResponse>)[key], ...change } } }
    );
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
    section: "waterTank" | "pumpHouse" | "mainAlarmValve" | "testRunFirePump",
    key: string
  ) {
    const definitions = controls.checklist[section];
    const definition = definitions.find((candidate) => candidate.key === key);
    const response = responses.schemaVersion === 2
      ? responses.checklist[key as AutomaticSprinklerV7ChecklistKey]
      : (responses[section as "waterTank" | "pumpHouse" | "mainAlarmValve"] as Record<string, SprinklerRowResponse>)[key];
    if (!definition || !response) return null;
    const targetId = `sprinkler-${key}`;
    const shownLabel = labelAt(`checklist.${section}.${key}`, definition.label);
    return <section className={`hose-check-row ${invalidTargets.has(targetId) ? "field-invalid" : ""}`} id={targetId} key={key}>
      <strong>{shownLabel}</strong>
      <ResultSelector<SprinklerResult>
        definition={definition.result}
        label={`${shownLabel} result`}
        value={response.result}
        readOnly={readOnly}
        onChange={(result) => updateChecklist(section, key, { result })}
      />
      <RemarksField systemKey="automatic_sprinkler"
        label="Remarks"
        definition={definition.remarks}
        value={response.remarks}
        readOnly={readOnly}
        onChange={(remarks) => updateChecklist(section, key, { remarks })}
      />
      {isV7 && isAutomaticSprinklerV7EvidenceFinding(response.result) ? <AutomaticSprinklerV7EvidenceField
        record={record}
        fieldPath={`automatic_sprinkler_checks.${key}` as AutomaticSprinklerV7FieldPath}
        attachment={attachments.find((candidate) => candidate.protocolVersion === 7 && candidate.fieldPath === `automatic_sprinkler_checks.${key}`)}
        onChanged={refreshAttachments}
      /> : null}
    </section>;
  }

  function measurementRow(key: string) {
    const measurementKey = key as SprinklerMeasurementKey;
    const definition = controls.measurements.find((candidate) => candidate.key === measurementKey);
    const response = responses.measurements[measurementKey];
    if (!definition || !response) return null;
    const targetId = `sprinkler-${key}`;
    const shownLabel = labelAt(`measurements.${measurementKey}`, definition.label);
    return <section className={`measurement-card ${invalidTargets.has(targetId) ? "field-invalid" : ""}`} id={targetId} key={key}>
      <strong>{shownLabel}</strong>
      <div className="sprinkler-measurement-evidence">
      <div className="sprinkler-legacy-psi-evidence">
      {definition.values.map((valueDefinition) => (
        <div className="psi-value-with-evidence" key={valueDefinition.key}>
          <MeasurementValueInput
            definition={{ ...valueDefinition, label: labelAt(`measurements.${measurementKey}.values.${valueDefinition.key}`, valueDefinition.label) }}
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
      </div>
      <ResultSelector<SprinklerResult>
        definition={definition.result}
        label={`${shownLabel} result`}
        value={response.result}
        readOnly={readOnly}
        onChange={(result) => updateMeasurement(measurementKey, { result })}
      />
      <RemarksField systemKey="automatic_sprinkler"
        label="Remarks"
        definition={definition.remarks}
        value={response.remarks}
        readOnly={readOnly}
        onChange={(remarks) => updateMeasurement(measurementKey, { remarks })}
      />
      {isV7 && isAutomaticSprinklerV7EvidenceFinding(response.result) ? <AutomaticSprinklerV7EvidenceField
        record={record}
        fieldPath={`automatic_sprinkler_measurements.${measurementKey}` as AutomaticSprinklerV7FieldPath}
        attachment={attachments.find((candidate) => candidate.protocolVersion === 7 && candidate.fieldPath === `automatic_sprinkler_measurements.${measurementKey}`)}
        onChanged={refreshAttachments}
      /> : null}
      </div>
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
    const currentIssues = [
      ...getAutomaticSprinklerSubmitIssues(responses, record.inspectionSnapshot),
      ...v7AutomaticSprinklerSubmissionIssues(record, responses, attachments).map((message) => ({ section: "V7 Evidence", message, targetId: "sprinkler-comments" }))
    ];
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
      : record.syncStatus === "Synced" && evidenceStatus === "Inspection Complete"
        ? "Inspection data and attached evidence are synced."
        : record.syncStatus === "Synced"
          ? "Inspection data is synced; attached evidence still needs attention."
        : "";

  return <section className="hose-reel-form sprinkler-form" aria-labelledby="sprinkler-form-title">
    <button type="button" className="secondary-command" onClick={onBack}>Back to Systems</button>
    <header className="inspection-context">
      <div>
        <p className="eyebrow">{record.inspectionSnapshot.job.reference}</p>
        <h2 id="sprinkler-form-title">Automatic Sprinkler System</h2>
        <p><strong>{record.inspectionSnapshot.customer.displayName}</strong></p>
        <p>{record.inspectionSnapshot.job.title}</p>
      </div>
      <div>
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
      ? <button type="button" onClick={() => void onEditFailed().catch((error) => {
        setMessage(error instanceof Error ? error.message : "Automatic Sprinkler inspection could not be corrected");
      })}>Edit Failed Inspection</button>
      : null}

    <fieldset disabled={readOnly}><legend>Water Tank</legend>{sectionRows("waterTank")}</fieldset>
    <fieldset disabled={readOnly}><legend>Pump House</legend>{sectionRows("pumpHouse")}</fieldset>
    <fieldset disabled={readOnly}><legend>Main Alarm Valve</legend>{sectionRows("mainAlarmValve")}</fieldset>
    {isV7 ? <fieldset disabled={readOnly}><legend>Test Run Fire Pump 30 Minutes</legend>{controls.checklist.testRunFirePump.map((definition) => checklistRow("testRunFirePump", definition.key))}</fieldset> : null}
    <fieldset id="sprinkler-comments" className={invalidTargets.has("sprinkler-comments") ? "field-invalid" : ""} disabled={readOnly}>
      <legend>Comments</legend>
      <RemarksField systemKey="automatic_sprinkler"
        label="Comments"
        definition={controls.comments}
        value={responses.comments}
        readOnly={readOnly}
        onChange={(comments) => setResponses((current) => ({ ...current, comments }))}
      />
    </fieldset>

    {record.syncStatus === "Draft" ? <div className="form-actions sticky-form-actions">
      <button type="button" className="secondary-command" onClick={() => void save()}>Save Draft</button>
      <button type="button" onClick={() => void submit()}>Submit Inspection</button>
    </div> : null}
  </section>;
}
