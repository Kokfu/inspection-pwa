import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { MeasurementValueInput } from "../inspectionControls/MeasurementValueInput";
import { MultiResultSelector } from "../inspectionControls/MultiResultSelector";
import { RemarksField } from "../inspectionControls/RemarksField";
import { ResultSelector } from "../inspectionControls/ResultSelector";
import type { ResolvedRemarksDefinition, ResultControlDefinition } from "../inspectionControls/definitionTypes";
import {
  evidencePolicyAssignableSystemKeys,
  labelOverrideSystemKeys,
  loadManagerLabelOverrides,
  ManagerApiError,
  saveManagerLabelOverrides,
  systemConfigurationSystemKeys,
  type ManagerCustomer,
  type ManagerLabelFormField,
  type ManagerLabelFormLayout,
  type ManagerLabelFormSection,
  type ManagerLabelOverrideNode
} from "./managerApi";
import { ManagerEvidencePolicyEditor, ManagerLocationsEditor, ManagerSystemConfigurationEditor } from "./ManagerCustomerConfiguration";
import { isManagerServiceTab, managerServiceEntries, managerServiceTabLabels, managerServiceTabs, type ManagerServiceTab } from "./ManagerCustomerServices";
import { clearManagerLeaveGuard, setManagerLeaveGuard } from "./managerLeaveGuard";
import { readManagerSession, writeManagerSession } from "./managerReturnRoute";

/**
 * The one screen for a customer's single service: a "Form wording" replica of
 * the technician form (click a label to rename it), the service's preset rows
 * (zones & locations) and its settings (system configuration, evidence policy).
 * Only the tabs that apply to the service are shown.
 *
 * Semantics are unchanged from the per-service editors this replaces: every
 * save creates a new customer configuration version server-side; existing
 * service visits keep what they were frozen with; new visits use the new values.
 * The wording replica never mounts a technician form component and never touches
 * IndexedDB, drafts, the outbox or jobs — it is rendered from the label-override
 * GET only (labels + the additive, read-only `formLayout`).
 */

export const MANAGER_SERVICE_VERSION_COPY =
  "Saving creates a new configuration version. Existing service visits keep the wording and settings they were created with; new visits use the new ones.";

