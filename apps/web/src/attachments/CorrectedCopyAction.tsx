import { useEffect, useState } from "react";
import { localDatabase } from "../db/localDatabase";

/** I-21: "Start corrected copy" for a rejected record (or a Draft whose photos were already submitted). Shared by all systems. */
export function CorrectedCopyAction({ clientUuid, syncStatus, localUpdatedAt, onStart }: { clientUuid: string; syncStatus: string; localUpdatedAt: string; onStart: () => Promise<void> }) {
  const [hasSubmittedPhoto, setHasSubmittedPhoto] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void localDatabase.inspectionAttachments.where("inspectionClientUuid").equals(clientUuid).filter((photo) => photo.syncStatus !== "Draft").count()
      .then((count) => { if (active) setHasSubmittedPhoto(count > 0); }).catch(() => undefined);
    return () => { active = false; };
  }, [clientUuid, syncStatus, localUpdatedAt]);
  const available = syncStatus === "Failed" || syncStatus === "Conflict" || (syncStatus === "Draft" && hasSubmittedPhoto);
  if (!available) return null;
  return <section className="corrected-copy-action" aria-label="Corrected copy">
    <p className="secondary-metadata">Photos that were already submitted cannot be changed on this record. If the server rejected a photo, start a corrected copy: your answers and photos are copied into a new record, and this rejected one is archived on this device.</p>
    <button type="button" className="secondary-command" onClick={() => {
      if (window.confirm("Start a corrected copy?\n\nA new record is created with your answers and photos. The rejected record is archived on this device and will not sync.")) {
        void onStart().catch((error) => setMessage(error instanceof Error ? error.message : "The corrected copy could not be started."));
      }
    }}>Start corrected copy</button>
    {message ? <p className="form-message" role="alert">{message}</p> : null}
  </section>;
}
