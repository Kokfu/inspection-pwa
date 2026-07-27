import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rmdir,
  stat,
  unlink,
  utimes,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  attachmentPaths,
  reconcileAttachmentStorage
} from "../attachments/attachmentStorage.js";
import { hashSessionToken } from "../auth/sessionTokens.js";
import { pool } from "../db/pool.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { resolveAttachmentCommitOutcome } from "../routes/inspectionAttachments.js";
import { syncAutomaticSprinklerInspections } from "../sync/automaticSprinklerInspectionSync.js";

const baseUrl = process.env.VALIDATION_API_URL ?? "http://127.0.0.1:3000";
const cookieName = process.env.SESSION_COOKIE_NAME ?? "inspection_session";
const fields = [
  "measurements.jockey_pump_pressure.cut_in",
  "measurements.jockey_pump_pressure.cut_out",
  "measurements.duty_pump_cut_in.value"
] as const;

async function request(
  token: string,
  photoUuid: string,
  inspectionClientUuid: string,
  fieldPath: string,
  image: Buffer,
  capturedAt: string,
  options?: {
    mutate?: (form: FormData) => void;
    filename?: string;
  }
) {
  const metadata = await sharp(image).metadata().catch(() => ({
    width: 1,
    height: 1
  }));
  const form = new FormData();
  form.set("photoUuid", photoUuid);
  form.set("inspectionClientUuid", inspectionClientUuid);
  form.set("fieldPath", fieldPath);
  form.set("captureSource", "gallery");
  form.set("capturedAt", capturedAt);
  form.set("sha256", createHash("sha256").update(image).digest("hex"));
  form.set("sizeBytes", String(image.length));
  form.set("width", String(metadata.width));
  form.set("height", String(metadata.height));
  options?.mutate?.(form);
  form.set(
    "file",
    new Blob([Uint8Array.from(image)], { type: "image/jpeg" }),
    options?.filename ?? "ignored-name.svg"
  );
  const response = await fetch(`${baseUrl}/inspection-attachments`, {
    method: "POST",
    headers: { Cookie: `${cookieName}=${token}` },
    body: form
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({}))
  };
}