export function ManagerServiceEditor({ customer, systemKey, onBack, onSaved, onAuthorityFailure }: {
  customer: ManagerCustomer; systemKey: string; onBack: () => void;
  onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
}) {
  const entry = useMemo(() => managerServiceEntries(customer).find((candidate) => candidate.key === systemKey), [customer, systemKey]);
  const tabs = entry ? managerServiceTabs(entry) : [];
  const tabKey = `manager-service-tab:${customer.customer.id}:${systemKey}`;
  const [tab, setTab] = useState<ManagerServiceTab>(() => {
    const remembered = readManagerSession(tabKey, isManagerServiceTab);
    return remembered && tabs.includes(remembered) ? remembered : tabs[0] ?? "wording";
  });
  const activeTab = tabs.includes(tab) ? tab : tabs[0] ?? "wording";
  const [visited, setVisited] = useState<ReadonlySet<ManagerServiceTab>>(() => new Set([activeTab]));
  const [unsavedWording, setUnsavedWording] = useState(0);
  const guardHash = useRef(window.location.hash);

  const confirmLeave = () => unsavedWording === 0
    || window.confirm(`You have ${unsavedWording} unsaved wording ${unsavedWording === 1 ? "change" : "changes"}. Leave without saving?`);

  // Guard hash navigation (browser Back, typed URL) and reload/close while wording edits are unsaved.
  useEffect(() => {
    const hash = guardHash.current;
    if (unsavedWording === 0) { clearManagerLeaveGuard(hash); return; }
    setManagerLeaveGuard({ hash, confirmLeave });
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); clearManagerLeaveGuard(hash); };
  });

  const back = () => {
    if (!confirmLeave()) return;
    clearManagerLeaveGuard(guardHash.current);
    setUnsavedWording(0);
    onBack();
  };

  const selectTab = (next: ManagerServiceTab) => {
    setTab(next);
    setVisited((current) => current.has(next) ? current : new Set([...current, next]));
    writeManagerSession(tabKey, next);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(activeTab);
    const next = event.key === "Home" ? tabs[0]
      : event.key === "End" ? tabs[tabs.length - 1]
        : tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    selectTab(next);
    document.getElementById(`service-tab-${next}`)?.focus();
  };

  const backLabel = `Back to ${customer.customer.displayName}`;
  if (!entry) {
    return <section className="manager-home" aria-labelledby="manager-service-title">
      <button type="button" className="secondary-command" onClick={onBack}>{backLabel}</button>
      <h2 id="manager-service-title">Service not found</h2>
      <p className="empty-state">This service is not configured for {customer.customer.displayName}.</p>
    </section>;
  }

  return <section className="manager-home manager-service-editor" aria-labelledby="manager-service-title">
    <button type="button" className="secondary-command" onClick={back}>{backLabel}</button>
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">{customer.customer.displayName} · Service settings</p>
        <h2 id="manager-service-title">{entry.displayName}</h2>
        <p className="support-metadata">Version {customer.configuration.revision}</p>
      </div>
      <span className={`status-badge ${entry.enabled ? "status-badge--complete" : "status-badge--waiting"}`}>{entry.enabled ? "Assigned" : "Not assigned yet"}</span>
    </div>
    <p className="operational-message">{MANAGER_SERVICE_VERSION_COPY}</p>
    {!entry.enabled ? <p className="operational-message operational-message--warning">This service is not assigned to {customer.customer.displayName} yet. Define at least one zone and one location on the Preset rows tab, then tick it under Assigned Services on the customer page.</p> : null}
    <div className="job-tabs manager-service-tabs" role="tablist" aria-label={`${entry.displayName} settings`}>
      {tabs.map((value) => <button
        key={value} type="button" role="tab" id={`service-tab-${value}`}
        aria-selected={activeTab === value} aria-controls={`service-panel-${value}`} tabIndex={activeTab === value ? 0 : -1}
        onClick={() => selectTab(value)} onKeyDown={onTabKeyDown}
      >{managerServiceTabLabels[value]}{value === "wording" && unsavedWording > 0 ? <span className="manager-service-tab-dot" aria-label={`${unsavedWording} unsaved`}>•</span> : null}</button>)}
    </div>
    {tabs.map((value) => (
      <div
        key={value} id={`service-panel-${value}`} role="tabpanel" aria-labelledby={`service-tab-${value}`}
        className="manager-service-panel" hidden={activeTab !== value} tabIndex={0}
      >
        {visited.has(value) || activeTab === value ? (
          value === "wording"
            ? (labelOverrideSystemKeys.has(entry.key)
              ? <ManagerFormWording customerId={customer.customer.id} systemKey={entry.key} systemLabel={entry.displayName} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} onUnsavedChange={setUnsavedWording} />
              : <div className="manager-wording-readonly">
                  <p className="operational-message">Wording for this service can't be customised yet.</p>
                  <p className="support-metadata">Technicians see the standard wording from the service report template for {entry.displayName}.</p>
                </div>)
            : value === "presets"
              ? <ManagerLocationsEditor embedded customerId={customer.customer.id} systemKey={entry.key} systemLabel={entry.displayName} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} />
              : <div className="manager-service-settings">
                  {systemConfigurationSystemKeys.has(entry.key) ? <section aria-labelledby="service-settings-configuration">
                    <h3 id="service-settings-configuration">System configuration</h3>
                    <p className="support-metadata">Options that change how this service is carried out.</p>
                    <ManagerSystemConfigurationEditor embedded customerId={customer.customer.id} systemKey={entry.key} systemLabel={entry.displayName} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} />
                  </section> : null}
                  {evidencePolicyAssignableSystemKeys.has(entry.key) ? <section aria-labelledby="service-settings-evidence">
                    <h3 id="service-settings-evidence">Evidence policy</h3>
                    <p className="support-metadata">Affects the legacy photo-evidence lifecycle only, never what is recorded.</p>
                    <ManagerEvidencePolicyEditor embedded customerId={customer.customer.id} systemKey={entry.key} systemLabel={entry.displayName} onSaved={onSaved} onAuthorityFailure={onAuthorityFailure} />
                  </section> : null}
                </div>
        ) : null}
      </div>
    ))}
  </section>;
}

const replicaRemarks: ResolvedRemarksDefinition = { policy: "optional", maxLength: 2000 };
const noop = () => undefined;

const humanize = (segment: string) => segment
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ")
  .replace(/^./, (first) => first.toUpperCase());

/**
 * Fallback when the GET carries no `formLayout` (an older API): one section per
 * top-level tree group, every field shown as a plain labelled box. Never used to
 * decide what is editable — every label path stays editable either way.
 */
