import { formatMalaysiaDateTime } from "../uiPresentation";

export type AcceptedCaptureSource = "camera" | "gallery" | "unknown";

const canonicalUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Fail-closed check of the two internal-only source fields on an accepted photo row.
 * `captureSource` is null for evidence staged before migration 047; `capturedAt` is null before 058. */
export function assertAcceptedPhotoSource(item: Record<string, unknown>) {
  const { captureSource, capturedAt } = item;
  if (captureSource !== null && captureSource !== "camera" && captureSource !== "gallery" && captureSource !== "unknown") throw new Error("Accepted evidence response is invalid");
  if (capturedAt !== null && (typeof capturedAt !== "string" || !canonicalUtc.test(capturedAt) || Number.isNaN(Date.parse(capturedAt)))) throw new Error("Accepted evidence response is invalid");
}

/** Internal screens only (Admin/Manager). Shown for gallery photos; camera, unknown and
 * pre-047 NULL sources show nothing, so a missing source is never presented as "camera". */
export function GalleryPhotoLabel({ captureSource, capturedAt }: { captureSource: AcceptedCaptureSource | null | undefined; capturedAt?: string | null }) {
  if (captureSource !== "gallery") return null;
  return <span className="gallery-photo-label" data-testid="gallery-photo-label"><strong>GALLERY</strong>{capturedAt ? ` · uploaded ${formatMalaysiaDateTime(capturedAt)}` : ""}</span>;
}
