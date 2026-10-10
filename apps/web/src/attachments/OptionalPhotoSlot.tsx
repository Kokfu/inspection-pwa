import { Fragment, useState, type ReactNode } from "react";
import type { InspectionAttachmentRecord } from "./attachmentTypes";
import { removeDraftEvidencePhoto } from "./optionalGoodPhoto";

type Props = {
  inspectionClientUuid: string;
  attachment?: InspectionAttachmentRecord;
  /** Draft record: capture / replace / remove are offered.  Otherwise the slot only reports what is attached. */
  editable: boolean;
  onChanged: () => Promise<void>;
  /** The system's own capture control (its existing V7EvidenceField), so the optional photo uses the very same pipeline as a Poor photo. */
  children: ReactNode;
};

/** "Photo (optional)" wrapper shown under a Good / N.A. result.  It never blocks Submit. */
export function OptionalPhotoSlot({ inspectionClientUuid, attachment, editable, onChanged, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Remounting the capture control after a removal drops its stale "Photo saved" message.
  const [removals, setRemovals] = useState(0);
  async function remove() {
    if (!attachment) return;
    setBusy(true);
    try { await removeDraftEvidencePhoto(attachment.photoUuid, inspectionClientUuid); await onChanged(); setRemovals((count) => count + 1); setMessage("Photo removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Photo could not be removed."); }
    finally { setBusy(false); }
  }
  return <section className="optional-photo-slot" aria-label="Photo (optional)">
    <strong className="optional-photo-slot__title">Photo (optional)</strong>
    <Fragment key={removals}>{children}</Fragment>
    {editable && attachment ? <button type="button" className="secondary-command optional-photo-slot__remove" disabled={busy} onClick={() => void remove()}>Remove Photo</button> : null}
    {message ? <p className="form-message" role="status">{message}</p> : null}
  </section>;
}
