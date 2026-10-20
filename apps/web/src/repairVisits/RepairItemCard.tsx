import { useEffect, useRef, useState } from "react";
import { CameraCaptureDialog } from "../attachments/CameraCaptureDialog";
import { beginWorkspaceActivity } from "../db/workspaceActivity";
import { formatClientDate, formatClientDateTime } from "../uiPresentation";
import { downloadBeforePhoto, readCachedBeforePhoto } from "./repairVisitOffline";
import { fetchAfterPhoto } from "./repairVisitApi";
import { beforeResultLabel, itemProblems, NO_PHOTO_AT_PREVIOUS_VISIT, NO_PREVIOUS_VISIT, outcomeLabel } from "./repairVisitPresentation";
import { captureItemPhoto, removeItem, saveItemDraft } from "./repairVisitRepository";
import type { LocalRepairVisit, LocalRepairVisitItem, LocalRepairVisitPhoto, RepairVisitOutcome } from "./repairVisitTypes";

const saveDelayMs = 500;
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/** A Blob shown as an image; the object URL is released when the Blob changes or the card goes away. */
export function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next); }, [blob]);
  return url ? <a className="rv-photo-link" href={url} target="_blank" rel="noreferrer" aria-label={`Open full size: ${alt}`}><img src={url} alt={alt} width={640} height={480} loading="lazy" /></a> : null;
}

type BeforeState = { state: "loading" } | { state: "ready"; blob: Blob } | { state: "missing" } | { state: "error"; text: string };

function BeforePhoto({ visit, item, connected }: { visit: LocalRepairVisit; item: LocalRepairVisitItem; connected: boolean }) {
  const photo = item.before?.photo ?? null;
  const previous = visit.previousVisit;
  const [result, setResult] = useState<BeforeState>({ state: "loading" });
  useEffect(() => {
    if (!photo || !previous) return;
    let active = true;
    setResult({ state: "loading" });
    (async () => {
      const cached = await readCachedBeforePhoto(previous, photo);
      if (cached) return { state: "ready", blob: cached } as const;
      if (!connected) return { state: "missing" } as const;
      return { state: "ready", blob: await downloadBeforePhoto(visit.customerId, visit.siteId, previous, photo) } as const;
    })().then(value => { if (active) setResult(value); })
      .catch(error => { if (active) setResult({ state: "error", text: message(error, "The Before photo could not be loaded.") }); });
    return () => { active = false; };
  }, [photo?.photoUuid, photo?.storedSha256, previous?.visitId, previous?.kind, connected, visit.customerId, visit.siteId]);
  if (!photo) return <p className="rv-no-photo">{NO_PHOTO_AT_PREVIOUS_VISIT}</p>;
  if (result.state === "ready") return <BlobImage blob={result.blob} alt="Before photo from the previous visit" />;
  if (result.state === "missing") return <p className="rv-no-photo">The Before photo is not saved on this device. Use Download for offline while connected.</p>;
  if (result.state === "error") return <p className="rv-error" role="alert">{result.text}</p>;
  return <p role="status">Loading Before photo…</p>;
}

export function BeforePanel({ visit, item, connected }: { visit: LocalRepairVisit; item: LocalRepairVisitItem; connected: boolean }) {
  const before = item.before;
  return <section className="rv-panel rv-panel--before" aria-label="Before (read only)">
    <h4>Before <span className="rv-readonly">read only</span></h4>
    {!visit.previousVisit ? <p className="rv-no-photo">{NO_PREVIOUS_VISIT}</p>
      : !before ? <p className="rv-no-photo">The previous result is not available for this field.</p>
        : <>
          <p className="rv-meta">{before.visitNumber} · {formatClientDate(before.visitDate)}</p>
          <p><span className="rv-label">Result:</span> <strong>{beforeResultLabel(before.result)}</strong></p>
          <p className="rv-remark"><span className="rv-label">Remark:</span> {before.remark.trim() ? before.remark : "No remark recorded."}</p>
          <BeforePhoto visit={visit} item={item} connected={connected} />
        </>}
  </section>;
}

