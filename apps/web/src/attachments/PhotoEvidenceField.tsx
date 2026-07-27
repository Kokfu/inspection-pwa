import { useEffect, useRef, useState } from "react";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { EvidencePolicySnapshot } from "../jobs/jobTypes";
import {
  removeDraftInspectionAttachment,
  saveDraftInspectionAttachment
} from "./attachmentRepository";
import type { InspectionAttachmentRecord } from "./attachmentTypes";
import type { AutomaticSprinklerPsiFieldPath } from "./automaticSprinklerEvidencePolicy";
import { CameraCaptureDialog } from "./CameraCaptureDialog";
import {
  processInspectionPhoto,
  requestPersistentAttachmentStorage
} from "./imageProcessing";

type Props = {
  record: AutomaticSprinklerInspectionRecord;
  fieldPath: AutomaticSprinklerPsiFieldPath;
  policy: EvidencePolicySnapshot;
  attachment?: InspectionAttachmentRecord;
  onChange: () => Promise<void>;
};

export function PhotoEvidenceField({
  record,
  fieldPath,
  policy,
  attachment,
  onChange
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const processingGeneration = useRef(0);
  const processingController = useRef<AbortController | undefined>(undefined);
  const editable =
    record.syncStatus === "Draft" && !record.attachmentSetSubmittedAt;

  useEffect(() => {
    if (!attachment?.blob) {
      setPreviewUrl("");
      return () => undefined;
    }
    const url = URL.createObjectURL(attachment.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment?.blob, attachment?.localUpdatedAt]);

  useEffect(() => () => {
    processingGeneration.current += 1;
    processingController.current?.abort();
  }, []);

  async function store(blob: Blob, source: "camera" | "gallery", capturedAt?: string) {
    processingController.current?.abort();
    const controller = new AbortController();
    processingController.current = controller;
    const generation = ++processingGeneration.current;
    setBusy(true);
    setMessage("Processing photo...");
    try {
      void requestPersistentAttachmentStorage();
      const processed = await processInspectionPhoto(blob, controller.signal);
      if (controller.signal.aborted || generation !== processingGeneration.current) return;
      await saveDraftInspectionAttachment({
        inspectionClientUuid: record.clientUuid,
        fieldPath,
        policy,
        captureSource: source,
        ...processed,
        capturedAt,
        signal: controller.signal
      });
      if (controller.signal.aborted || generation !== processingGeneration.current) return;
      await onChange();
      if (controller.signal.aborted || generation !== processingGeneration.current) return;
      setMessage("Photo saved on this device.");
    } catch (error) {
      if (
        controller.signal.aborted
        || generation !== processingGeneration.current
        || error instanceof DOMException && error.name === "AbortError"
      ) return;
      setMessage(error instanceof Error ? error.message : "Photo could not be saved");
    } finally {
      if (generation === processingGeneration.current) {
        processingController.current = undefined;
        setBusy(false);
      }
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeDraftInspectionAttachment(record.clientUuid, fieldPath);
      await onChange();
      setFullViewOpen(false);
      setMessage("Photo removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Photo could not be removed");
    } finally {
      setBusy(false);
    }
  }

  return <section className="photo-evidence-field" aria-label="PSI photo evidence">
    {attachment && previewUrl ? <>
      <button type="button" className="photo-thumbnail" onClick={() => setFullViewOpen(true)}>
        <img src={previewUrl} alt="Attached PSI gauge evidence" />
      </button>
      <div className="photo-metadata">
        {attachment.captureSource === "gallery" ? <strong className="source-badge">Gallery attachment</strong> : null}
        <span>{new Date(attachment.capturedAt).toLocaleString()}</span>
        <span>{Math.round(attachment.sizeBytes / 1024)} KB</span>
        {attachment.syncStatus === "Failed" || attachment.syncStatus === "Conflict"
          ? <span className="error-text">{attachment.lastSyncError ?? "Photo upload failed"}</span>
          : <span>{attachment.syncStatus}</span>}
      </div>
    </> : <p className="secondary-metadata">No photo attached</p>}

    {editable ? <div className="photo-actions">
      <button type="button" disabled={busy} onClick={() => setCameraOpen(true)}>
        {attachment ? "Replace with Camera" : "Take Photo"}
      </button>
      <button type="button" className="secondary-command" disabled={busy} onClick={() => fileInput.current?.click()}>
        {attachment ? "Replace from Gallery" : "Camera unavailable? Choose Existing Photo"}
      </button>
      {attachment ? <button type="button" className="danger-command" disabled={busy} onClick={() => void remove()}>Remove</button> : null}
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void store(file, "gallery");
        }}
      />
    </div> : null}
    {message ? <p className="form-message" role="status">{message}</p> : null}

    {cameraOpen ? <CameraCaptureDialog
      onCapture={(blob, capturedAt) => store(blob, "camera", capturedAt)}
      onClose={() => setCameraOpen(false)}
    /> : null}
    {fullViewOpen && previewUrl ? <div className="photo-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Attached PSI photo">
      <section className="photo-dialog photo-full-view">
        <img src={previewUrl} alt="Full-size attached PSI gauge evidence" />
        <button type="button" className="secondary-command" onClick={() => setFullViewOpen(false)}>Close</button>
      </section>
    </div> : null}
  </section>;
}
