export type ServerMasterSystemInspectionSummary = {
  clientUuid: string;
  jobId: string;
  systemKey: "hose_reel" | "co2_fire_extinguisher" | "automatic_sprinkler" | "dry_wet_riser";
  instanceKey: string;
  zoneId: string | null;
  locationId: string | null;
  displaySequence: number;
  status: "submitted";
  performedAt: string;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
};

type SummaryPage = { inspections: ServerMasterSystemInspectionSummary[]; hasMore: boolean; nextCursor: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const systemKeys = new Set<ServerMasterSystemInspectionSummary["systemKey"]>(["hose_reel", "co2_fire_extinguisher", "automatic_sprinkler", "dry_wet_riser"]);
const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "zoneId", "locationId", "displaySequence", "status", "performedAt", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];

function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function exact(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every((key) => key in value); }
function nullableString(value: unknown) { return value === null || typeof value === "string"; }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value) && !Number.isNaN(Date.parse(value)); }
function validCursor(value: string) { try { const json = atob(value.replace(/-/g, "+").replace(/_/g, "/")); const cursor = JSON.parse(json) as { performedAt?: unknown; clientUuid?: unknown }; return timestamp(cursor.performedAt) && typeof cursor.clientUuid === "string" && uuid.test(cursor.clientUuid); } catch { return false; } }

export function parseServerMasterSystemInspectionPage(value: unknown): SummaryPage {
  const payload = record(value);
  if (!payload || !exact(payload, ["inspections", "hasMore", "nextCursor"]) || !Array.isArray(payload.inspections) || typeof payload.hasMore !== "boolean" || !(payload.nextCursor === null || typeof payload.nextCursor === "string" && payload.nextCursor.length > 0 && payload.nextCursor.length <= 256 && validCursor(payload.nextCursor)) || (payload.hasMore !== (payload.nextCursor !== null))) throw new Error("Invalid server inspection summary page");
  const clientUuids = new Set<string>(); const identities = new Set<string>();
  const inspections = payload.inspections.map((entry) => {
    const item = record(entry);
    if (!item || !exact(item, keys) || typeof item.clientUuid !== "string" || !uuid.test(item.clientUuid) || typeof item.jobId !== "string" || !uuid.test(item.jobId) || typeof item.systemKey !== "string" || !systemKeys.has(item.systemKey as ServerMasterSystemInspectionSummary["systemKey"]) || typeof item.instanceKey !== "string" || !nullableString(item.zoneId) || !nullableString(item.locationId) || !Number.isInteger(item.displaySequence) || (item.displaySequence as number) < 1 || (item.displaySequence as number) > 100000 || item.status !== "submitted" || !timestamp(item.performedAt) || !nullableString(item.deviceReportedCreatorUsername) || !nullableString(item.verifiedOriginalCreatorUsername) || typeof item.syncedByUsername !== "string") throw new Error("Invalid server inspection summary");
    const systemKey = item.systemKey as ServerMasterSystemInspectionSummary["systemKey"];
    const single = systemKey !== "co2_fire_extinguisher";
    if ((single && (item.instanceKey !== "primary" || item.zoneId !== null || item.locationId !== null || item.displaySequence !== 1)) || (!single && (!/^location:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.instanceKey) || !uuid.test(item.locationId as string) || (item.zoneId !== null && !uuid.test(item.zoneId))))) throw new Error("Invalid server inspection identity");
    if (clientUuids.has(item.clientUuid) || identities.has(`${item.jobId}:${systemKey}:${item.instanceKey}`)) throw new Error("Ambiguous server inspection summaries");
    clientUuids.add(item.clientUuid); identities.add(`${item.jobId}:${systemKey}:${item.instanceKey}`);
    return item as ServerMasterSystemInspectionSummary;
  });
  return { inspections, hasMore: payload.hasMore, nextCursor: payload.nextCursor };
}

export async function loadServerMasterSystemInspections(jobIds: string[] = []) {
  const query = new URLSearchParams(); if (jobIds.length) query.set("jobIds", jobIds.join(","));
  return loadAllPages(query, "load server inspections");
}

async function loadAllPages(query: URLSearchParams, action: string) {
  const all: ServerMasterSystemInspectionSummary[] = []; const seenCursors = new Set<string>(); const identities = new Set<string>(); let cursor: string | undefined;
  do {
    const pageQuery = new URLSearchParams(query); if (cursor) pageQuery.set("cursor", cursor);
    const response = await fetch(`/api/master-system-inspections?${pageQuery}`, { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401 || response.status === 403) throw new Error(`Sign in required to ${action}`);
    if (!response.ok) throw new Error(`Server inspection listing failed: ${response.status}`);
    const page = parseServerMasterSystemInspectionPage(await response.json());
    const pageIds = new Set(all.map((item) => item.clientUuid));
    if (page.inspections.some((item) => pageIds.has(item.clientUuid) || identities.has(`${item.jobId}:${item.systemKey}:${item.instanceKey}`))) throw new Error("Duplicate server inspection summary across pages");
    page.inspections.forEach((item) => identities.add(`${item.jobId}:${item.systemKey}:${item.instanceKey}`));
    all.push(...page.inspections); cursor = page.nextCursor ?? undefined;
    if (cursor && (seenCursors.has(cursor) || seenCursors.size > 10000)) throw new Error("Incomplete server inspection pagination");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return all;
}

export async function findServerMasterSystemInspection(
  jobId: string,
  systemKey: string
) {
  const query = new URLSearchParams({ jobId, systemKey });
  const inspections = await loadAllPages(query, "check server inspections");
  return inspections[0];
}