function AfterPhoto({ visit, item, photo, connected }: { visit: LocalRepairVisit; item: LocalRepairVisitItem; photo: LocalRepairVisitPhoto | undefined; connected: boolean }) {
  const [remote, setRemote] = useState<{ blob?: Blob; error?: string }>({});
  const needsRemote = !photo && Boolean(item.photoUuid);
  useEffect(() => {
    if (!needsRemote || !connected || !item.photoUuid) return;
    let active = true;
    fetchAfterPhoto(visit.clientUuid, item.photoUuid).then(blob => { if (active) setRemote({ blob }); })
      .catch(error => { if (active) setRemote({ error: message(error, "The After photo could not be loaded.") }); });
    return () => { active = false; };
  }, [needsRemote, connected, visit.clientUuid, item.photoUuid]);
  if (photo) return <>
    <BlobImage blob={photo.blob} alt="After photo for this field" />
    <p className="rv-meta">Taken {formatClientDateTime(photo.capturedAt)}</p>
  </>;
  if (remote.blob) return <BlobImage blob={remote.blob} alt="After photo for this field" />;
  if (remote.error) return <p className="rv-error" role="alert">{remote.error}</p>;
  return <p className="rv-no-photo">{needsRemote ? "The After photo is on the server. Connect to view it." : "No After photo."}</p>;
}

export type ItemRegistry = { register: (itemUuid: string, flush: () => Promise<void>) => void; unregister: (itemUuid: string) => void };

