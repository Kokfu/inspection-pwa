export type FinalReportPreview = {
  customer: string; site: string; serviceDate: string; jobReference: string; completedAt: string; completedBy: string;
  systems: Array<{ systemKey: string; label: string; status: "Accepted"; locations: string[] }>;
  sections: Array<{ systemKey: string; label: string; location?: { locationId: string; locationLabel: string; zoneId: string | null; zoneLabel: string | null; instanceKey: string }; fields: Array<{ label: string; value: string; depth: number }>; evidence: Array<{ field: string; available: true }> }>;
};

export async function loadFinalReport(jobId: string, endpointBase = "/api/inspection-jobs") {
  const response = await fetch(`${endpointBase}/${encodeURIComponent(jobId)}/final-report`, { credentials: "same-origin", cache: "no-store" });
  const data = await response.json() as { report?: FinalReportPreview; message?: string };
  if (!response.ok || !data.report) throw new Error(data.message ?? "Final report is currently unavailable.");
  return data.report;
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

async function errorMessage(response: Response) {
  try {
    const data = await response.json() as { message?: unknown };
    if (typeof data.message === "string" && data.message.trim()) return data.message;
  } catch { /* The endpoint may return a non-JSON error body. */ }
  return response.status === 401 || response.status === 403
    ? "Your session no longer permits this download. Please sign in again."
    : "The final report PDF could not be downloaded. Please try again.";
}

/** Downloads without navigating the SPA away from the completed service report. */
export async function downloadFinalReport(jobId: string, endpointBase = "/api/inspection-jobs") {
  const response = await fetch(`${endpointBase}/${encodeURIComponent(jobId)}/final-report.pdf`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  const pdf = await response.blob();
  if (pdf.size === 0) throw new Error("The final report PDF was empty and was not downloaded.");
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