async function validateAcceptedPolicyImmutability(inspectionClientUuid: string) {
  const client = await pool.connect();
  const cloneId = randomUUID();
  const cloneClientUuid = randomUUID();
  const rejected: string[] = [];
  async function expectRejected(name: string, sql: string, values: unknown[] = []) {
    await client.query(`SAVEPOINT ${name}`);
    try {
      await client.query(sql, values);
    } catch {
      rejected.push(name);
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    }
  }

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO master_system_form_instances (
        id, inspection_group_id, client_uuid, instance_key, zone_id, location_id,
        zone_snapshot, location_snapshot, display_sequence,
        master_template_version_id, customer_configuration_revision_id,
        snapshot_schema_version, inspection_snapshot, response_schema_version,
        response_payload, request_fingerprint, status, performed_at,
        original_created_by_user_id, original_creator_snapshot, synced_by_user_id,
        evidence_policy_id, evidence_policy_version, evidence_policy_snapshot,
        evidence_policy_sha256
      )
      SELECT $1, inspection_group_id, $2, 'policy-null-validation', zone_id, location_id,
        zone_snapshot, location_snapshot, display_sequence + 100,
        master_template_version_id, customer_configuration_revision_id,
        snapshot_schema_version, inspection_snapshot, response_schema_version,
        response_payload, request_fingerprint, status, performed_at,
        original_created_by_user_id, original_creator_snapshot, synced_by_user_id,
        NULL, NULL, NULL, NULL
      FROM master_system_form_instances
      WHERE client_uuid = $3`,
      [cloneId, cloneClientUuid, inspectionClientUuid]
    );
    const historical = await client.query<{ all_null: boolean }>(
      `SELECT evidence_policy_id IS NULL
          AND evidence_policy_version IS NULL
          AND evidence_policy_snapshot IS NULL
          AND evidence_policy_sha256 IS NULL AS all_null
       FROM master_system_form_instances WHERE id = $1`,
      [cloneId]
    );
    await expectRejected(
      "partial_policy",
      "UPDATE master_system_form_instances SET evidence_policy_version = 1 WHERE id = $1",
      [cloneId]
    );
    await client.query(
      `UPDATE master_system_form_instances target
       SET evidence_policy_id = source.evidence_policy_id,
           evidence_policy_version = source.evidence_policy_version,
           evidence_policy_snapshot = source.evidence_policy_snapshot,
           evidence_policy_sha256 = source.evidence_policy_sha256
       FROM master_system_form_instances source
       WHERE target.id = $1 AND source.client_uuid = $2`,
      [cloneId, inspectionClientUuid]
    );
    const completeAssignment = await client.query<{ complete: boolean }>(
      `SELECT evidence_policy_id IS NOT NULL
          AND evidence_policy_version IS NOT NULL
          AND evidence_policy_snapshot IS NOT NULL
          AND evidence_policy_sha256 IS NOT NULL AS complete
       FROM master_system_form_instances WHERE id = $1`,
      [cloneId]
    );
    await client.query(
      "UPDATE master_system_form_instances SET updated_at = now() WHERE id = $1",
      [cloneId]
    );
    await expectRejected(
      "change_id",
      "UPDATE master_system_form_instances SET evidence_policy_id = $2 WHERE id = $1",
      [cloneId, randomUUID()]
    );
    await expectRejected(
      "change_version",
      "UPDATE master_system_form_instances SET evidence_policy_version = evidence_policy_version + 1 WHERE id = $1",
      [cloneId]
    );
    await expectRejected(
      "change_snapshot",
      `UPDATE master_system_form_instances
       SET evidence_policy_snapshot = evidence_policy_snapshot || '{"changed":true}'::jsonb
       WHERE id = $1`,
      [cloneId]
    );
    await expectRejected(
      "change_hash",
      "UPDATE master_system_form_instances SET evidence_policy_sha256 = repeat('f', 64) WHERE id = $1",
      [cloneId]
    );
    await expectRejected(
      "clear_policy",
      `UPDATE master_system_form_instances
       SET evidence_policy_id = NULL, evidence_policy_version = NULL,
           evidence_policy_snapshot = NULL, evidence_policy_sha256 = NULL
       WHERE id = $1`,
      [cloneId]
    );
    return {
      historicalNullAccepted: historical.rows[0]?.all_null === true,
      completeFirstAssignmentAccepted: completeAssignment.rows[0]?.complete === true,
      unrelatedUpdateAccepted: true,
      partialRejected: rejected.includes("partial_policy"),
      idChangeRejected: rejected.includes("change_id"),
      versionChangeRejected: rejected.includes("change_version"),
      snapshotChangeRejected: rejected.includes("change_snapshot"),
      hashChangeRejected: rejected.includes("change_hash"),
      clearRejected: rejected.includes("clear_policy")
    };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function main() {
  const actor = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE is_active = true AND role IN ('admin','inspector') ORDER BY id LIMIT 1"
  );
  const actorUserId = actor.rows[0]?.id;
  if (!actorUserId) throw new Error("An active validation actor is required");

  const customerId = randomUUID();
  const revisionId = randomUUID();
  const enabledSystemId = randomUUID();
  const jobId = randomUUID();
  const inspectionClientUuid = randomUUID();
  const photoUuid = randomUUID();
  const secondPhotoUuid = randomUUID();
  const occupiedPhotoUuid = randomUUID();
  const missingParentPhotoUuid = randomUUID();
  const disallowedPhotoUuid = randomUUID();
  const malformedPhotoUuid = randomUUID();
  const oversizedPhotoUuid = randomUUID();
  const oversizedDimensionsPhotoUuid = randomUUID();
  const concurrentPhotoUuid = randomUUID();
  const sessionToken = randomBytes(32).toString("base64url");
  const capturedAt = new Date().toISOString();
  const cleanupPhotoUuids = [
    photoUuid,
    secondPhotoUuid,
    occupiedPhotoUuid,
    missingParentPhotoUuid,
    disallowedPhotoUuid,
    malformedPhotoUuid,
    oversizedPhotoUuid,
    oversizedDimensionsPhotoUuid,
    concurrentPhotoUuid
  ];
  const cleanupPaths: string[] = [];

  try {
    const source = await pool.query<{
      template_id: string;
      configuration_snapshot: Record<string, unknown>;
    }>(
      `SELECT master_template_version_id AS template_id, configuration_snapshot
         FROM inspection_jobs
         WHERE job_reference = 'DEMO-JOB-SPRINKLER-PHOTO-001'`
    );
    const base = source.rows[0];
    if (!base) throw new Error("Photo-enabled source fixture is unavailable");
    const snapshot = structuredClone(base.configuration_snapshot);
    const configuration = snapshot.configuration as Record<string, unknown>;
    const customer = snapshot.customer as Record<string, unknown>;
    const enabledSystems = snapshot.enabledSystems as Array<Record<string, unknown>>;
    customer.id = customerId;
    customer.code = "VALIDATION-PHOTO";
    customer.displayName = "Disposable Photo Validation";
    configuration.revisionId = revisionId;
    configuration.revisionNumber = 1;
    enabledSystems[0].enabledSystemId = enabledSystemId;

    const fixtureClient = await pool.connect();
    try {
      await fixtureClient.query("BEGIN");
      await fixtureClient.query(
        "INSERT INTO customers (id, customer_code, display_name, is_demo) VALUES ($1,'VALIDATION-PHOTO','Disposable Photo Validation',true)",
        [customerId]
      );
      await fixtureClient.query(
        `INSERT INTO customer_configuration_revisions
          (id, customer_id, template_version_id, revision, status)
          VALUES ($1,$2,$3,1,'active')`,
        [revisionId, customerId, base.template_id]
      );
      await fixtureClient.query(
        `INSERT INTO customer_enabled_systems
          (id, configuration_revision_id, template_version_id, system_key,
           sort_order, evidence_policy_id)
          VALUES ($1,$2,$3,'automatic_sprinkler',1,
            '00000000-0000-4000-8000-000000000710')`,
        [enabledSystemId, revisionId, base.template_id]
      );
      await fixtureClient.query(
        `INSERT INTO inspection_jobs (
          id, template_id, master_template_version_id, job_reference, title,
          status, is_sample, customer_id, customer_configuration_revision_id,
          configuration_snapshot
        ) VALUES ($1,NULL,$2,$3,'Disposable Photo Validation','open',true,$4,$5,$6)`,
        [jobId, base.template_id, `VALIDATION-PHOTO-${jobId}`, customerId, revisionId, snapshot]
      );
      await fixtureClient.query("COMMIT");
    } catch (error) {
      await fixtureClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      fixtureClient.release();
    }

    const definition = await pool.query<{ definition: unknown }>(
      `SELECT definition FROM master_service_report_systems
        WHERE template_version_id = $1 AND system_key = 'automatic_sprinkler'`,
      [base.template_id]
    );
    const controls = resolveAutomaticSprinklerControls(
      definition.rows[0]?.definition,
      "MFE-FSSR",
      1
    );
    const rows = (definitions: Array<{ key: string }>) =>
      Object.fromEntries(definitions.map((row) => [
        row.key,
        { result: "good", remarks: "" }
      ]));
    const measurements = Object.fromEntries(controls.measurements.map((row) => [
      row.key,
      {
        values: Object.fromEntries(row.values.map((value) => [value.key, 10.5])),
        unit: "PSI",
        result: "good",
        remarks: ""
      }
    ]));
    const parentResult = await syncAutomaticSprinklerInspections([{
      operationId: randomUUID(),
      entityType: "masterSystemInspection",
      entityId: inspectionClientUuid,
      action: "create",
      payload: {
        clientUuid: inspectionClientUuid,
        jobId,
        systemKey: "automatic_sprinkler",
        instanceKey: "primary",
        configuredZoneId: null,
        configuredLocationId: null,
        displaySequence: 1,
        originalCreatorSnapshot: null,
        masterTemplate: { id: base.template_id, code: "MFE-FSSR", version: 1 },
        configuration: { revisionId, revisionNumber: 1 },
        inspectionSnapshot: {},
        responses: {
          schemaVersion: 1,
          waterTank: rows(controls.checklist.waterTank),
          pumpHouse: rows(controls.checklist.pumpHouse),
          measurements,
          mainAlarmValve: rows(controls.checklist.mainAlarmValve),
          comments: ""
        },
        performedAt: capturedAt
      }
    }], actorUserId);
    if (parentResult.acceptedIds[0] !== inspectionClientUuid) {
      throw new Error(`Disposable parent was not accepted: ${JSON.stringify(parentResult)}`);
    }
    const policyImmutability = await validateAcceptedPolicyImmutability(
      inspectionClientUuid
    );

    await pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
        VALUES ($1,$2,now() + interval '1 hour')`,
      [actorUserId, hashSessionToken(sessionToken)]
    );

    const firstImage = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 245, g: 245, b: 245 }
      }
    }).withMetadata().jpeg({ quality: 80 }).toBuffer();
    const changedImage = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 220, g: 240, b: 255 }
      }
    }).jpeg({ quality: 80 }).toBuffer();
    const oversizedDimensionsImage = await sharp({
      create: {
        width: 1601,
        height: 64,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    }).jpeg({ quality: 80 }).toBuffer();

    const accepted = await request(
      sessionToken, photoUuid, inspectionClientUuid, fields[0], firstImage, capturedAt
    );
    if (accepted.status !== 201 || accepted.body.outcome !== "accepted") {
      throw new Error(`Initial attachment upload failed: ${JSON.stringify(accepted)}`);
    }
    const duplicate = await request(
      sessionToken, photoUuid, inspectionClientUuid, fields[0], firstImage, capturedAt
    );
    const committedRow = await pool.query<{ request_fingerprint: string }>(
      "SELECT request_fingerprint FROM inspection_attachments WHERE client_uuid = $1",
      [photoUuid]
    );
    const ambiguousCommitResolution = await resolveAttachmentCommitOutcome(
      photoUuid,
      committedRow.rows[0]?.request_fingerprint ?? ""
    );
    const firstStorage = attachmentPaths(inspectionClientUuid, photoUuid);
    const canonicalBytes = await readFile(firstStorage.finalPath);
    await unlink(firstStorage.finalPath);
    const missingFileDuplicate = await request(
      sessionToken, photoUuid, inspectionClientUuid, fields[0], firstImage, capturedAt
    );
    await writeFile(firstStorage.finalPath, canonicalBytes);
    await writeFile(
      firstStorage.finalPath,
      canonicalBytes.subarray(0, Math.max(1, canonicalBytes.length - 1))
    );
    const truncatedFileDuplicate = await request(
      sessionToken, photoUuid, inspectionClientUuid, fields[0], firstImage, capturedAt
    );
    await writeFile(firstStorage.finalPath, canonicalBytes);
    const wrongHashBytes = Buffer.from(canonicalBytes);
    wrongHashBytes[Math.floor(wrongHashBytes.length / 2)] ^= 0xff;
    await writeFile(firstStorage.finalPath, wrongHashBytes);
    const wrongHashDuplicate = await request(
      sessionToken, photoUuid, inspectionClientUuid, fields[0], firstImage, capturedAt
    );
    await writeFile(firstStorage.finalPath, canonicalBytes);
    const changed = await request(
      sessionToken, photoUuid, inspectionClientUuid, fields[0], changedImage, capturedAt
    );
    const occupied = await request(
      sessionToken, occupiedPhotoUuid, inspectionClientUuid, fields[0], firstImage, capturedAt
    );
    const parentMissing = await request(
      sessionToken, missingParentPhotoUuid, randomUUID(), fields[1], firstImage, capturedAt
    );
    const disallowed = await request(
      sessionToken, disallowedPhotoUuid, inspectionClientUuid, "measurements.not_allowed.value",
      firstImage, capturedAt
    );
    const malformed = await request(
      sessionToken, malformedPhotoUuid, inspectionClientUuid, fields[1],
      Buffer.from("not-an-image"), capturedAt
    );
    const oversized = await request(
      sessionToken, oversizedPhotoUuid, inspectionClientUuid, fields[1],
      Buffer.alloc(2 * 1024 * 1024 + 1), capturedAt
    );
    const oversizedDimensions = await request(
      sessionToken, oversizedDimensionsPhotoUuid, inspectionClientUuid, fields[1],
      oversizedDimensionsImage, capturedAt
    );
    const secondAccepted = await request(
      sessionToken, secondPhotoUuid, inspectionClientUuid, fields[1], changedImage, capturedAt
    );
    const concurrent = await Promise.all([
      request(
        sessionToken, concurrentPhotoUuid, inspectionClientUuid, fields[2],
        firstImage, capturedAt
      ),
      request(
        sessionToken, concurrentPhotoUuid, inspectionClientUuid, fields[2],
        firstImage, capturedAt
      )
    ]);
    const pathTraversal = await request(
      sessionToken, "../../outside", inspectionClientUuid, fields[2],
      firstImage, capturedAt
    );
    const duplicateField = await request(
      sessionToken,
      randomUUID(),
      inspectionClientUuid,
      fields[2],
      firstImage,
      capturedAt,
      { mutate: (form) => form.append("capturedAt", capturedAt) }
    );
    const excessField = await request(
      sessionToken,
      randomUUID(),
      inspectionClientUuid,
      fields[2],
      firstImage,
      capturedAt,
      { mutate: (form) => form.append("unexpected", "value") }
    );
    const oversizedRequest = await request(
      sessionToken,
      randomUUID(),
      inspectionClientUuid,
      fields[2],
      Buffer.alloc(2 * 1024 * 1024),
      capturedAt,
      { filename: `${"x".repeat(40 * 1024)}.jpg` }
    );

    const listing = await fetch(
      `${baseUrl}/inspection-attachments?inspectionClientUuid=${inspectionClientUuid}`,
      { headers: { Cookie: `${cookieName}=${sessionToken}` } }
    );
    const listingBody = await listing.json() as { attachments: Array<{ photoUuid: string }> };
    const detail = await fetch(
      `${baseUrl}/master-system-inspections/${inspectionClientUuid}`,
      { headers: { Cookie: `${cookieName}=${sessionToken}` } }
    );
    const detailBody = await detail.json() as {
      inspection?: {
        clientUuid?: string;
        serverFormInstanceId?: string;
        systemKey?: string;
        status?: string;
        responses?: unknown;
        displayControls?: unknown;
        evidencePolicyId?: string;
      };
    };
    const content = await fetch(
      `${baseUrl}/inspection-attachments/${photoUuid}/content`,
      { headers: { Cookie: `${cookieName}=${sessionToken}` } }
    );
    const unauthenticatedContent = await fetch(
      `${baseUrl}/inspection-attachments/${photoUuid}/content`
    );
    const storedRows = await pool.query<{
      client_uuid: string;
      storage_relative_path: string;
      source_sha256: string;
      stored_sha256: string;
    }>(
      `SELECT client_uuid, storage_relative_path, source_sha256, stored_sha256
         FROM inspection_attachments
         WHERE client_uuid = ANY($1::uuid[])
         ORDER BY client_uuid`,
      [cleanupPhotoUuids]
    );
    cleanupPaths.push(...storedRows.rows.map((row) => row.storage_relative_path));
    const storedMetadata = await sharp(Buffer.from(await content.arrayBuffer())).metadata();
    const filesExist = await Promise.all(storedRows.rows.map(async (row) => {
      const storage = attachmentPaths(inspectionClientUuid, row.client_uuid);
      return stat(storage.finalPath).then(() => true, () => false);
    }));
    const actorRows = await pool.query<{ matches: boolean }>(
      `SELECT bool_and(uploaded_by_user_id = $1) AS matches
         FROM inspection_attachments
         WHERE client_uuid = ANY($2::uuid[])`,
      [actorUserId, cleanupPhotoUuids]
    );
    const storedOriginals = new Map<string, Buffer>();
    for (const row of storedRows.rows) {
      const storage = attachmentPaths(inspectionClientUuid, row.client_uuid);
      storedOriginals.set(row.storage_relative_path, await readFile(storage.finalPath));
    }
    const missingRow = storedRows.rows[0];
    const wrongSizeRow = storedRows.rows[1];
    const wrongHashRow = storedRows.rows[2];
    if (!missingRow || !wrongSizeRow || !wrongHashRow) {
      throw new Error("Three stored rows are required for reconciliation validation");
    }
    const missingStorage = attachmentPaths(inspectionClientUuid, missingRow.client_uuid);
    const wrongSizeStorage = attachmentPaths(inspectionClientUuid, wrongSizeRow.client_uuid);
    const wrongHashStorage = attachmentPaths(inspectionClientUuid, wrongHashRow.client_uuid);
    await unlink(missingStorage.finalPath);
    const wrongSizeOriginal = storedOriginals.get(wrongSizeRow.storage_relative_path);
    const wrongHashOriginal = storedOriginals.get(wrongHashRow.storage_relative_path);
    if (!wrongSizeOriginal || !wrongHashOriginal) throw new Error("Stored originals are unavailable");
    await writeFile(
      wrongSizeStorage.finalPath,
      wrongSizeOriginal.subarray(0, Math.max(1, wrongSizeOriginal.length - 1))
    );
    const reconciliationWrongHash = Buffer.from(wrongHashOriginal);
    reconciliationWrongHash[Math.floor(reconciliationWrongHash.length / 2)] ^= 0xff;
    await writeFile(wrongHashStorage.finalPath, reconciliationWrongHash);
    const orphanRelativePath = `inspections/reconciliation-${randomUUID()}.jpg`;
    const orphanPath = path.resolve(
      firstStorage.uploadsRoot,
      ...orphanRelativePath.split("/")
    );
    await mkdir(path.dirname(orphanPath), { recursive: true });
    await writeFile(orphanPath, canonicalBytes);
    const staleTempRelativePath = `.tmp/reconciliation-${randomUUID()}.upload`;
    const staleTempPath = path.resolve(
      firstStorage.uploadsRoot,
      ...staleTempRelativePath.split("/")
    );
    await mkdir(path.dirname(staleTempPath), { recursive: true });
    await writeFile(staleTempPath, canonicalBytes);
    const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(staleTempPath, staleAt, staleAt);
    const reconciliation = await reconcileAttachmentStorage();
    const staleTempStillExists = await stat(staleTempPath).then(() => true, () => false);
    await writeFile(
      missingStorage.finalPath,
      storedOriginals.get(missingRow.storage_relative_path) ?? canonicalBytes
    );
    await writeFile(wrongSizeStorage.finalPath, wrongSizeOriginal);
    await writeFile(wrongHashStorage.finalPath, wrongHashOriginal);
    await unlink(orphanPath);
    await unlink(staleTempPath);

    const report = {
      parentAccepted: parentResult.acceptedIds.includes(inspectionClientUuid),
      policyImmutability:
        Object.values(policyImmutability).every((value) => value === true),
      accepted: accepted.status === 201 && accepted.body.outcome === "accepted",
      duplicate: duplicate.status === 200 && duplicate.body.outcome === "duplicate",
      ambiguousCommitResolved:
        ambiguousCommitResolution?.clientUuid === photoUuid,
      missingFileDuplicateRejected:
        missingFileDuplicate.status === 500
        && missingFileDuplicate.body.error === "ATTACHMENT_STORAGE_INTEGRITY_ERROR",
      truncatedFileDuplicateRejected:
        truncatedFileDuplicate.status === 500
        && truncatedFileDuplicate.body.error === "ATTACHMENT_STORAGE_INTEGRITY_ERROR",
      wrongHashDuplicateRejected:
        wrongHashDuplicate.status === 500
        && wrongHashDuplicate.body.error === "ATTACHMENT_STORAGE_INTEGRITY_ERROR",
      changedConflict: changed.status === 409 && changed.body.error === "IDEMPOTENCY_CONFLICT",
      occupiedConflict: occupied.status === 409 && occupied.body.error === "ATTACHMENT_FIELD_OCCUPIED",
      parentMissing: parentMissing.status === 409 && parentMissing.body.error === "PARENT_NOT_SYNCED",
      disallowed: disallowed.status === 403 && disallowed.body.error === "EVIDENCE_NOT_ALLOWED",
      malformed: malformed.status === 400 && malformed.body.error === "IMAGE_INVALID",
      oversized: oversized.status === 400 && oversized.body.error === "IMAGE_INVALID",
      oversizedDimensions:
        oversizedDimensions.status === 400
        && oversizedDimensions.body.error === "IMAGE_INVALID",
      secondAccepted: secondAccepted.status === 201,
      concurrentDuplicate:
        concurrent.map((result) => `${result.status}:${result.body.outcome}`).sort().join(",")
        === "200:duplicate,201:accepted",
      pathTraversal:
        pathTraversal.status === 400
        && pathTraversal.body.error === "VALIDATION_ERROR",
      duplicateMultipartField:
        duplicateField.status === 400
        && duplicateField.body.error === "VALIDATION_ERROR",
      excessMultipartPart:
        excessField.status === 400
        && excessField.body.error === "VALIDATION_ERROR",
      oversizedMultipartRequest:
        oversizedRequest.status === 413
        && oversizedRequest.body.error === "VALIDATION_ERROR",
      listCount: listingBody.attachments.length,
      serverDetail:
        detail.status === 200
        && detailBody.inspection?.clientUuid === inspectionClientUuid
        && detailBody.inspection?.systemKey === "automatic_sprinkler"
        && detailBody.inspection?.status === "submitted"
        && typeof detailBody.inspection.serverFormInstanceId === "string"
        && detailBody.inspection.responses !== undefined
        && detailBody.inspection.displayControls !== undefined
        && detailBody.inspection.evidencePolicyId ===
          "00000000-0000-4000-8000-000000000710",
      serverDetailSafe:
        !JSON.stringify(detailBody).match(
          /storageRelativePath|requestFingerprint|session|cookie|password/i
        ),
      contentStatus: content.status,
      unauthenticatedContentRejected:
        unauthenticatedContent.status === 401
        || unauthenticatedContent.status === 403,
      contentType: content.headers.get("content-type"),
      nosniff: content.headers.get("x-content-type-options"),
      disposition: content.headers.get("content-disposition"),
      privateCache: content.headers.get("cache-control"),
      metadataRows: storedRows.rowCount,
      filesExist: filesExist.every(Boolean),
      metadataRemoved: storedMetadata.exif === undefined,
      actorAttribution: actorRows.rows[0]?.matches === true,
      reconciliationMissing:
        reconciliation.missingFiles.includes(missingRow.storage_relative_path),
      reconciliationWrongSize:
        reconciliation.wrongSizeFiles.includes(wrongSizeRow.storage_relative_path),
      reconciliationWrongHash:
        reconciliation.wrongHashFiles.includes(wrongHashRow.storage_relative_path),
      reconciliationOrphan:
        reconciliation.orphanFiles.includes(orphanRelativePath),
      reconciliationStaleTemp:
        reconciliation.staleTemporaryFiles.includes(staleTempRelativePath)
        && staleTempStillExists
    };
    const passed = Object.entries(report).every(([key, value]) =>
      key === "listCount" || key === "metadataRows"
        ? value === 3
        : key === "contentStatus"
          ? value === 200
          : key === "contentType"
            ? value === "image/jpeg"
            : key === "nosniff"
              ? value === "nosniff"
              : key === "disposition"
                ? value === "inline"
                : key === "privateCache"
                  ? value === "private, no-store"
                  : value === true
    );
    console.log(JSON.stringify({ status: passed ? "PASS" : "FAIL", ...report }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    const stored = await pool.query<{ storage_relative_path: string }>(
      `SELECT storage_relative_path FROM inspection_attachments
        WHERE form_instance_id IN (
          SELECT id FROM master_system_form_instances WHERE client_uuid = $1
        )`,
      [inspectionClientUuid]
    ).catch(() => ({ rows: [] }));
    cleanupPaths.push(...stored.rows.map((row) => row.storage_relative_path));
    for (const relativePath of new Set(cleanupPaths)) {
      const filePath = path.resolve(
        attachmentPaths(inspectionClientUuid, photoUuid).uploadsRoot,
        ...relativePath.split("/")
      );
      await unlink(filePath).catch(() => undefined);
    }
    for (const cleanupPhotoUuid of cleanupPhotoUuids) {
      await unlink(
        attachmentPaths(inspectionClientUuid, cleanupPhotoUuid).finalPath
      ).catch(() => undefined);
    }
    await pool.query("DELETE FROM audit_events WHERE entity_id = ANY($1::text[])", [cleanupPhotoUuids]).catch(() => undefined);
    await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [hashSessionToken(sessionToken)]).catch(() => undefined);
    await pool.query("DELETE FROM inspection_attachments WHERE form_instance_id IN (SELECT id FROM master_system_form_instances WHERE client_uuid = $1)", [inspectionClientUuid]).catch(() => undefined);
    await pool.query("DELETE FROM master_system_form_instances WHERE client_uuid = $1", [inspectionClientUuid]).catch(() => undefined);
    await pool.query("DELETE FROM master_system_inspections WHERE job_id = $1", [jobId]).catch(() => undefined);
    await pool.query("DELETE FROM inspection_jobs WHERE id = $1", [jobId]).catch(() => undefined);
    await pool.query("DELETE FROM customer_enabled_systems WHERE id = $1", [enabledSystemId]).catch(() => undefined);
    await pool.query("DELETE FROM customer_configuration_revisions WHERE id = $1", [revisionId]).catch(() => undefined);
    await pool.query("DELETE FROM customers WHERE id = $1", [customerId]).catch(() => undefined);
    const directory = attachmentPaths(inspectionClientUuid, photoUuid).finalPath;
    await rmdir(path.dirname(directory)).catch(() => undefined);
    await pool.end();
  }
}

await main();
