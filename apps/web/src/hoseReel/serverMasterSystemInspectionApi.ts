export type ServerMasterSystemInspectionSummary = {
  clientUuid: string;
  jobId: string;
  systemKey: "hose_reel" | "co2_fire_extinguisher" | "automatic_sprinkler" | "dry_wet_riser" | "fire_alarm_detector" | "hydrant";
  instanceKey: string;
  zoneId: string | null;
  locationId: string | null;
  displaySequence: number;
  status: "submitted";
  performedAt: string;
  deviceReportedCreatorUsername: string | null;
  verifiedOriginalCreatorUsername: string | null;
  syncedByUsername: string;
} & ({
  systemKey: "automatic_sprinkler";
  evidenceState: "not-required" | "complete" | "pending" | "failed" | "invalid";
  requiredEvidenceCount: number;
  confirmedEvidenceCount: number;
} | {
  systemKey: "hose_reel" | "co2_fire_extinguisher" | "dry_wet_riser" | "fire_alarm_detector" | "hydrant";
});

export type SummaryPage = { inspections: ServerMasterSystemInspectionSummary[]; hasMore: boolean; nextCursor: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const systemKeys = new Set<ServerMasterSystemInspectionSummary["systemKey"]>(["hose_reel", "co2_fire_extinguisher", "automatic_sprinkler", "dry_wet_riser", "fire_alarm_detector", "hydrant"]);
const keys = ["clientUuid", "jobId", "systemKey", "instanceKey", "zoneId", "locationId", "displaySequence", "status", "performedAt", "deviceReportedCreatorUsername", "verifiedOriginalCreatorUsername", "syncedByUsername"];
const sprinklerKeys = [...keys, "evidenceState", "requiredEvidenceCount", "confirmedEvidenceCount"];
const evidenceStates = new Set(["not-required", "complete", "pending", "failed", "invalid"]);

function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function exact(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every((key) => key in value); }
function boundedString(value: unknown, maximum = 128): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function nullableBoundedString(value: unknown, maximum = 128) { return value === null || boundedString(value, maximum); }
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value)) return false;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}
function decodeCursor(value: string): { performedAt: string; clientUuid: string } | undefined {
  try {
    if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/")); if (json.length > 192) return undefined;
    const item = record(JSON.parse(json));
    return item && exact(item, ["performedAt", "clientUuid"]) && timestamp(item.performedAt) && typeof item.clientUuid === "string" && uuid.test(item.clientUuid) ? { performedAt: item.performedAt, clientUuid: item.clientUuid } : undefined;
  } catch { return undefined; }
}
function identity(item: ServerMasterSystemInspectionSummary) { return `${item.jobId}:${item.systemKey}:${item.instanceKey}`; }
export function compareServerMasterSystemInspectionOrder(left: ServerMasterSystemInspectionSummary, right: ServerMasterSystemInspectionSummary) { return left.performedAt === right.performedAt ? left.clientUuid.localeCompare(right.clientUuid) : right.performedAt.localeCompare(left.performedAt); }

