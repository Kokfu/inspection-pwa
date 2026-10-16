import type { RepairFinding, RepairHistory, RepairRecord } from "./repairTypes";

/** State of the newest repair cycle for a failed part, using server history plus this actor's local records. */
export type LatestCycleState = "none" | "unsubmitted" | "awaiting_approval" | "approved" | "rejected" | "withdrawn";

export function latestCycleState(f: Pick<RepairFinding, "history">, records: RepairRecord[]): LatestCycleState {
  const known = new Map<string, { cycle: number; state: LatestCycleState; unsynced: boolean }>();
  for (const h of f.history) known.set(h.client_uuid, { cycle: h.cycle_sequence, state: h.review_state, unsynced: false });
  for (const r of records) {
    if (known.has(r.clientUuid)) continue;
    // A local record the server history does not list yet: Synced means the server accepted it, so it awaits review.
    known.set(r.clientUuid, { cycle: r.cycleSequence, state: r.syncStatus === "Synced" && r.reviewState === "unsubmitted" ? "awaiting_approval" : r.reviewState === "unsubmitted" ? "unsubmitted" : r.reviewState,
      unsynced: r.syncStatus !== "Synced" });
  }
  let best: { cycle: number; state: LatestCycleState; unsynced: boolean } | undefined;
  // On an equal cycle, this actor's unsynced local work wins over a server entry so it is never hidden.
  for (const v of known.values()) if (!best || v.cycle > best.cycle || (v.cycle === best.cycle && v.unsynced && !best.unsynced)) best = v;
  return best?.state ?? "none";
}

/** Open = the latest cycle is neither approved nor awaiting approval. A rejected part is Open again. */
export const isOpenState = (state: LatestCycleState) => state !== "approved" && state !== "awaiting_approval";
export const isPartOpen = (f: Pick<RepairFinding, "history">, records: RepairRecord[]) => isOpenState(latestCycleState(f, records));

/** Local-only "Not Done" marker. No server write; it never closes the part. */
export type NotDoneMarker = { actorId: number; findingId: string; status: "not_done"; reason: string; markedAt: string };
export const NOT_DONE_PREFIX = "repair-ui:status:";
export const notDoneKey = (findingId: string) => `${NOT_DONE_PREFIX}${findingId}`;
export function parseNotDone(value: unknown, actorId: number, findingId: string): NotDoneMarker | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "actorId,findingId,markedAt,reason,status" || v.status !== "not_done" || v.actorId !== actorId || v.findingId !== findingId
    || typeof v.reason !== "string" || v.reason.length > 500 || typeof v.markedAt !== "string" || !Number.isFinite(Date.parse(v.markedAt))) return undefined;
  return v as unknown as NotDoneMarker;
}

export type CompareBadge = "Approved" | "Awaiting approval" | "Local draft (not synced)" | "Not repaired";
export function compareBadge(f: Pick<RepairFinding, "history">, records: RepairRecord[]): CompareBadge {
  const newest = records.slice().sort((a, b) => b.cycleSequence - a.cycleSequence)[0];
  const state = latestCycleState(f, records);
  if (newest && newest.syncStatus !== "Synced" && newest.cycleSequence >= (f.history.at(-1)?.cycle_sequence ?? 0)) return "Local draft (not synced)";
  if (state === "approved") return "Approved";
  if (state === "awaiting_approval") return "Awaiting approval";
  return "Not repaired";
}

export type CompareAfterSource =
  | { kind: "local"; record: RepairRecord }
  | { kind: "server"; history: RepairHistory }
  | { kind: "none" };
/** Which source supplies the After photo, remark and cycle together: the newest local record unless server history is strictly newer. */
export function compareAfterSource(f: Pick<RepairFinding, "history">, records: RepairRecord[]): CompareAfterSource {
  const newest = records.slice().sort((a, b) => b.cycleSequence - a.cycleSequence)[0];
  const last = f.history.at(-1);
  if (newest && (!last || newest.cycleSequence >= last.cycle_sequence)) return { kind: "local", record: newest };
  return last ? { kind: "server", history: last } : { kind: "none" };
}
