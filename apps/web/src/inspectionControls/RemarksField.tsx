import { useEffect, useId, useRef, useState } from "react";
import { currentWorkspaceUserId } from "../db/localDatabase";
import type { ResolvedRemarksDefinition } from "./definitionTypes";
import { addCommonRemark, cachedCommonRemarks, onCommonRemarksChanged, refreshCommonRemarks, type CommonRemark, type RemarkSystem } from "./commonRemarks";
import { appendCommonRemark, appendOtherRemark, replaceRemark, singleRemarkSelection } from "./remarkFormatting";
import { isSectionRemarkKey, isSectionRemarkSystemKey } from "./remarkSections";
import { sectionRemarkMaxLength } from "./sectionRemarkText";
import { addSectionRemark, cachedSectionRemarks, onSectionRemarksChanged, refreshSectionRemarks, SectionRemarkInputError, sectionRemarkChoices, type SectionRemark } from "./sectionRemarks";

let refreshedAt = 0;
let refreshTask: Promise<unknown> | undefined;
function refreshOnce() {
  if (!navigator.onLine) return;
  if (Date.now() - refreshedAt < 60_000) return;
  if (!refreshTask) refreshTask = refreshCommonRemarks().then(() => { refreshedAt = Date.now(); }).catch(() => undefined).finally(() => { refreshTask = undefined; });
}

// CR-07: one prefetch per customer per minute, however many remark fields are on the form.
const sectionRefreshedAt = new Map<string, number>();
const sectionRefreshTasks = new Map<string, Promise<unknown>>();
function refreshSectionRemarksOnce(customerId: string) {
  if (!navigator.onLine) return;
  // Keyed by the signed-in workspace too: the cache is per user, so another user must not inherit this throttle.
  const key = `${currentWorkspaceUserId() ?? "none"}:${customerId.toLowerCase()}`;
  if (Date.now() - (sectionRefreshedAt.get(key) ?? 0) < 60_000 || sectionRefreshTasks.has(key)) return;
  sectionRefreshTasks.set(key, refreshSectionRemarks(customerId)
    .then(() => { sectionRefreshedAt.set(key, Date.now()); })
    .catch(() => undefined)
    .finally(() => { sectionRefreshTasks.delete(key); }));
}

type Props = {
  label: string;
  definition: ResolvedRemarksDefinition;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  systemKey?: RemarkSystem;
  /** CR-07: with `sectionKey`, remarks added here are stored per customer + system + section (Automatic Sprinkler pilot). */
  customerId?: string;
  sectionKey?: string;
  /** The name the technician sees for this section, used in the "Adds to ..." line. */
  sectionLabel?: string;
  /** The visit the remark is typed in (audit context only). */
  jobId?: string;
};

