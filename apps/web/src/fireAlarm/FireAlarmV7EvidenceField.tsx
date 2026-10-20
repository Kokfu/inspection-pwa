import { useState } from "react";
import { PhotoCaptureActions } from "../attachments/PhotoCaptureActions";
import { processInspectionPhoto, requestPersistentAttachmentStorage } from "../attachments/imageProcessing";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { FireAlarmInspectionRecord } from "./fireAlarmTypes";
import { saveFireAlarmV7Photo, type FireAlarmV7FieldPath } from "./fireAlarmV7Evidence";

export function FireAlarmV7EvidenceField({ record, fieldPath, attachment, onChanged }: { record: FireAlarmInspectionRecord; fieldPath: FireAlarmV7FieldPath; attachment?: InspectionAttachmentRecord; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(blob: Blob, captureSource: "camera" | "gallery", capturedAt?: string) { setBusy(true); setMessage("Processing photo…"); try { void requestPersistentAttachmentStorage(); const photo = await processInspectionPhoto(blob); await saveFireAlarmV7Photo({ record, fieldPath, captureSource, ...photo, capturedAt }); await onChanged(); setMessage("Photo saved on this device."); } catch (error) { setMessage(error instanceof Error ? error.message : "Photo could not be saved"); } finally { setBusy(false); } }
  return <section className="photo-evidence-field" aria-label={`Evidence photo for ${fieldPath}`}><p className="secondary-metadata">{attachment ? `Photo attached on this device (${Math.round(attachment.sizeBytes / 1024)} KB)` : "No photo attached"}</p>{attachment?.captureSource === "gallery" ? <strong className="source-badge">Uploaded from gallery</strong> : null}<PhotoCaptureActions disabled={busy} hasPhoto={Boolean(attachment)} onCapture={(blob, at) => save(blob, "camera", at)} onGallery={(file) => save(file, "gallery")} />{message ? <p className="form-message" role="status">{message}</p> : null}</section>;
}