function fallbackLayout(labels: ManagerLabelOverrideNode[]): ManagerLabelFormLayout {
  const sections = new Map<string, ManagerLabelFormSection>();
  for (const node of labels) {
    const group = node.path.split(".")[0] ?? node.path;
    const section = sections.get(group) ?? { key: group, heading: humanize(group), repeatable: null, fields: [] };
    section.fields.push({ path: node.path, control: "text", parentPath: null, result: null, unit: null, remarks: false });
    sections.set(group, section);
  }
  return { sections: [...sections.values()] };
}

const fieldDomId = (path: string) => `wording-${path.replace(/[^A-Za-z0-9_-]/g, "-")}`;

function ManagerFormWording({ customerId, systemKey, systemLabel, onSaved, onAuthorityFailure, onUnsavedChange }: {
  customerId: string; systemKey: string; systemLabel: string;
  onSaved: (customer: ManagerCustomer) => void; onAuthorityFailure: (error: ManagerApiError) => void;
  onUnsavedChange: (count: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<ManagerLabelOverrideNode[] | undefined>(undefined);
  const [layout, setLayout] = useState<ManagerLabelFormLayout | undefined>(undefined);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ path: string; value: string } | null>(null);
  const [search, setSearch] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const focusAfterClose = useRef<string | null>(null);

  const hydrate = (list: ManagerLabelOverrideNode[]) => {
    setLabels(list);
    setDraft(Object.fromEntries(list.filter((node) => node.overridden).map((node) => [node.path, node.effectiveLabel])));
    setEditing(null);
  };

  const load = async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const result = await loadManagerLabelOverrides(customerId, systemKey);
      setLayout(result.formLayout ?? fallbackLayout(result.labels));
      hydrate(result.labels);
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Form wording could not be loaded.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [customerId, systemKey]);

  useEffect(() => {
    if (editing || !focusAfterClose.current) return;
    document.getElementById(focusAfterClose.current)?.focus();
    focusAfterClose.current = null;
  }, [editing]);

  const nodes = useMemo(() => new Map((labels ?? []).map((node) => [node.path, node])), [labels]);
  const savedValue = (path: string) => { const node = nodes.get(path); return node?.overridden ? node.effectiveLabel : ""; };
  const draftValue = (path: string) => draft[path]?.trim() ?? "";
  const isCustom = (path: string) => draftValue(path).length > 0;
  const isChanged = (path: string) => draftValue(path) !== savedValue(path);
  const effectiveLabel = (path: string) => draftValue(path) || nodes.get(path)?.definitionLabel || path;
  const unsaved = labels ? labels.filter((node) => isChanged(node.path)).length : 0;
  /** An open inline editor whose value would change the draft once committed. */
  const editingDirty = editing !== null && (withValueFor(editing.path, editing.value) !== draftValue(editing.path));
  const customCount = labels ? labels.filter((node) => isCustom(node.path)).length : 0;

  useEffect(() => { onUnsavedChange(unsaved); }, [unsaved]);
  useEffect(() => () => onUnsavedChange(0), []);

  function withValueFor(path: string, value: string) {
    const trimmed = value.trim();
    return !trimmed || trimmed === nodes.get(path)?.definitionLabel ? "" : trimmed;
  }

  /** Applies an inline value to a draft: blank or the default wording clears the path. */
  const withValue = (current: Record<string, string>, path: string, value: string) => {
    const next = { ...current };
    const committed = withValueFor(path, value);
    if (committed) next[path] = committed;
    else delete next[path];
    return next;
  };

  const openEditor = (path: string) => {
    setMessage("");
    const committed = editing ? withValue(draft, editing.path, editing.value) : draft;
    if (editing) setDraft(committed);
    setEditing({ path, value: committed[path] ?? nodes.get(path)?.definitionLabel ?? "" });
  };
  const closeEditor = (path: string) => { focusAfterClose.current = fieldDomId(path); setEditing(null); };
  const done = () => { if (!editing) return; setDraft((current) => withValue(current, editing.path, editing.value)); closeEditor(editing.path); };
  const cancel = () => { if (editing) closeEditor(editing.path); };
  const reset = () => { if (!editing) return; setDraft((current) => withValue(current, editing.path, "")); closeEditor(editing.path); };

  const discard = () => {
    if (!labels) return;
    hydrate(labels); setError(""); setMessage("");
  };

  const save = async () => {
    const effectiveDraft = editing ? withValue(draft, editing.path, editing.value) : draft;
    setEditing(null); setDraft(effectiveDraft);
    setSaving(true); setError(""); setMessage("");
    const map: Record<string, string> = {};
    for (const [path, value] of Object.entries(effectiveDraft)) { const trimmed = value.trim(); if (trimmed) map[path] = trimmed; }
    try {
      const result = await saveManagerLabelOverrides(customerId, systemKey, map);
      hydrate(result.labels.labels);
      onSaved(result.customer);
      setMessage("Saved. A new configuration version was created. New service visits use this wording; existing visits keep theirs.");
    } catch (reason) {
      if (reason instanceof ManagerApiError && reason.kind !== "domain") onAuthorityFailure(reason);
      else setError(reason instanceof Error ? reason.message : "Form wording could not be saved.");
    } finally { setSaving(false); }
  };

  const query = search.trim().toLowerCase();
  const fieldVisible = (path: string) => {
    if (preview) return true;
    if (onlyCustom && !isCustom(path)) return false;
    if (!query) return true;
    const node = nodes.get(path);
    return effectiveLabel(path).toLowerCase().includes(query) || (node?.definitionLabel.toLowerCase().includes(query) ?? false);
  };

  const togglePreview = () => {
    if (editing) { setDraft((current) => withValue(current, editing.path, editing.value)); setEditing(null); }
    setPreview((current) => !current);
  };

  const fieldLabel = (path: string, options: { inline?: boolean } = {}) => {
    const label = effectiveLabel(path);
    if (preview) return options.inline ? <span>{label}</span> : <strong>{label}</strong>;
    const node = nodes.get(path);
    if (editing?.path === path && node) {
      return <div className="manager-wording-editor" role="group" aria-label={`Edit wording for ${node.definitionLabel}`}>
        <label>New wording
          <input
            autoFocus maxLength={200} value={editing.value}
            onChange={(event) => setEditing({ path, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); done(); }
              if (event.key === "Escape") { event.preventDefault(); cancel(); }
            }}
          />
        </label>
        <p className="support-metadata">Default wording: <strong>{node.definitionLabel}</strong></p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={!isCustom(path) && editing.value.trim() === node.definitionLabel} onClick={reset}>Reset to default</button>
          <button type="button" className="secondary-command" onClick={cancel}>Cancel</button>
          <button type="button" onClick={done}>Done</button>
        </div>
      </div>;
    }
    return <span className="manager-wording-label-row">
      <button type="button" id={fieldDomId(path)} className="manager-wording-label" aria-label={`Edit wording: ${label}`} onClick={() => openEditor(path)}>
        <span className="manager-wording-label-text">{label}</span>
        <span className="manager-wording-pencil" aria-hidden="true">✎</span>
      </button>
      {isCustom(path) ? <span className="manager-config-flag manager-config-flag--set manager-wording-badge">Custom</span> : null}
      {isChanged(path) ? <span className="manager-config-flag manager-config-flag--attention manager-wording-badge">Unsaved</span> : null}
    </span>;
  };

  const resultLookalike = (field: ManagerLabelFormField, label: string) => {
    if (!field.result || field.result.options.length === 0) return null;
    const definition: ResultControlDefinition = { type: field.result.type, required: true, options: field.result.options };
    return field.result.type === "multi_select"
      ? <MultiResultSelector definition={definition} value={null} readOnly label={`${label} result`} onChange={noop} />
      : <ResultSelector definition={definition} value={null} readOnly label={`${label} result`} onChange={noop} />;
  };

  const renderValue = (field: ManagerLabelFormField) => {
    const label = effectiveLabel(field.path);
    if (preview) {
      return <MeasurementValueInput key={field.path} definition={{ key: field.path, label, unit: field.unit ?? "", required: true }} value={null} readOnly onChange={noop} />;
    }
    return <div className="manager-wording-measurement-value" key={field.path}>
      {fieldLabel(field.path, { inline: true })}
      <span className="manager-wording-value-input">
        <input type="number" disabled aria-label={`${label} (${field.unit ?? ""}) — technician input`} />
        {field.unit ? <span className="support-metadata">{field.unit}</span> : null}
      </span>
    </div>;
  };

  const renderField = (field: ManagerLabelFormField, children: ManagerLabelFormField[]) => {
    const label = effectiveLabel(field.path);
    if (field.control === "measurement") {
      return <div className="measurement-card manager-wording-field" key={field.path}>
        {fieldLabel(field.path)}
        {children.map(renderValue)}
        {resultLookalike(field, label)}
        {field.remarks ? <RemarksField label="Remarks" definition={replicaRemarks} value="" readOnly onChange={noop} /> : null}
      </div>;
    }
    if (field.control === "text" || field.control === "measurement_value") {
      return <div className="manager-wording-field manager-wording-text" key={field.path}>
        {preview ? <label>{label}<input disabled /></label> : <>{fieldLabel(field.path)}<input disabled aria-label={`${label} — technician input`} /></>}
      </div>;
    }
    return <div className={`${field.control === "checklist_item" ? "hose-check-row" : "hose-component"} manager-wording-field`} key={field.path}>
      {fieldLabel(field.path)}
      {resultLookalike(field, label)}
      {field.remarks ? <RemarksField label="Remarks" definition={replicaRemarks} value="" readOnly onChange={noop} /> : null}
    </div>;
  };

  const renderSection = (section: ManagerLabelFormSection) => {
    const childrenOf = (path: string) => section.fields.filter((field) => field.parentPath === path);
    const topLevel = section.fields.filter((field) => field.parentPath === null
      || !section.fields.some((candidate) => candidate.path === field.parentPath));
    const visibleTop = topLevel.filter((field) => fieldVisible(field.path) || childrenOf(field.path).some((child) => fieldVisible(child.path)));
    if (visibleTop.length === 0) return null;
    const body = visibleTop.map((field) => renderField(field, childrenOf(field.path)));
    const headingId = `wording-section-${section.key}`;
    return <fieldset className="manager-wording-section" key={section.key} aria-labelledby={headingId}>
      <legend id={headingId}>{section.heading}</legend>
      {section.repeatable ? <section className="hose-row-card manager-wording-sample-row" aria-label={`${section.repeatable.rowHeading} 1 (sample row)`}>
        <h4>{section.repeatable.rowHeading} 1 <small className="support-metadata">sample row — the technician adds as many as needed</small></h4>
        {body}
        <RemarksField label="Remarks" definition={replicaRemarks} value="" readOnly onChange={noop} />
      </section> : body}
    </fieldset>;
  };

  const sections = layout?.sections ?? [];
  const renderedSections = sections.map(renderSection).filter(Boolean);

  return <div className={`manager-form-wording${preview ? " manager-form-wording--preview" : ""}`}>
    <p className="support-metadata">Click a field's label to change the wording a technician sees for this customer. This changes the wording on the form and the report only — never what is recorded, the result options or which fields exist.</p>
    <div className="manager-wording-toolbar">
      {!preview ? <>
        <label className="manager-wording-search">Search labels
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. pump" />
        </label>
        <label className="manager-wording-filter"><input type="checkbox" checked={onlyCustom} onChange={(event) => setOnlyCustom(event.target.checked)} />Show only custom labels</label>
      </> : null}
      <button type="button" className="secondary-command" aria-pressed={preview} onClick={togglePreview}>Preview as technician</button>
      <span className="support-metadata" role="status">{customCount} custom {customCount === 1 ? "label" : "labels"}</span>
    </div>
    {loading ? <p role="status">Loading form wording…</p> : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    {message ? <p className="form-message" role="status">{message}</p> : null}
    {preview ? <p className="operational-message">Technician preview of {systemLabel}: the wording a technician will see{unsaved > 0 ? `, including ${unsaved} unsaved ${unsaved === 1 ? "change" : "changes"}` : ""}. Controls are shown disabled.</p> : null}
    {labels && layout ? <>
      <fieldset className="manager-wording-form" disabled={false}>
        <legend className="visually-hidden">{systemLabel} form</legend>
        {renderedSections.length ? renderedSections : <p className="empty-state">{onlyCustom && !query ? "No custom labels yet." : "No fields match your search."}</p>}
      </fieldset>
      {!preview ? <div className="manager-wording-savebar" role="region" aria-label="Save form wording">
        <p aria-live="polite"><strong>{unsaved === 0 ? "No unsaved changes" : `${unsaved} unsaved ${unsaved === 1 ? "change" : "changes"}`}</strong><span className="support-metadata"> · Saving creates a new configuration version.</span></p>
        <div className="inline-actions">
          <button type="button" className="secondary-command" disabled={saving || unsaved === 0} onClick={discard}>Discard</button>
          <button type="button" disabled={saving || loading || (unsaved === 0 && !editingDirty)} onClick={() => void save()}>{saving ? "Saving…" : "Save wording"}</button>
        </div>
      </div> : null}
    </> : null}
  </div>;
}
