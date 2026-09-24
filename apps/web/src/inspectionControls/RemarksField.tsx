import { useEffect, useState } from "react";
import type { ResolvedRemarksDefinition } from "./definitionTypes";
import { addCommonRemark, cachedCommonRemarks, onCommonRemarksChanged, refreshCommonRemarks, type CommonRemark, type RemarkSystem } from "./commonRemarks";
import { appendCommonRemark, appendOtherRemark } from "./remarkFormatting";

let refreshedAt = 0;
let refreshTask: Promise<unknown> | undefined;
function refreshOnce() {
  if (Date.now() - refreshedAt < 60_000) return;
  if (!refreshTask) refreshTask = refreshCommonRemarks().then(() => { refreshedAt = Date.now(); }).catch(() => undefined).finally(() => { refreshTask = undefined; });
}

type Props = {
  label: string;
  definition: ResolvedRemarksDefinition;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  systemKey?: RemarkSystem;
};

export function RemarksField({ label, definition, value, onChange, readOnly, systemKey }: Props) {
  const [catalog, setCatalog] = useState<CommonRemark[]>([]);
  const [selected, setSelected] = useState("");
  const [otherDraft, setOtherDraft] = useState("");
  const [otherBase, setOtherBase] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!systemKey) return;
    let active = true;
    const load = () => { void cachedCommonRemarks().then((items) => { if (active) setCatalog(items); }).catch(() => undefined); };
    load(); refreshOnce();
    const unsubscribe = onCommonRemarksChanged(load);
    return () => { active = false; unsubscribe(); };
  }, [systemKey]);
  const choices = catalog.filter((item) => item.systemKey === systemKey && item.active);
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
  if (definition.policy === "none") {
    return null;
  }
  return (
    <div className="common-remarks-field">
      {systemKey && readOnly ? <strong>Remark</strong> : null}
      {systemKey && !readOnly ? <div className="common-remarks-picker">
        <label>Remark<select value={selected} onChange={(event) => chooseRemark(event.target.value)}><option value="">Choose a remark</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.wording}</option>)}<option value="others">Others</option></select></label>
        {choice?.detailOptions.length ? <label>{choice.detailLabel ?? "Detail"}<select value="" onChange={(event) => addSelection(choice, event.target.value)}><option value="">Select detail</option>{choice.detailOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : null}
        {isOther ? <><label>Type a new remark<textarea value={otherDraft} maxLength={definition.maxLength} onChange={(event) => updateOther(event.target.value)} /></label><button type="button" className="secondary-command" disabled={!otherDraft.trim()} onClick={() => void saveOtherAsCommon()}>Add to common remarks</button></> : null}
      </div> : null}
      {systemKey ? selectedRemarks.length > 0 ? <ul className="selected-common-remarks" aria-label="Selected remarks">{selectedRemarks.map((remark, index) => <li key={`${index}:${remark}`}><span>{remark}</span>{!readOnly ? <button type="button" className="secondary-command" aria-label={`Remove remark ${remark}`} onClick={() => { onChange(selectedRemarks.filter((_, candidate) => candidate !== index).join("\n")); setSelected(""); setOtherDraft(""); }}>Remove</button> : null}</li>)}</ul> : null
        : <label>{label}<textarea value={value} maxLength={definition.maxLength} disabled={readOnly} onChange={(event) => onChange(event.target.value)} /></label>}
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </div>
  );
}
