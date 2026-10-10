/** The JSON body of a reply, or an empty object when it is missing or not JSON (a gateway page, for example). */
export async function readRefusalBody(response: Response): Promise<{ message?: unknown }> {
  try {
    const value: unknown = await response.clone().json();
    return value !== null && typeof value === "object" ? value as { message?: unknown } : {};
  } catch {
    return {};
  }
}

/**
 * I-51: what a 401 or 403 from `/api/sync` means to the technician. A 401 means the session has ended, so signing in
 * again is the right advice. A 403 means the server was reached and said no (for example the origin guard), so
 * "Sign in required" would send the technician the wrong way. The stored text is the only thing that differs: both
 * stay Failed and retry as before.
 */
export function syncRefusalMessage(status: number, body: { message?: unknown } = {}): string {
  if (status === 401) return "Sign in required before server sync";
  const reason = typeof body.message === "string" && body.message.trim() ? ` ${body.message.trim()}` : "";
  return `The server refused this sync request (HTTP ${status}).${reason} Tell your Admin if this keeps happening.`;
}
