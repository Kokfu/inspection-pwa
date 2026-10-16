import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "../db/migrations.js";
import { pool } from "../db/pool.js";
import { reconcileAttachmentStorage } from "./attachmentStorage.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function snapshot(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const lines = await Promise.all(entries.map(async (entry) => {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) return (await snapshot(child)).map((line) => `${entry.name}/${line}`);
    return [`${entry.name} ${(await stat(child)).size} ${sha(await readFile(child))}`];
  }));
  return lines.flat().sort();
}

test("reconciliation covers staged_inspection_evidence as well as inspection_attachments (disposable PostgreSQL)", async () => {
  const url = new URL(process.env.SEED_INTEGRATION_DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/phase6_seed_integration");
  const database = new pg.Pool({ connectionString: url.toString() });
  const uploadsRoot = await mkdtemp(path.join(tmpdir(), "reconcile-"));
  const previousUploadsPath = process.env.UPLOADS_PATH;
  process.env.UPLOADS_PATH = uploadsRoot;
  try {
    await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await runMigrations(database);

    const job = randomUUID();
    const write = async (name: string, bytes: Buffer) => {
      const relative = `inspections/${job}/${name}.jpg`;
      await mkdir(path.join(uploadsRoot, "inspections", job), { recursive: true });
      await writeFile(path.join(uploadsRoot, ...relative.split("/")), bytes);
      return relative;
    };
    // `intended` is what the database row records; `onDisk` is what is actually stored (null = file absent).
    const content = (label: string) => Buffer.from(`${label}-${randomUUID()}`.repeat(20));
    const fixture = async (name: string, intended: Buffer, onDisk: Buffer | null = intended) => {
      const relative = onDisk ? await write(name, onDisk) : `inspections/${job}/${name}.jpg`;
      return { relative, size: intended.length, sha: sha(intended) };
    };
    const flipped = (bytes: Buffer) => Buffer.from(bytes.map((byte) => byte ^ 1));

    const stagedOk = await fixture("staged-ok", content("a"));
    const acceptedOk = await fixture("accepted-ok", content("b"));
    const attachmentOk = await fixture("attachment-ok", content("c"));
    const stagedMissing = await fixture("staged-missing", content("d"), null);
    const acceptedMissing = await fixture("accepted-missing", content("e"), null);
    const attachmentMissing = await fixture("attachment-missing", content("f"), null);
    const full = content("g");
    const acceptedTruncated = await fixture("accepted-truncated", full, full.subarray(0, full.length - 7));
    const stagedSource = content("h");
    const stagedWrongHash = await fixture("staged-wrong-hash", stagedSource, flipped(stagedSource));
    const attachmentSource = content("j");
    const attachmentWrongHash = await fixture("attachment-wrong-hash", attachmentSource, flipped(attachmentSource));
    const orphan = await write("orphan", content("i"));
    const client = await database.connect();

    const insertStaged = (
      item: { relative: string; size: number; sha: string },
      status: "staged" | "accepted",
      fieldPath: string
    ) => client.query(
      `INSERT INTO staged_inspection_evidence(photo_uuid,inspection_client_uuid,job_id,system_key,field_path,master_template_version_id,master_template_version,system_contract_sha256,uploader_user_id,request_fingerprint,source_sha256,stored_sha256,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,storage_relative_path,status,form_instance_id,accepted_at)
       VALUES ($1,$2,$3,'co2_fire_extinguisher',$4,$5,7,$6,1,$7,$8,$8,'image/jpeg',1,1,1,$9,1,1,$10,$11,$12,$13)`,
      [randomUUID(), randomUUID(), job, fieldPath, randomUUID(), "a".repeat(64), sha(Buffer.from(fieldPath)), item.sha,
        item.size, item.relative, status, status === "accepted" ? randomUUID() : null, status === "accepted" ? new Date() : null]
    );
    const insertAttachment = (item: { relative: string; size: number; sha: string }) => client.query(
      `INSERT INTO inspection_attachments(id,client_uuid,form_instance_id,evidence_policy_id,field_path,capture_source,storage_relative_path,source_sha256,stored_sha256,request_fingerprint,mime_type,source_size_bytes,source_width,source_height,stored_size_bytes,width,height,captured_at,uploaded_by_user_id)
       VALUES ($1,$1,$2,$3,'test.field','unknown',$4,$5,$5,$6,'image/jpeg',1,1,1,$7,1,1,now(),1)`,
      [randomUUID(), randomUUID(), randomUUID(), item.relative, item.sha, sha(Buffer.from(item.relative)), item.size]
    );

    // The rows' foreign-key parents are not under test; skip them on this connection only.
    try {
      await client.query("SET session_replication_role = replica");
      await insertStaged(stagedOk, "staged", "f.staged-ok");
      await insertStaged(acceptedOk, "accepted", "f.accepted-ok");
      await insertAttachment(attachmentOk);
      await insertStaged(stagedMissing, "staged", "f.staged-missing");
      await insertStaged(acceptedMissing, "accepted", "f.accepted-missing");
      await insertAttachment(attachmentMissing);
      await insertStaged(acceptedTruncated, "accepted", "f.accepted-truncated");
      await insertStaged(stagedWrongHash, "staged", "f.staged-wrong-hash");
      await insertAttachment(attachmentWrongHash);
    } finally {
      client.release();
    }

    const before = await snapshot(uploadsRoot);
    const result = await reconcileAttachmentStorage();
    const sorted = (values: string[]) => [...values].sort();

    assert.deepEqual(result.orphanFiles, [orphan], "only a file in neither table is an orphan");
    assert.deepEqual(sorted(result.missingFiles), sorted([stagedMissing.relative, acceptedMissing.relative, attachmentMissing.relative]));
    assert.deepEqual(result.wrongSizeFiles, [acceptedTruncated.relative]);
    assert.deepEqual(sorted(result.wrongHashFiles), sorted([stagedWrongHash.relative, attachmentWrongHash.relative]));
    assert.deepEqual(result.staleTemporaryFiles, []);
    for (const healthy of [stagedOk, acceptedOk, attachmentOk]) {
      assert(!result.orphanFiles.includes(healthy.relative));
      assert(![...result.missingFiles, ...result.wrongSizeFiles, ...result.wrongHashFiles].includes(healthy.relative));
    }
    assert.deepEqual(await snapshot(uploadsRoot), before, "reconciliation is read-only");
    // Reconcile rewrites the write-probe only; nothing else may appear in the root.
    assert.deepEqual((await readdir(uploadsRoot)).sort(), ["inspections"]);
  } finally {
    if (previousUploadsPath === undefined) delete process.env.UPLOADS_PATH; else process.env.UPLOADS_PATH = previousUploadsPath;
    await rm(uploadsRoot, { recursive: true, force: true });
    await database.end();
    await pool.end();
  }
});
