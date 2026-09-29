import { useState } from "react";
import { loadTechnicianLocationProposalDraft, newUpdateFormatDraft, queueTechnicianLocationProposal, saveTechnicianLocationProposalDraft, syncPendingLocationProposals } from "./technicianLocationProposalDraft";

type Status = "idle" | "saving" | "pending" | "synced" | "failed";

export function SingleInstanceFormatAction({ jobId, customerId, systemKey, labels, configuredCount, actorUserId, canUseServer }: {
  jobId: string; customerId: string; systemKey: "smoke_ventilation" | "fire_intercom";
  labels: string[]; configuredCount: number; actorUserId: number; canUseServer: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  async function save() {
    setStatus("saving"); setError("");
    try {
      const proposedLabels = labels.map((label, index) => corrections[index] ?? label);
      if (!proposedLabels.length || proposedLabels.length > 250 || proposedLabels.some((label) => label.length > 200)) throw new Error("Add valid rows before saving a format.");
      const draft = newUpdateFormatDraft(jobId, customerId, systemKey, "general", proposedLabels.map((assetReference) => ({ assetReference })));
      await saveTechnicianLocationProposalDraft(draft);
      await queueTechnicianLocationProposal(draft);
      setStatus("pending");
      if (canUseServer && navigator.onLine) {
        await syncPendingLocationProposals(actorUserId);
        const refreshed = await loadTechnicianLocationProposalDraft(jobId, systemKey, "general");
        setStatus(refreshed?.status === "Synced" ? "synced" : refreshed?.status === "Failed" ? "failed" : "pending");
        if (refreshed?.status === "Failed") setError(refreshed.lastError ?? "This format could not be submitted.");
      }
    } catch (cause) {
      setStatus("failed"); setError(cause instanceof Error ? cause.message : "This format could not be saved.");
    }
  }
  return <div>
    {configuredCount > 0 ? <div><p>Correct a configured label for the next visit here. This visit keeps its frozen inspection row.</p>
      {labels.slice(0, configuredCount).map((label, index) => <label key={index}>Format label {index + 1}<input maxLength={200} value={corrections[index] ?? label} onChange={(event) => { setCorrections((current) => ({ ...current, [index]: event.target.value })); setStatus("idle"); }} /></label>)}
    </div> : null}
    <div className="inline-actions"><button type="button" className="secondary-command" disabled={status === "saving"} onClick={() => void save()}>{status === "saving" ? "Saving format…" : "Save as format for next visit"}</button>{status === "pending" ? <span className="support-metadata">Saved on this device, pending sync.</span> : null}{status === "synced" ? <span className="support-metadata">Submitted for Supervisor review.</span> : null}{status === "failed" ? <span className="form-message" role="alert">{error}</span> : null}</div>
  </div>;
}
