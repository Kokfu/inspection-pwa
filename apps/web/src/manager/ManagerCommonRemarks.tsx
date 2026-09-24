import { useEffect, useState } from "react";
import { addCommonRemark, cachedCommonRemarks, onCommonRemarksChanged, refreshCommonRemarks, removeCommonRemark, remarkSystems, updateCommonRemark, type CommonRemark, type RemarkSystem } from "../inspectionControls/commonRemarks";

const systemNames: Record<RemarkSystem, string> = { automatic_sprinkler: "Automatic Sprinkler", hose_reel: "Hose Reel", hydrant: "Hydrant", fire_alarm_detector: "Fire Alarm Panel", fm200_fire_suppression: "FM200", co2_fire_extinguisher: "CO2" };
export function ManagerCommonRemarks() {
  const [systemKey, setSystemKey] = useState<RemarkSystem>("automatic_sprinkler");
  const [remarks, setRemarks] = useState<CommonRemark[]>([]);
  const [newWording, setNewWording] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [wording, setWording] = useState("");
  const [detailLabel, setDetailLabel] = useState("");
  const [detailOptions, setDetailOptions] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => { void cachedCommonRemarks().then((items) => { if (active) setRemarks(items); }).catch(() => undefined); };
    load(); void refreshCommonRemarks().then(load).catch(() => setMessage("Showing common remarks saved on this device."));
    const unsubscribe = onCommonRemarksChanged(load);
    return () => { active = false; unsubscribe(); };
  }, []);
  function startEdit(item: CommonRemark) { setEditing(item.id); setWording(item.wording); setDetailLabel(item.detailLabel ?? ""); setDetailOptions(item.detailOptions.join("\n")); setMessage(""); }
  async function saveEdit() {
    if (!editing) return;
    try { await updateCommonRemark(editing, { wording: wording.trim(), detailLabel: detailLabel.trim() || null, detailOptions: detailOptions.split("\n").map((item) => item.trim()).filter(Boolean) }); setEditing(null); setMessage("Common remark updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update common remark."); }
  }
  async function add() {
    try { await addCommonRemark(systemKey, newWording); setNewWording(""); setMessage("Saved on this device. It will be shared after sync."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not add common remark."); }
  }
  async function remove(item: CommonRemark) {
    if (!window.confirm(`Remove “${item.wording}” from ${systemNames[systemKey]} common remarks? Existing inspection text will remain.`)) return;
    try { await removeCommonRemark(item.id); setMessage("Common remark removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove common remark."); }
  }
  return <section aria-labelledby="manager-common-remarks-title"><h3 id="manager-common-remarks-title">Service common remarks</h3>
    <label>Service<select value={systemKey} onChange={(event) => { setSystemKey(event.target.value as RemarkSystem); setEditing(null); }}>{remarkSystems.map((key) => <option key={key} value={key}>{systemNames[key]}</option>)}</select></label>
    <ul>{remarks.filter((item) => item.systemKey === systemKey && item.active).map((item) => <li key={item.id}>{item.wording}{item.detailOptions.length ? ` (${item.detailOptions.join(", ")})` : ""} <button type="button" className="secondary-command" onClick={() => startEdit(item)}>Edit</button> <button type="button" className="secondary-command" onClick={() => void remove(item)}>Remove</button></li>)}</ul>
    {editing ? <div><h4>Edit common remark</h4><label>Wording<input maxLength={300} value={wording} onChange={(event) => setWording(event.target.value)} /></label><label>Detail label<input maxLength={80} value={detailLabel} onChange={(event) => setDetailLabel(event.target.value)} /></label><label>Detail choices (one per line)<textarea value={detailOptions} onChange={(event) => setDetailOptions(event.target.value)} /></label><button type="button" onClick={() => void saveEdit()}>Save changes</button><button type="button" className="secondary-command" onClick={() => setEditing(null)}>Cancel</button></div> : null}
    <label>Add common remark for {systemNames[systemKey]}<input maxLength={300} value={newWording} onChange={(event) => setNewWording(event.target.value)} /></label><button type="button" onClick={() => void add()}>Add common remark</button>
    {message ? <p role="status" className="form-message">{message}</p> : null}
  </section>;
}
