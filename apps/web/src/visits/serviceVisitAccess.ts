import { notAuthorisedFromResponse } from "./customerTimelineServiceJob";

export const SERVICE_VISIT_NOT_ON_DEVICE_MESSAGE = "This service visit is not on this device. Reconnect to open it.";
export const SERVICE_VISIT_NOT_FOUND_MESSAGE = "Service visit not found.";
export const SERVICE_VISIT_RETRY_MESSAGE = "This service visit could not be checked right now. Reconnect or sign in and retry.";
export const SERVICE_VISIT_NOT_DOWNLOADED_MESSAGE = "This service visit is not downloaded to this device yet. Refresh to download it.";

export type MissingServiceVisitOutcome =
  | { kind: "local" }
  | { kind: "not-authorised"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "offline"; message: string }
  | { kind: "on-server"; message: string }
  | { kind: "retry"; message: string };

/** FR-18: decide what to show for #/job/:id when the id is not in the device's job list.
 * A job that exists locally never reaches the server; offline never calls it either. */
export async function resolveMissingServiceVisit(input: {
  jobId: string; userId: number; online: boolean; signal?: AbortSignal;
  isLocal: () => Promise<boolean>;
  fetchFn?: typeof fetch;
}): Promise<MissingServiceVisitOutcome> {
  if (await input.isLocal()) return { kind: "local" };
  if (!input.online) return { kind: "offline", message: SERVICE_VISIT_NOT_ON_DEVICE_MESSAGE };
  try {
    const response = await (input.fetchFn ?? fetch)(`/api/inspection-jobs/${encodeURIComponent(input.jobId)}`, {
      credentials: "same-origin", cache: "no-store", signal: input.signal,
      headers: { "X-Expected-User-Id": String(input.userId) }
    });
    if (response.status === 403) return { kind: "not-authorised", message: (await notAuthorisedFromResponse(response)).message };
    if (response.status === 404) return { kind: "not-found", message: SERVICE_VISIT_NOT_FOUND_MESSAGE };
    if (response.ok) return { kind: "on-server", message: SERVICE_VISIT_NOT_DOWNLOADED_MESSAGE };
    return { kind: "retry", message: SERVICE_VISIT_RETRY_MESSAGE };
  } catch {
    return { kind: "retry", message: SERVICE_VISIT_RETRY_MESSAGE };
  }
}
