import Dexie from "dexie";
import { repairStorageTransaction } from "./repairStorageTransaction";
import { repairVerification } from "./repairVerification";
import { currentWorkspaceUserId, deviceDatabase, localDatabase } from "../db/localDatabase";
import { processInspectionPhoto, requestPersistentAttachmentStorage } from "../attachments/imageProcessing";
import { canonical, fingerprint, hash, object, parseRepairService, requireRepair, sha256, timestamp, uuid } from "./repairContract";
import type { RepairAttachment, RepairFinding, RepairIdentity, RepairPart, RepairPhotoInput, RepairRecord } from "./repairTypes";

/** Pin the database object as well as the account. A late response cannot write into a new workspace. */
export async function repairContext() {
  const db = localDatabase, actorId = currentWorkspaceUserId();
  const auth = await readRepairAuth();
  requireRepair(actorId && auth?.userId === actorId && auth.role === "inspector" && !auth.explicitLogout && !auth.serverLogoutPending, "REPAIR_IDENTITY_CHANGED");
  const token = canonical(auth);
  return { db, actorId, async assert() {
    // The owning repair transaction has a native abort deadline. Keep the auth
    // read implicit here: never spin a device transaction while awaiting auth,
    // since that would itself block logout/token writes. An eventual readonly
    // result cannot mutate anything after its owning workspace is aborted.
    const now = await Dexie.waitFor(Dexie.currentTransaction?.db === db
      ? deviceDatabase.authState.get("device-auth") : readRepairAuth());
    requireRepair(db === localDatabase && currentWorkspaceUserId() === actorId && now && canonical(now) === token, "REPAIR_IDENTITY_CHANGED");
  } };
}
function readRepairAuth() {
  return repairStorageTransaction(deviceDatabase, "r", [deviceDatabase.authState],
    () => deviceDatabase.authState.get("device-auth"));
}
export type RepairContext = Awaited<ReturnType<typeof repairContext>>;
export async function repairRequest(ctx: RepairContext, path: string, init: RequestInit = {}) {
  await ctx.assert();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`/api/repairs/${path}`, { ...init, credentials: "same-origin", cache: "no-store",
      headers: { ...init.headers, "X-Expected-User-Id": String(ctx.actorId) }, signal: controller.signal });
    await ctx.assert();
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(object(body) && typeof body.error === "string" ? body.error : `REPAIR_HTTP_${response.status}`);
    }
    return response;
  } finally { clearTimeout(timer); }
}

export async function listAuthorizedRepairServices() {
  const ctx = await repairContext(), value: unknown = await (await repairRequest(ctx, "services")).json();
  await ctx.assert();
  requireRepair(object(value) && Object.keys(value).join() === "services" && Array.isArray(value.services));
  for (const s of value.services) requireRepair(object(s) && uuid(s.jobId) && typeof s.systemKey === "string" && /^[a-z0-9_]{1,80}$/.test(s.systemKey));
  return value.services as Array<{ jobId: string; systemKey: string; [key: string]: unknown }>;
}

