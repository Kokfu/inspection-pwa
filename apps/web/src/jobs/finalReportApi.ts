export type FinalReportPreview = {
  customer: string; site: string; serviceDate: string; jobReference: string; completedAt: string; completedBy: string;
  systems: Array<{ systemKey: string; label: string; status: "Accepted"; locations: string[] }>;
  sections: Array<{ systemKey: string; label: string; location?: { locationId: string; locationLabel: string; zoneId: string | null; zoneLabel: string | null; instanceKey: string }; fields: Array<{ label: string; value: string; depth: number }>; evidence: Array<{ field: string; available: true }> }>;
};

export type FinalReportErrorKind = "authorization" | "domain" | "unavailable";

export class FinalReportApiError extends Error {
  constructor(message: string, public readonly kind: FinalReportErrorKind) {
    super(message);
  }
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const data = await response.json() as { message?: unknown };
    if (typeof data.message === "string" && data.message.trim()) return data.message;
  } catch { /* A non-JSON error response must not become trusted report data. */ }
  return fallback;
}

async function reportError(response: Response, unavailableFallback: string) {
  const authorization = response.status === 401 || response.status === 403;
  const kind: FinalReportErrorKind = authorization
    ? "authorization"
    : response.status >= 400 && response.status < 500
      ? "domain"
      : "unavailable";
  const fallback = authorization
    ? "Your session no longer permits this report. Please sign in again."
    : unavailableFallback;
  return new FinalReportApiError(await responseMessage(response, fallback), kind);
}

export async function loadFinalReport(jobId: string, endpointBase = "/api/inspection-jobs") {
  let response: Response;
  try { response = await fetch(`${endpointBase}/${encodeURIComponent(jobId)}/final-report`, { credentials: "same-origin", cache: "no-store" }); }
  catch { throw new FinalReportApiError("Final report is currently unavailable.", "unavailable"); }
  if (!response.ok) throw await reportError(response, "Final report is currently unavailable.");
  try {
    const data = await response.json() as { report?: FinalReportPreview };
    if (!data.report) throw new Error();
    return data.report;
  } catch { throw new FinalReportApiError("Final report is currently unavailable.", "unavailable"); }
}

const fallbackFilename = "Service-Report.pdf";

function safeFilename(contentDisposition: string | null) {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = contentDisposition?.match(/filename="([^"\r\n]+)"/i)?.[1];
  let candidate = quoted;
  if (encoded) {
    try { candidate = decodeURIComponent(encoded); } catch { candidate = undefined; }
  }
  if (!candidate) return fallbackFilename;
  const filename = candidate.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/^\.+/, "").trim().slice(0, 140);
  return filename.toLowerCase().endsWith(".pdf") && filename.length > 4 ? filename : fallbackFilename;
}

/** Downloads without navigating the SPA away from the completed service report. */
export async function downloadFinalReport(jobId: string, endpointBase = "/api/inspection-jobs") {
  let response: Response;
  try { response = await fetch(`${endpointBase}/${encodeURIComponent(jobId)}/final-report.pdf`, { credentials: "same-origin", cache: "no-store" }); }
  catch { throw new FinalReportApiError("The final report PDF could not be downloaded. Please try again.", "unavailable"); }
  if (!response.ok) throw await reportError(response, "The final report PDF could not be downloaded. Please try again.");
  const pdf = await response.blob();
  if (pdf.size === 0) throw new FinalReportApiError("The final report PDF was empty and was not downloaded.", "unavailable");
  const url = URL.createObjectURL(pdf);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(response.headers.get("content-disposition"));
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
