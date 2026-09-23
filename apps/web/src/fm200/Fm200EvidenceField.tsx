import { useRef, useState } from "react";
import { CameraCaptureDialog } from "../attachments/CameraCaptureDialog";
import { processInspectionPhoto, requestPersistentAttachmentStorage } from "../attachments/imageProcessing";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { Fm200MasterSystemFormInstanceRecord } from "./fm200Types";
import { saveV7SuppressionPhoto, type V7Fm200FieldPath } from "./fm200Evidence";

// Forked (not reused) from ../co2/V7EvidenceField.tsx: that component is typed
// against `MasterSystemFormInstanceRecord`/`saveV7SuppressionPhoto` from
// ../co2/co2Types and ../co2/v7Evidence, which are CO2/Wet-Chemical specific
// (systemKey union does not include "fm200_fire_suppression"), so it is not
// actually generic despite the name - it had to be forked, not imported.
export function Fm200EvidenceField({ record, fieldPath, attachment, onChanged }: { record: Fm200MasterSystemFormInstanceRecord; fieldPath: V7Fm200FieldPath; attachment?: InspectionAttachmentRecord; onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null); const [cameraOpen, setCameraOpen] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(blob: Blob, captureSource: "camera" | "gallery", capturedAt?: string) { setBusy(true); try { void requestPersistentAttachmentStorage(); const photo = await processInspectionPhoto(blob); await saveV7SuppressionPhoto({ record, fieldPath, captureSource, ...photo, capturedAt }); await onChanged(); setMessage("Photo saved on this device."); } catch (error) { setMessage(error instanceof Error ? error.message : "Photo could not be saved"); } finally { setBusy(false); } }
  return <section className="photo-evidence-field" aria-label={`Evidence photo for ${fieldPath}`}><p className="secondary-metadata">{attachment ? "Photo attached on this device" : "No photo attached"}</p><div className="photo-actions"><button type="button" disabled={busy} onClick={() => setCameraOpen(true)}>{attachment ? "Replace with Camera" : "Take Photo"}</button><button type="button" className="secondary-command" disabled={busy} onClick={() => input.current?.click()}>{attachment ? "Replace from Gallery" : "Choose Existing Photo"}</button><input ref={input} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void save(file, "gallery"); }} /></div>{message ? <p className="form-message">{message}</p> : null}{cameraOpen ? <CameraCaptureDialog onCapture={async (blob, at) => { setCameraOpen(false); await save(blob, "camera", at); }} onClose={() => setCameraOpen(false)} /> : null}</section>;
}
