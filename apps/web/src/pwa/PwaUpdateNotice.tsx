type Props = {
  updateAvailable: boolean;
  reloadPending: boolean;
  updating: boolean;
  safeToUpdate: boolean;
  onUpdate: () => void;
};

export function PwaUpdateNotice({ updateAvailable, reloadPending, updating, safeToUpdate, onUpdate }: Props) {
  if (!updateAvailable && !reloadPending) return null;

  const guidance = reloadPending
    ? safeToUpdate
      ? "The update is ready. Reload when you are ready to continue."
      : "The update is ready. Save your draft and return to My Service Jobs before reloading."
    : safeToUpdate
      ? "A newer version of the inspection app is ready."
      : "Save your draft and return to My Service Jobs before updating.";

  return (
    <aside className="pwa-update-notice" role="status" aria-live="polite" aria-atomic="true">
      <div>
        <strong>New version available</strong>
        <p>{guidance}</p>
      </div>
      {safeToUpdate ? (
        <button type="button" onClick={onUpdate} disabled={updating}>
          {reloadPending ? "Reload to finish update" : updating ? "Updating…" : "Update now"}
        </button>
      ) : null}
    </aside>
  );
}