export function RepairItemCard({ visit, item, photo, editable, canRemove, attempted, position, total, connected, registry }: {
  visit: LocalRepairVisit; item: LocalRepairVisitItem; photo: LocalRepairVisitPhoto | undefined; editable: boolean; canRemove: boolean;
  attempted: boolean; position: number; total: number; connected: boolean; registry: ItemRegistry;
}) {
  const [remark, setRemark] = useState(item.remark);
  // Shown at once; the saved value follows through the live query. A failed save puts the saved value back.
  const [outcome, setOutcome] = useState(item.outcome);
  useEffect(() => { setOutcome(item.outcome); }, [item.outcome]);
  const [status, setStatus] = useState("");
  // OA-14: the photo has its own status line, so a later remark autosave cannot overwrite "Photo saved on this device."
  const [photoStatus, setPhotoStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const pending = useRef<string | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const uuid = item.clientUuid;

  function flush(): Promise<void> {
    window.clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      if (pending.current === undefined) return;
      const value = pending.current; pending.current = undefined;
      const finish = beginWorkspaceActivity();
      try {
        await saveItemDraft(uuid, { remark: value });
        if (mounted.current) { setStatus("Saved on this device."); setError(""); }
      } catch (caught) {
        pending.current ??= value;
        if (mounted.current) { setStatus(""); setError(message(caught, "The remark could not be saved on this device. Keep this screen open and try again.")); }
      } finally { finish(); }
    });
    return chain.current;
  }
  useEffect(() => {
    mounted.current = true;
    registry.register(uuid, flush);
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", hide);
    return () => {
      mounted.current = false; void flush(); registry.unregister(uuid);
      document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide);
    };
  }, [uuid]);

  function onRemark(value: string) {
    setRemark(value); pending.current = value; setStatus("Saving on this device…");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), saveDelayMs);
  }
  async function chooseOutcome(next: RepairVisitOutcome) {
    setError(""); setOutcome(next);
    const finish = beginWorkspaceActivity();
    try { await saveItemDraft(uuid, { outcome: next }); setStatus("Saved on this device."); }
    catch (caught) { setOutcome(item.outcome); setError(message(caught, "The result could not be saved on this device.")); }
    finally { finish(); }
  }
  async function storePhoto(blob: Blob, source: "camera" | "gallery") {
    setBusy(true); setError(""); setPhotoStatus("Processing photo…");
    const finish = beginWorkspaceActivity();
    try { await captureItemPhoto(uuid, blob, source); if (mounted.current) setPhotoStatus("Photo saved on this device."); }
    catch (caught) { if (mounted.current) { setPhotoStatus(""); setError(message(caught, "The photo could not be saved. Your earlier photo is kept.")); } }
    finally { finish(); if (mounted.current) setBusy(false); }
  }
  async function remove() {
    setError("");
    try { await flush(); await removeItem(uuid); } catch (caught) { setError(message(caught, "The field could not be removed.")); }
  }

  const problems = itemProblems({ ...item, outcome, remark }, photo);
  const showProblems = attempted && editable && problems.length > 0;
  const heading = `${item.systemLabel} › ${item.unitLabel} › ${item.sectionLabel} › ${item.fieldLabel}`;
  const outcomeError = showProblems && problems.includes("outcome");
  const remarkError = showProblems && problems.includes("remark");
  const photoError = showProblems && problems.includes("photo");
  const notDone = outcome === "not_done";

  return <article className={`rv-item${showProblems ? " rv-item--incomplete" : ""}`} aria-labelledby={`rv-item-${uuid}`} data-rv-item={uuid}>
    <h3 id={`rv-item-${uuid}`} tabIndex={-1}><span className="rv-item-count">Field {position} of {total}</span>{heading}</h3>
    <div className="rv-compare">
      <BeforePanel visit={visit} item={item} connected={connected} />
      <section className="rv-panel rv-panel--after" aria-label="After repair">
        <h4>After</h4>
        {editable ? <>
          <fieldset className="rv-outcome" aria-describedby={outcomeError ? `rv-outcome-error-${uuid}` : undefined}>
            <legend>Result (required)</legend>
            {(["done_repair", "not_done"] as const).map(value => <label key={value} className={`rv-choice${outcome === value ? " rv-choice--selected" : ""}`}>
              <input type="radio" name={`rv-outcome-${uuid}`} value={value} checked={outcome === value} onChange={() => void chooseOutcome(value)} />
              <span>{outcomeLabel(value)}</span>
            </label>)}
          </fieldset>
          {outcomeError ? <p id={`rv-outcome-error-${uuid}`} className="rv-error" role="alert">Choose Done Repair or Not Done.</p> : null}
          <div className="rv-field">
            <label htmlFor={`rv-remark-${uuid}`}>{notDone ? "Reason not done (required)" : "Repair remark (required)"}</label>
            <textarea id={`rv-remark-${uuid}`} rows={4} maxLength={4000} value={remark} autoComplete="off" aria-required="true" aria-invalid={remarkError || undefined}
              aria-describedby={remarkError ? `rv-remark-error-${uuid}` : undefined} onChange={event => onRemark(event.target.value)} onBlur={() => void flush()} />
            {remarkError ? <p id={`rv-remark-error-${uuid}`} className="rv-error" role="alert">{notDone ? "Enter why this was not done." : "Enter what was repaired."}</p> : null}
          </div>
          <div className="rv-photo">
            <p className="rv-label" id={`rv-photo-label-${uuid}`}>After photo (required)</p>
            <AfterPhoto visit={visit} item={item} photo={photo} connected={connected} />
            <div className="rv-actions" role="group" aria-labelledby={`rv-photo-label-${uuid}`}>
              <button ref={cameraButton} type="button" disabled={busy} onClick={() => setCamera(true)}>Take photo</button>
              <button type="button" className="secondary-command" disabled={busy} onClick={() => fileInput.current?.click()}>{photo ? "Replace photo" : "Choose photo"}</button>
            </div>
            <input ref={fileInput} className="rv-file" type="file" accept="image/*" aria-label={`Choose After photo for ${item.fieldLabel}`} tabIndex={-1}
              onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) void storePhoto(selected, "gallery"); }} />
            {photoError ? <p className="rv-error" role="alert">Add an After photo.</p> : null}
          </div>
          <p className="rv-save-status" role="status" aria-live="polite"><span>{status}</span>{status && photoStatus ? " " : null}<span>{photoStatus}</span></p>
          {error ? <p className="rv-error" role="alert">{error}</p> : null}
          {canRemove ? <button type="button" className="secondary-command rv-remove" onClick={() => void remove()}>Remove this field</button> : null}
        </> : <>
          <p><span className="rv-label">Result:</span> <strong>{outcomeLabel(item.outcome)}</strong></p>
          <p className="rv-remark"><span className="rv-label">{notDone ? "Reason not done:" : "Repair remark:"}</span> {item.remark || "—"}</p>
          <AfterPhoto visit={visit} item={item} photo={photo} connected={connected} />
        </>}
      </section>
    </div>
    {camera ? <CameraCaptureDialog onClose={() => setCamera(false)} onCapture={async blob => { await storePhoto(blob, "camera"); setCamera(false); cameraButton.current?.focus(); }} /> : null}
  </article>;
}