export function parseServerMasterSystemInspectionPage(value: unknown): SummaryPage {
  const payload = record(value);
  if (!payload || !exact(payload, ["inspections", "hasMore", "nextCursor"]) || !Array.isArray(payload.inspections) || typeof payload.hasMore !== "boolean" || !(payload.nextCursor === null || typeof payload.nextCursor === "string" && !!decodeCursor(payload.nextCursor)) || (payload.hasMore !== (payload.nextCursor !== null))) throw new Error("Invalid server inspection summary page");
  const clientUuids = new Set<string>(); const identities = new Set<string>();
  const inspections = payload.inspections.map((entry) => {
    const item = record(entry);
    if (!item || typeof item.systemKey !== "string" || !exact(item, item.systemKey === "automatic_sprinkler" ? sprinklerKeys : keys) || typeof item.clientUuid !== "string" || !uuid.test(item.clientUuid) || typeof item.jobId !== "string" || !uuid.test(item.jobId) || !systemKeys.has(item.systemKey as ServerMasterSystemInspectionSummary["systemKey"]) || !boundedString(item.instanceKey) || !nullableBoundedString(item.zoneId) || !nullableBoundedString(item.locationId) || !Number.isSafeInteger(item.displaySequence) || (item.displaySequence as number) < 1 || (item.displaySequence as number) > 100000 || item.status !== "submitted" || !timestamp(item.performedAt) || !nullableBoundedString(item.deviceReportedCreatorUsername) || !nullableBoundedString(item.verifiedOriginalCreatorUsername) || !boundedString(item.syncedByUsername)) throw new Error("Invalid server inspection summary");
    const systemKey = item.systemKey as ServerMasterSystemInspectionSummary["systemKey"];
    if (systemKey === "automatic_sprinkler") {
      if (!evidenceStates.has(item.evidenceState as string)
        || !Number.isSafeInteger(item.requiredEvidenceCount) || (item.requiredEvidenceCount as number) < 0
        || !Number.isSafeInteger(item.confirmedEvidenceCount) || (item.confirmedEvidenceCount as number) < 0
        || (item.confirmedEvidenceCount as number) > (item.requiredEvidenceCount as number)
        || (item.evidenceState === "not-required" && ((item.requiredEvidenceCount as number) !== 0 || (item.confirmedEvidenceCount as number) !== 0))
        || (item.evidenceState === "complete" && (item.confirmedEvidenceCount as number) !== (item.requiredEvidenceCount as number))) throw new Error("Invalid Automatic Sprinkler evidence summary");
    }
    const single = systemKey !== "co2_fire_extinguisher";
    if ((single && (item.instanceKey !== "primary" || item.zoneId !== null || item.locationId !== null || item.displaySequence !== 1)) || (!single && (!/^location:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.instanceKey) || !uuid.test(item.locationId as string) || (item.zoneId !== null && !uuid.test(item.zoneId))))) throw new Error("Invalid server inspection identity");
    if (clientUuids.has(item.clientUuid) || identities.has(`${item.jobId}:${systemKey}:${item.instanceKey}`)) throw new Error("Ambiguous server inspection summaries");
    clientUuids.add(item.clientUuid); identities.add(`${item.jobId}:${systemKey}:${item.instanceKey}`);
    return item as ServerMasterSystemInspectionSummary;
  });
  for (let index = 1; index < inspections.length; index += 1) if (compareServerMasterSystemInspectionOrder(inspections[index - 1], inspections[index]) >= 0) throw new Error("Unordered server inspection summary page");
  const final = inspections.at(-1);
  if (payload.hasMore) {
    const cursor = payload.nextCursor ? decodeCursor(payload.nextCursor) : undefined;
    if (!final || !cursor || cursor.performedAt !== final.performedAt || cursor.clientUuid !== final.clientUuid) throw new Error("Invalid server inspection summary cursor continuity");
  }
  return { inspections, hasMore: payload.hasMore, nextCursor: payload.nextCursor };
}

export async function loadServerMasterSystemInspections(jobIds: string[] = []) {
  const query = new URLSearchParams(); if (jobIds.length) query.set("jobIds", jobIds.join(","));
  return loadAllPages(query, "load server inspections");
}

export async function loadAllPages(query: URLSearchParams, action: string, request: typeof fetch = fetch) {
  const all: ServerMasterSystemInspectionSummary[] = []; const seenClientUuids = new Set<string>(); const seenCursors = new Set<string>(); const identities = new Set<string>(); let cursor: string | undefined; let previousFinal: ServerMasterSystemInspectionSummary | undefined;
  do {
    const pageQuery = new URLSearchParams(query); if (cursor) pageQuery.set("cursor", cursor);
    const response = await request(`/api/master-system-inspections?${pageQuery}`, { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401 || response.status === 403) throw new Error(`Sign in required to ${action}`);
    if (!response.ok) throw new Error(`Server inspection listing failed: ${response.status}`);
    const page = parseServerMasterSystemInspectionPage(await response.json());
    if (previousFinal && page.inspections[0] && compareServerMasterSystemInspectionOrder(previousFinal, page.inspections[0]) >= 0) throw new Error("Unordered server inspection summaries across pages");
    if (page.inspections.some((item) => seenClientUuids.has(item.clientUuid) || identities.has(identity(item)))) throw new Error("Duplicate server inspection summary across pages");
    page.inspections.forEach((item) => { seenClientUuids.add(item.clientUuid); identities.add(identity(item)); });
    all.push(...page.inspections); previousFinal = page.inspections.at(-1) ?? previousFinal; cursor = page.nextCursor ?? undefined;
    if (cursor && (seenCursors.has(cursor) || seenCursors.size > 10000)) throw new Error("Incomplete server inspection pagination");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return all;
}

export async function findServerMasterSystemInspection(jobId: string, systemKey: string) {
  const query = new URLSearchParams({ jobId, systemKey });
  const inspections = await loadAllPages(query, "check server inspections");
  return inspections[0];
}
