import { localDatabase, type SyncOutboxItem } from "../db/localDatabase";

export const remarkSystems = ["automatic_sprinkler", "hose_reel", "hydrant", "fire_alarm_detector", "fm200_fire_suppression", "co2_fire_extinguisher"] as const;
export type RemarkSystem = typeof remarkSystems[number];
export type CommonRemark = { id: string; systemKey: RemarkSystem; wording: string; detailLabel: string | null; detailOptions: string[]; active: boolean };
const key = "service-common-remarks:global";
const changed = "service-common-remarks-changed";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function valid(value: unknown): value is CommonRemark {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).every((name) => ["id","systemKey","wording","detailLabel","detailOptions","active"].includes(name))
    && typeof item.id === "string" && uuid.test(item.id)
    && remarkSystems.includes(item.systemKey as RemarkSystem)
    && typeof item.wording === "string" && !!item.wording.trim() && item.wording.length <= 300
    && (item.detailLabel === null || typeof item.detailLabel === "string" && !!item.detailLabel.trim() && item.detailLabel.length <= 80)
    && Array.isArray(item.detailOptions) && item.detailOptions.length <= 20 && item.detailOptions.every((option) => typeof option === "string" && !!option.trim() && option.length <= 100)
    && typeof item.active === "boolean";
}
function parse(value: unknown): CommonRemark[] {
  if (!Array.isArray(value) || value.length > 500 || !value.every(valid) || new Set(value.map((item) => item.id)).size !== value.length) throw new Error("Common remarks response is malformed");
  return value;
}
export async function cachedCommonRemarks(): Promise<CommonRemark[]> {
  const stored = await localDatabase.referenceData.get(key);
  return stored ? parse(stored.payload) : [];
}
async function save(remarks: CommonRemark[]) {
  const at = new Date().toISOString();
  await localDatabase.referenceData.put({ key, payload: remarks, version: at, fetchedAt: at, expiresAt: at });
  window.dispatchEvent(new Event(changed));
}
export async function refreshCommonRemarks(): Promise<CommonRemark[]> {
  const response = await fetch("/api/service-common-remarks", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Common remarks could not be refreshed");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Object.hasOwn(body, "remarks")) throw new Error("Common remarks response is malformed");
  const remote = parse((body as { remarks: unknown }).remarks);
  const pending = (await localDatabase.syncOutbox.where("entityType").equals("commonRemark").toArray())
    .filter((item) => item.status !== "Completed").map((item) => item.payload).filter(valid);
  const remarks = [...remote, ...pending.filter((item) => !remote.some((other) => other.id === item.id))];
  await save(remarks);
  return remarks;
}
export function onCommonRemarksChanged(listener: () => void) { window.addEventListener(changed, listener); return () => window.removeEventListener(changed, listener); }
export async function addCommonRemark(systemKey: RemarkSystem, wording: string, detailLabel: string | null = null, detailOptions: string[] = []) {
  const remark: CommonRemark = { id: crypto.randomUUID(), systemKey, wording: wording.trim(), detailLabel, detailOptions, active: true };
  if (!valid(remark)) throw new Error("Enter a valid common remark");
  const at = new Date().toISOString();
  const operation: SyncOutboxItem = { operationId: crypto.randomUUID(), entityType: "commonRemark", entityId: remark.id, action: "create", payload: remark, createdAt: at, attempts: 0, status: "Pending" };
  await localDatabase.transaction("rw", localDatabase.referenceData, localDatabase.syncOutbox, async () => {
    const existing = await cachedCommonRemarks();
    if (existing.some((item) => item.systemKey === systemKey && item.wording.toLocaleLowerCase() === remark.wording.toLocaleLowerCase())) throw new Error("This common remark already exists for this service");
    await localDatabase.referenceData.put({ key, payload: [...existing, remark], version: at, fetchedAt: at, expiresAt: at });
    await localDatabase.syncOutbox.put(operation);
  });
  window.dispatchEvent(new Event(changed));
  return remark;
}
export async function updateCommonRemark(id: string, input: Pick<CommonRemark,"wording"|"detailLabel"|"detailOptions">) {
  const response = await fetch(`/api/service-common-remarks/${id}`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json() as { remark?: unknown; message?: string };
  if (!response.ok || !valid(body.remark)) throw new Error(body.message ?? "Common remark could not be updated");
  await refreshCommonRemarks();
}
export async function removeCommonRemark(id: string) {
  const response = await fetch(`/api/service-common-remarks/${id}`, { method: "DELETE", credentials: "same-origin" });
  const body = await response.json() as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Common remark could not be removed");
  await refreshCommonRemarks();
}