const downloadGenerations = new Map<string, number>();
export async function downloadRepairService(jobId: string, systemKey: string, downloadPhotos = true) {
  requireRepair(uuid(jobId) && /^[a-z0-9_]{1,80}$/.test(systemKey));
  const ctx = await repairContext();
  const key = `${ctx.actorId}:${jobId}:${systemKey}`, generation = (downloadGenerations.get(key) ?? 0) + 1;
  downloadGenerations.set(key, generation);
  try {
    const value: unknown = await (await repairRequest(ctx, `services/${jobId}/${systemKey}`)).json();
    const service = parseRepairService(value, jobId, systemKey);
    requireRepair(downloadGenerations.get(key) === generation, "REPAIR_REFRESH_SUPERSEDED");
    const fetchedAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // I-69: hash every already-stored local match BEFORE the write transaction. Awaiting crypto inside a Dexie rw
    // transaction kept repairRecords locked for every other tab whenever this page was hidden or throttled mid-hash.
    const localSnapshot = await repairStorageTransaction(ctx.db, "r", [ctx.db.repairRecords],
      () => Promise.all(service.findings.flatMap(f => f.history.map(h => ctx.db.repairRecords.get(h.client_uuid)))));
    const hashed = new Map<string, { input: string; fingerprint: string }>();
    for (const local of localSnapshot) if (local?.frozen) {
      const input = { actorId: local.actorId, ...local.frozen };
      hashed.set(local.clientUuid, { input: canonical(input), fingerprint: await fingerprint(input) });
    }
    await repairStorageTransaction(ctx.db, "rw", [ctx.db.repairFindings, ctx.db.repairWorkOrders, ctx.db.repairRecords], async () => {
      await ctx.assert();
      requireRepair(downloadGenerations.get(key) === generation, "REPAIR_REFRESH_SUPERSEDED");
      // Reference replacement never overwrites drafts/frozen business rows or their Blobs.
      // An omitted/reassigned order may still be referenced by offline work. Retain its
      // last immutable service identity and mark cached access revoked instead of deleting it.
      const present = new Set(service.workOrders.map(w => w.workOrderId));
      for (const old of await ctx.db.repairWorkOrders.where("[jobId+systemKey]").equals([jobId, systemKey]).toArray())
        if (!present.has(old.workOrderId)) await ctx.db.repairWorkOrders.update(old.workOrderId, { status: "revoked", fetchedAt, expiresAt });
      for (const w of service.workOrders) await ctx.db.repairWorkOrders.put({ ...w, fetchedAt, expiresAt });
      for (const f of service.findings) {
        await ctx.db.repairFindings.put({ ...f, fetchedAt, expiresAt });
        for (const h of f.history) {
          const local = await ctx.db.repairRecords.get(h.client_uuid);
          if (local) {
            // A local row that appeared after the pre-transaction snapshot was never hashed: retry the refresh.
            requireRepair(hashed.has(local.clientUuid) || !local.frozen, "REPAIR_REFRESH_SUPERSEDED");
            const frozen = local.frozen, verified = hashed.get(local.clientUuid);
            requireRepair(frozen && local.findingId === f.findingId && local.jobId === service.jobId && local.systemKey === service.systemKey
              && local.actorId === ctx.actorId && local.actorId === Number(h.submitted_by_user_id)
              && local.clientUuid === h.client_uuid && local.cycleSequence === h.cycle_sequence && local.predecessorUuid === h.predecessor_uuid
              && local.remark === h.remark && local.performedAt === h.performed_at
              && frozen.clientUuid === local.clientUuid && frozen.findingId === local.findingId && frozen.workOrderId === local.workOrderId
              && frozen.jobId === local.jobId && frozen.systemKey === local.systemKey && frozen.cycleSequence === local.cycleSequence
              && frozen.predecessorUuid === local.predecessorUuid && frozen.remark === local.remark && frozen.performedAt === local.performedAt
              && frozen.sourceFingerprint === f.sourceFingerprint && frozen.manifest.length === 1
              && frozen.manifest[0].photoUuid === local.photoUuid && frozen.manifest[0].fieldPath === f.original.fieldPath
              && verified?.input === canonical({ actorId: local.actorId, ...frozen }) && verified.fingerprint === local.requestFingerprint,
              "REPAIR_HISTORY_MISMATCH");
          }
          // Sync state is confirmed exclusively by exact write receipts, never by review history.
          if (local?.syncStatus === "Synced") await ctx.db.repairRecords.update(local.clientUuid, { reviewState: h.review_state, reviewFetchedAt: fetchedAt });
        }
      }
    });
    if (downloadPhotos) for (const f of service.findings) if (f.original.beforePhoto) await cacheRepairBeforePhoto(f.findingId);
    await ctx.assert();
    requireRepair(downloadGenerations.get(key) === generation, "REPAIR_REFRESH_SUPERSEDED");
    return service;
  } catch (e) {
    await ctx.assert();
    if (downloadGenerations.get(key) !== generation) throw e;
    await ctx.db.repairFindings.where("[original.jobId+original.systemKey]").equals([jobId, systemKey]).modify({ refreshError: errorMessage(e) });
    throw e; // Caller must show refresh failure; retained cache is explicitly informational.
  }
}
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : "REPAIR_SYNC_FAILED";
export async function verifyRepairBlob(blob: Blob, meta: { sizeBytes: number; width: number; height: number }, expectedHash: string, check: () => void = () => undefined) {
  check();
  requireRepair(blob instanceof Blob && blob.type === "image/jpeg" && blob.size === meta.sizeBytes && blob.size > 0 && blob.size <= 2 * 1024 * 1024
    && hash(expectedHash), "REPAIR_PHOTO_INTEGRITY");
  const bytes = await blob.arrayBuffer(); check();
  const actualHash = await sha256(bytes); check();
  requireRepair(actualHash === expectedHash, "REPAIR_PHOTO_INTEGRITY");
  const bitmap = await createImageBitmap(blob);
  try { check(); requireRepair(bitmap.width === meta.width && bitmap.height === meta.height, "REPAIR_PHOTO_INTEGRITY"); } finally { bitmap.close(); }
}
export async function cacheRepairBeforePhoto(findingId: string) {
  const ctx = await repairContext(), f = await ctx.db.repairFindings.get(findingId);
  requireRepair(f, "REPAIR_FINDING_NOT_CACHED");
  if (!f.original.beforePhoto) { requireRepair(f.original.beforePhotoMissing); return; }
  const p = f.original.beforePhoto;
  const blob = await (await repairRequest(ctx, `findings/${findingId}/before/content`)).blob();
  await verifyRepairBlob(blob, p, p.storedSha256);
  await repairStorageTransaction(ctx.db, "rw", [ctx.db.repairFindings, ctx.db.repairBeforePhotos], async () => {
    await ctx.assert();
    const current = await ctx.db.repairFindings.get(findingId);
    requireRepair(current?.sourceFingerprint === f.sourceFingerprint && canonical(current.original.beforePhoto) === canonical(p), "REPAIR_SOURCE_CHANGED");
    await ctx.db.repairBeforePhotos.put({ ...p, findingId, sourceFingerprint: f.sourceFingerprint, blob, fetchedAt: new Date().toISOString() });
  });
}
export async function repairBeforePhotoState(findingId: string) {
  const ctx = await repairContext(), f = await ctx.db.repairFindings.get(findingId);
  requireRepair(f, "REPAIR_FINDING_NOT_CACHED");
  if (f.original.beforePhotoMissing) { requireRepair(f.original.beforePhoto === null, "REPAIR_PHOTO_INTEGRITY"); return { state: "historical_absence" as const }; }
  const expected = f.original.beforePhoto;
  requireRepair(expected, "REPAIR_PHOTO_INTEGRITY");
  const cached = await ctx.db.repairBeforePhotos.get(findingId);
  if (!cached || cached.sourceFingerprint !== f.sourceFingerprint) return { state: "not_downloaded" as const };
  const { blob, findingId: cachedFindingId, sourceFingerprint: _source, fetchedAt, ...metadata } = cached;
  requireRepair(cachedFindingId === findingId && timestamp(fetchedAt)
    && Object.keys(metadata).sort().join() === "fieldPath,height,photoUuid,sizeBytes,sourceSha256,storedSha256,width"
    && canonical(metadata) === canonical(expected), "REPAIR_PHOTO_INTEGRITY");
  await verifyRepairBlob(blob, expected, expected.storedSha256);
  await ctx.assert();
  return { state: "cached" as const, photo: cached };
}
function lineage(f: RepairFinding) {
  const last = f.history.at(-1);
  requireRepair(!last || last.review_state !== "awaiting_approval", "REPAIR_CYCLE_OCCUPIED");
  return { cycleSequence: (last?.cycle_sequence ?? 0) + 1, predecessorUuid: last?.client_uuid ?? null };
}
export async function createRepairDraft(findingId: string, workOrderId: string) {
  const ctx = await repairContext(), at = new Date().toISOString();
  return repairStorageTransaction(ctx.db, "rw", [ctx.db.repairFindings, ctx.db.repairWorkOrders, ctx.db.repairRecords], async () => {
    await ctx.assert();
    const f = await ctx.db.repairFindings.get(findingId), w = await ctx.db.repairWorkOrders.get(workOrderId);
    requireRepair(f && w && f.original.jobId === w.jobId && f.original.systemKey === w.systemKey && w.assignedToUserId === ctx.actorId, "REPAIR_FINDING_NOT_CACHED");
    const existing = await ctx.db.repairRecords.where("findingId").equals(findingId).toArray();
    requireRepair(!existing.some(r => r.syncStatus !== "Synced"), "REPAIR_LOCAL_CYCLE_OCCUPIED");
    const draft: RepairRecord = { clientUuid: crypto.randomUUID(), findingId, workOrderId, actorId: ctx.actorId,
      jobId: w.jobId, systemKey: w.systemKey, ...lineage(f), remark: "", performedAt: at,
      localCreatedAt: at, localUpdatedAt: at, syncStatus: "Draft", reviewState: "unsubmitted" };
    await ctx.db.repairRecords.add(draft); return draft;
  });
}
export async function saveRepairDraft(clientUuid: string, remark: string, performedAt: string,
  workspace?: { db: typeof localDatabase; actorId: number }) {
  requireRepair(typeof remark === "string" && remark.length <= 4000 && timestamp(performedAt));
  // Queued UI work belongs to its originating editor, even if execution starts after a switch.
  requireRepair(!workspace || workspace.db === localDatabase && workspace.actorId === currentWorkspaceUserId(), "REPAIR_IDENTITY_CHANGED");
  const ctx = await repairContext();
  requireRepair(!workspace || workspace.db === ctx.db && workspace.actorId === ctx.actorId, "REPAIR_IDENTITY_CHANGED");
  await repairStorageTransaction(ctx.db, "rw", [ctx.db.repairRecords], async () => {
    await ctx.assert(); const r = await ctx.db.repairRecords.get(clientUuid);
    requireRepair(r?.syncStatus === "Draft" && r.actorId === ctx.actorId && !r.frozen, "REPAIR_IMMUTABLE");
    await ctx.db.repairRecords.update(clientUuid, { remark, performedAt, localUpdatedAt: new Date().toISOString() });
  });
  await ctx.assert(); // Do not publish delayed save success into a changed session.
}
export async function captureRepairPhoto(clientUuid: string, source: Blob, captureSource: RepairPhotoInput["captureSource"], signal?: AbortSignal) {
  requireRepair(["camera", "gallery", "unknown"].includes(captureSource));
  const ctx = await repairContext(), capturedAt = new Date().toISOString();
  const processed = await processInspectionPhoto(source, signal, () => new Date(capturedAt));
  await repairStorageTransaction(ctx.db, "rw", [ctx.db.repairRecords, ctx.db.repairAttachments], async () => {
    await ctx.assert(); const r = await ctx.db.repairRecords.get(clientUuid);
    requireRepair(r?.syncStatus === "Draft" && r.actorId === ctx.actorId && !r.frozen, "REPAIR_IMMUTABLE");
    if (r.photoUuid) await ctx.db.repairAttachments.delete(r.photoUuid); // Only the unsubmitted draft slot can be replaced.
    const photo: RepairAttachment = { photoUuid: crypto.randomUUID(), repairUuid: clientUuid, blob: processed.blob,
      capturedAt, captureSource, sourceSha256: processed.sha256, sizeBytes: processed.sizeBytes, width: processed.width, height: processed.height, syncStatus: "Draft" };
    await ctx.db.repairAttachments.add(photo);
    await ctx.db.repairRecords.update(clientUuid, { photoUuid: photo.photoUuid, localUpdatedAt: capturedAt });
  });
  void requestPersistentAttachmentStorage();
}
export async function submitRepairLocal(clientUuid: string, workspace?: { db: typeof localDatabase; actorId: number }, signal?: AbortSignal) {
  const checkActive = () => requireRepair(!signal?.aborted, "REPAIR_OPERATION_CANCELLED");
  checkActive();
  requireRepair(!workspace || workspace.db === localDatabase && workspace.actorId === currentWorkspaceUserId(), "REPAIR_IDENTITY_CHANGED");
  const ctx = await repairContext(), r = await repairStorageTransaction(ctx.db, "r", [ctx.db.repairRecords], () => ctx.db.repairRecords.get(clientUuid));
  requireRepair(!workspace || workspace.db === ctx.db && workspace.actorId === ctx.actorId, "REPAIR_IDENTITY_CHANGED");
  requireRepair(r?.syncStatus === "Draft" && r.actorId === ctx.actorId && r.photoUuid, "REPAIR_IMMUTABLE");
  const photoUuid = r.photoUuid;
  const [f, w, a] = await repairStorageTransaction(ctx.db, "r", [ctx.db.repairFindings, ctx.db.repairWorkOrders, ctx.db.repairAttachments],
    () => Promise.all([ctx.db.repairFindings.get(r.findingId), ctx.db.repairWorkOrders.get(r.workOrderId), ctx.db.repairAttachments.get(photoUuid)]));
  requireRepair(f && w && a && a.repairUuid === r.clientUuid && r.remark.trim() && r.remark.length <= 4000 && timestamp(r.performedAt));
  const next = lineage(f);
  requireRepair(next.cycleSequence === r.cycleSequence && next.predecessorUuid === r.predecessorUuid, "REPAIR_LINEAGE_CHANGED");
  // Cached revocation/expiry/eligibility does not disable offline local Submit. The server will recheck authority.
  const id: RepairIdentity = { findingId: r.findingId, workOrderId: r.workOrderId, jobId: r.jobId, systemKey: r.systemKey,
    expectedWorkOrderRevision: w.revision, expectedSourceRevision: f.sourceRevision, sourceFingerprint: f.sourceFingerprint };
  requireRepair(w.jobId === r.jobId && w.systemKey === r.systemKey && f.original.jobId === r.jobId && f.original.systemKey === r.systemKey);
  const photo: RepairPhotoInput = { ...id, photoUuid: a.photoUuid, repairUuid: r.clientUuid, captureSource: a.captureSource,
    capturedAt: a.capturedAt, sourceSha256: a.sourceSha256, sizeBytes: a.sizeBytes, width: a.width, height: a.height };
  const part: RepairPart = { ...id, clientUuid, cycleSequence: r.cycleSequence, predecessorUuid: r.predecessorUuid,
    remark: r.remark, performedAt: r.performedAt, manifest: [{ photoUuid: a.photoUuid, fieldPath: f.original.fieldPath, sourceSha256: a.sourceSha256 }] };
  const [photoFingerprint, partFingerprint] = await repairVerification(async check => {
    await verifyRepairBlob(a.blob, a, a.sourceSha256, check);
    check();
    const result = await Promise.all([fingerprint({ actorId: ctx.actorId, ...photo }), fingerprint({ actorId: ctx.actorId, ...part })]);
    check(); return result;
  }, signal);
  checkActive();
  await repairStorageTransaction(ctx.db, "rw", [ctx.db.repairRecords, ctx.db.repairAttachments, ctx.db.repairFindings, ctx.db.repairWorkOrders, ctx.db.syncOutbox], async () => {
    await ctx.assert();
    checkActive();
    const current = await ctx.db.repairRecords.get(clientUuid), attachment = await ctx.db.repairAttachments.get(a.photoUuid);
    requireRepair(current && canonical(current) === canonical(r) && attachment?.sourceSha256 === a.sourceSha256 && attachment.syncStatus === "Draft", "REPAIR_DRAFT_CHANGED");
    requireRepair(canonical(await ctx.db.repairFindings.get(f.findingId)) === canonical(f) && canonical(await ctx.db.repairWorkOrders.get(w.workOrderId)) === canonical(w), "REPAIR_AUTHORITY_CHANGED");
    const at = new Date().toISOString();
    await ctx.db.repairRecords.update(clientUuid, { frozen: part, requestFingerprint: partFingerprint, syncStatus: "Pending", localUpdatedAt: at });
    await ctx.db.repairAttachments.update(a.photoUuid, { frozen: photo, requestFingerprint: photoFingerprint, syncStatus: "Pending" });
    for (const op of [{ entityType: "repairEvidence" as const, entityId: a.photoUuid, payload: photo }, { entityType: "repairRecord" as const, entityId: clientUuid, payload: part }]) {
      await ctx.db.syncOutbox.add({ operationId: crypto.randomUUID(), ...op, action: "create", createdAt: at, attempts: 0, status: "Pending", activeKey: `${op.entityType}:create:${op.entityId}` });
    }
  }, signal);
  return repairStorageTransaction(ctx.db, "r", [ctx.db.repairRecords], () => ctx.db.repairRecords.get(clientUuid));
}