export function RemarksField({ label, definition, value, onChange, readOnly, systemKey, customerId, sectionKey, sectionLabel, jobId }: Props) {
  const [catalog, setCatalog] = useState<CommonRemark[]>([]);
  const [selected, setSelected] = useState("");
  const [otherDraft, setOtherDraft] = useState("");
  const [otherBase, setOtherBase] = useState("");
  const [message, setMessage] = useState("");
  const sectionScope = systemKey && customerId && sectionKey && isSectionRemarkSystemKey(systemKey) && isSectionRemarkKey(systemKey, sectionKey)
    ? { customerId: customerId.toLowerCase(), systemKey, sectionKey } : undefined;
  const [sectionList, setSectionList] = useState<SectionRemark[]>([]);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const draftId = useId();
  const draftBox = useRef<HTMLTextAreaElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const scopeCustomer = sectionScope?.customerId;
  useEffect(() => {
    if (!scopeCustomer) { setSectionList([]); return; }
    let active = true;
    const load = () => { void cachedSectionRemarks(scopeCustomer).then((items) => { if (active) setSectionList(items); }).catch(() => { if (active) setSectionList([]); }); };
    load(); refreshSectionRemarksOnce(scopeCustomer);
    const unsubscribe = onSectionRemarksChanged(load);
    return () => { active = false; unsubscribe(); };
  }, [scopeCustomer]);
  useEffect(() => { if (adding) draftBox.current?.focus(); }, [adding]);
  useEffect(() => {
    if (!systemKey) return;
    let active = true;
    const load = () => { void cachedCommonRemarks().then((items) => { if (active) setCatalog(items); }).catch(() => undefined); };
    load(); refreshOnce();
    const unsubscribe = onCommonRemarksChanged(load);
    return () => { active = false; unsubscribe(); };
  }, [systemKey]);
  const choices = catalog.filter((item) => item.systemKey === systemKey && item.active);
  const sectionChoices = sectionScope ? sectionRemarkChoices(sectionList, sectionScope.systemKey, sectionScope.sectionKey) : [];
  const choice = choices.find((item) => item.id === selected);
  const isOther = selected === "others";
  const selectedRemarks = value.split("\n").filter((remark) => remark.trim());
  function addSelection(item: CommonRemark, detail: string) {
    try { onChange(appendCommonRemark(value, item.wording, detail, definition.maxLength)); setSelected(""); setOtherDraft(""); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Remark could not be added."); }
  }
  function chooseRemark(id: string) {
    setMessage("");
    if (id === "others") {
      setOtherBase(value);
      setOtherDraft("");
      setSelected(id);
      return;
    }
    if (id.startsWith("section:")) {
      const added = sectionChoices.find((candidate) => `section:${candidate.id}` === id);
      if (added) addSelection({ id: added.id, systemKey: sectionScope!.systemKey, wording: added.wording, detailLabel: null, detailOptions: [], active: true }, "");
      return;
    }
    const item = choices.find((candidate) => candidate.id === id);
    if (item && item.detailOptions.length === 0) { addSelection(item, ""); return; }
    setSelected(id);
  }
  function updateOther(nextDraft: string) {
    try { onChange(appendOtherRemark(otherBase, nextDraft, definition.maxLength)); setOtherDraft(nextDraft); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Remark could not be entered."); }
  }
  async function saveOtherAsCommon() {
    if (!systemKey || !otherDraft.trim()) return;
    try { await addCommonRemark(systemKey, otherDraft); setSelected(""); setOtherDraft(""); setMessage("Added to common remarks on this device. It will be shared after sync."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Common remark could not be saved."); }
  }
  function closeEditor() { setAdding(false); setNewDraft(""); window.setTimeout(() => addButton.current?.focus()); }
  async function saveNewSectionRemark() {
    if (!sectionScope || saving) return;
    setSaving(true);
    try {
      // Check the field can hold the text BEFORE storing anything, so a refusal leaves nothing half-done.
      appendCommonRemark(value, newDraft.normalize("NFC").replace(/\s+/gu, " ").trim(), "", definition.maxLength);
      const remark = await addSectionRemark({ ...sectionScope, wording: newDraft, jobId, catalogWordings: choices.map((item) => item.wording) });
      onChange(appendCommonRemark(value, remark.wording, "", definition.maxLength));
      setSelected("");
      closeEditor();
      setMessage(`Added to ${sectionLabel ?? label} and used here. Saved on this device; it is shared with this customer's other technicians after sync.`);
    } catch (error) {
      setMessage(error instanceof SectionRemarkInputError || error instanceof Error ? error.message : "The remark could not be saved.");
    } finally { setSaving(false); }
  }
  if (definition.policy === "none") {
    return null;
  }
  if (!readOnly && sectionScope?.systemKey === "automatic_sprinkler" && sectionScope.sectionKey !== "comments") {
    return <SingleRowRemarks value={value} onChange={onChange} maxLength={definition.maxLength}
      choices={choices} sectionChoices={sectionChoices} scope={sectionScope} jobId={jobId} />;
  }
  return (
    <div className="common-remarks-field">
      {systemKey && readOnly ? <strong>Remark</strong> : null}
      {systemKey && !readOnly ? <div className="common-remarks-picker">
        <label>Remark<select value={selected} onChange={(event) => chooseRemark(event.target.value)}><option value="">Choose a remark</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.wording}</option>)}{sectionChoices.length > 0 ? <optgroup label="Added for this customer">{sectionChoices.map((item) => <option key={item.id} value={`section:${item.id}`}>{item.wording}</option>)}</optgroup> : null}<option value="others">Others</option></select></label>
        {choice?.detailOptions.length ? <label>{choice.detailLabel ?? "Detail"}<select value="" onChange={(event) => addSelection(choice, event.target.value)}><option value="">Select detail</option>{choice.detailOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : null}
        {isOther ? <><label>Type a new remark<textarea value={otherDraft} maxLength={definition.maxLength} onChange={(event) => updateOther(event.target.value)} /></label>{!sectionScope ? <button type="button" className="secondary-command" disabled={!otherDraft.trim()} onClick={() => void saveOtherAsCommon()}>Add to common remarks</button> : null}</> : null}
        {sectionScope && !adding ? <button ref={addButton} type="button" className="secondary-command section-remark-add" onClick={() => { setMessage(""); setNewDraft(""); setAdding(true); }}>Add new remark</button> : null}
        {sectionScope && adding ? <div className="section-remark-editor">
          <label htmlFor={draftId}>New remark for {sectionLabel ?? label}</label>
          <textarea id={draftId} ref={draftBox} value={newDraft} rows={3} maxLength={sectionRemarkMaxLength} aria-describedby={`${draftId}-note`} onChange={(event) => { setNewDraft(event.target.value); setMessage(""); }} />
          <p className="section-remark-counter" aria-live="off">{[...newDraft].length}/{sectionRemarkMaxLength}</p>
          <p id={`${draftId}-note`} className="section-remark-note">Adds to {sectionLabel ?? label} for this customer. This cannot be undone here.</p>
          <div className="section-remark-actions">
            <button type="button" disabled={saving || !newDraft.trim()} onClick={() => void saveNewSectionRemark()}>Save &amp; use</button>
            <button type="button" className="secondary-command" disabled={saving} onClick={closeEditor}>Cancel</button>
          </div>
        </div> : null}
      </div> : null}
      {systemKey ? selectedRemarks.length > 0 ? <ul className="selected-common-remarks" aria-label="Selected remarks">{selectedRemarks.map((remark, index) => <li key={`${index}:${remark}`}><span>{remark}</span>{!readOnly ? <button type="button" className="secondary-command" aria-label={`Remove remark ${remark}`} onClick={() => { onChange(selectedRemarks.filter((_, candidate) => candidate !== index).join("\n")); setSelected(""); setOtherDraft(""); }}>Remove</button> : null}</li>)}</ul> : null
        : <label>{label}<textarea value={value} maxLength={definition.maxLength} disabled={readOnly} onChange={(event) => onChange(event.target.value)} /></label>}
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </div>
  );
}

function SingleRowRemarks({ value, onChange, maxLength, choices, sectionChoices, scope, jobId }: {
  value: string; onChange: (value: string) => void; maxLength: number;
  choices: CommonRemark[]; sectionChoices: SectionRemark[];
  scope: { customerId: string; systemKey: "automatic_sprinkler"; sectionKey: string }; jobId?: string;
}) {
  const [editingOther, setEditingOther] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const noteId = useId();
  const allChoices = [...choices, ...sectionChoices.map((item) => ({ ...item, id: `section:${item.id}`, detailOptions: [] }))];
  const selection = singleRemarkSelection(value, allChoices);
  const selectedId = editingOther ? "others" : selection.id;
  const choice = choices.find((item) => item.id === selectedId);
  function write(wording: string, detail = "") {
    try { onChange(replaceRemark(wording, detail, maxLength)); setMessage(""); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Remark could not be entered."); return false; }
  }
  function choose(id: string) {
    const item = allChoices.find((candidate) => candidate.id === id);
    if (write(item?.wording ?? "")) setEditingOther(id === "others");
  }
  async function saveCommon() {
    if (saving || !value.trim()) return;
    setSaving(true);
    try {
      await addSectionRemark({ ...scope, wording: value, jobId, catalogWordings: choices.map((item) => item.wording) });
      setMessage("Added to common remarks on this device. It will be shared after sync.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The remark could not be saved."); }
    finally { setSaving(false); }
  }
  return <div className="common-remarks-field">
    {selection.legacy && !editingOther ? <>
      <ul className="selected-common-remarks" aria-label="Selected remarks">{value.split("\n").filter((line) => line.trim()).map((line, index) => <li key={index}><span>{line}</span></li>)}</ul>
      <p id={noteId} className="section-remark-note">Pick one remark to replace these</p>
    </> : null}
    <div className="common-remarks-picker">
      <label>Remark<select value={selectedId} aria-describedby={selection.legacy ? noteId : undefined} onChange={(event) => choose(event.target.value)}>
        {selection.legacy && !editingOther ? <option value="" disabled>Choose a remark</option> : null}
        <option value={selection.legacy && !editingOther ? "clear" : ""}>No remark</option>
        {choices.map((item) => <option key={item.id} value={item.id}>{item.wording}</option>)}
        {sectionChoices.length ? <optgroup label="Added for this customer">{sectionChoices.map((item) => <option key={item.id} value={`section:${item.id}`}>{item.wording}</option>)}</optgroup> : null}
        <option value="others">Others (type your own)</option>
      </select></label>
      {choice?.detailOptions.length ? <label>{choice.detailLabel ?? "Detail"}<select value={selection.detail} onChange={(event) => write(choice.wording, event.target.value)}>
        <option value="">Select detail</option>{choice.detailOptions.map((detail) => <option key={detail} value={detail}>{detail}</option>)}
      </select></label> : null}
      {selectedId === "others" ? <>
        <label>Type a new remark<textarea value={value} maxLength={maxLength} onChange={(event) => {
          // Reopened custom text must stay editable even when cleared or matching a choice.
          if (write(event.target.value)) setEditingOther(true);
        }} /></label>
        <button type="button" className="secondary-command" disabled={saving || !value.trim()} onClick={() => void saveCommon()}>Add to common remarks</button>
      </> : null}
    </div>
    {message ? <p className="form-message" role="status">{message}</p> : null}
  </div>;
}
