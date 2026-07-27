import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadConfig } from "../config/env.js";
import { pool } from "../db/pool.js";

export const attachmentMaxBytes = 2 * 1024 * 1024;
export const attachmentMaxLongEdge = 1600;
export const attachmentInputPixelLimit = 40_000_000;

export type NormalizedImage = {
  sourceSha256: string;
  sourceSizeBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  storedSha256: string;
  storedSizeBytes: number;
  width: number;
  height: number;
  normalizedTempPath: string;
};

export function attachmentPaths(
  inspectionClientUuid: string,
  photoUuid: string
) {
  const uploadsRoot = path.resolve(loadConfig().uploadsPath);
  const relativePath = path.posix.join(
    "inspections",
    inspectionClientUuid,
    `${photoUuid}.jpg`
  );
  const finalPath = path.resolve(uploadsRoot, ...relativePath.split("/"));
  if (!finalPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Attachment storage path escaped the uploads root");
  }
  return { uploadsRoot, relativePath, finalPath };
}

export async function createAttachmentTempPath() {
  const tempDirectory = path.resolve(loadConfig().uploadsPath, ".tmp");
  await mkdir(tempDirectory, { recursive: true });
  return path.join(tempDirectory, `${randomUUID()}.upload`);
}

export async function normalizeAttachmentImage(
  sourcePath: string
): Promise<NormalizedImage> {
  const source = await readFile(sourcePath);
  if (source.length === 0 || source.length > attachmentMaxBytes) {
    throw new Error("IMAGE_SIZE_INVALID");
  }
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const image = sharp(source, {
    failOn: "warning",
    limitInputPixels: attachmentInputPixelLimit,
    pages: 1
  });
  const sourceMetadata = await image.metadata();
  const sourceWidth = sourceMetadata.width ?? 0;
  const sourceHeight = sourceMetadata.height ?? 0;
  if (
    sourceMetadata.format !== "jpeg"
    || sourceMetadata.pages && sourceMetadata.pages > 1
    || sourceWidth <= 0
    || sourceHeight <= 0
    || sourceWidth > attachmentMaxLongEdge
    || sourceHeight > attachmentMaxLongEdge
  ) {
    throw new Error("IMAGE_DIMENSIONS_INVALID");
  }

  const normalizedTempPath = `${sourcePath}.jpg`;
  const output = await image
    .rotate()
    .resize({
      width: attachmentMaxLongEdge,
      height: attachmentMaxLongEdge,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(normalizedTempPath);
  const stored = await readFile(normalizedTempPath);
  if (
    output.width <= 0
    || output.height <= 0
    || output.width > attachmentMaxLongEdge
    || output.height > attachmentMaxLongEdge
    || stored.length === 0
    || stored.length > attachmentMaxBytes
  ) {
    await unlink(normalizedTempPath).catch(() => undefined);
    throw new Error("NORMALIZED_IMAGE_INVALID");
  }
  return {
    sourceSha256,
    sourceSizeBytes: source.length,
    sourceWidth,
    sourceHeight,
    storedSha256: createHash("sha256").update(stored).digest("hex"),
    storedSizeBytes: stored.length,
    width: output.width,
    height: output.height,
    normalizedTempPath
  };
}

export async function moveNormalizedAttachment(
  normalizedTempPath: string,
  finalPath: string
) {
  const directory = path.dirname(finalPath);
  await mkdir(directory, { recursive: true });
  const fileHandle = await open(normalizedTempPath, "r");
  try {
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }
  await rename(normalizedTempPath, finalPath);
  const directoryHandle = await open(directory, "r").catch(() => undefined);
  if (directoryHandle) {
    try {
      await directoryHandle.sync().catch((error: NodeJS.ErrnoException) => {
        if (!["EINVAL", "ENOTSUP", "EPERM"].includes(error.code ?? "")) throw error;
      });
    } finally {
      await directoryHandle.close();
    }
  }
}

async function streamingSha256(filePath: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}

export type StoredAttachmentIntegrity =
  | { ok: true }
  | { ok: false; reason: "missing" | "wrong-size" | "wrong-hash" | "unsafe-path" };

export async function verifyAttachmentFile(values: {
  storageRelativePath: string;
  storedSizeBytes: number;
  storedSha256: string;
}): Promise<StoredAttachmentIntegrity> {
  const uploadsRoot = path.resolve(loadConfig().uploadsPath);
  const filePath = path.resolve(
    uploadsRoot,
    ...values.storageRelativePath.split("/")
  );
  if (!filePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    return { ok: false, reason: "unsafe-path" };
  }
  const metadata = await stat(filePath).catch(() => undefined);
  if (!metadata?.isFile()) return { ok: false, reason: "missing" };
  if (metadata.size !== values.storedSizeBytes) {
    return { ok: false, reason: "wrong-size" };
  }
  const actualSha256 = await streamingSha256(filePath).catch(() => undefined);
  if (actualSha256 !== values.storedSha256) {
    return { ok: false, reason: "wrong-hash" };
  }
  return { ok: true };
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(child) : [child];
  }));
  return files.flat();
}

export async function reconcileAttachmentStorage() {
  const uploadsRoot = path.resolve(loadConfig().uploadsPath);
  await mkdir(uploadsRoot, { recursive: true });
  const writableProbe = path.join(uploadsRoot, `.write-probe-${randomUUID()}`);
  await import("node:fs/promises").then(({ writeFile }) => writeFile(writableProbe, ""));
  await unlink(writableProbe);

  const rows = await pool.query<{
    storage_relative_path: string;
    stored_size_bytes: number;
    stored_sha256: string;
  }>(
    `SELECT storage_relative_path, stored_size_bytes, stored_sha256
       FROM inspection_attachments`
  );
  const expected = new Set(rows.rows.map((row) => row.storage_relative_path));
  const inspectionRoot = path.join(uploadsRoot, "inspections");
  const storedFiles = await walkFiles(inspectionRoot);
  const orphanFiles = storedFiles
    .map((file) => path.relative(uploadsRoot, file).split(path.sep).join("/"))
    .filter((relativePath) => !expected.has(relativePath));
  const missingFiles: string[] = [];
  const wrongSizeFiles: string[] = [];
  const wrongHashFiles: string[] = [];
  for (const row of rows.rows) {
    const integrity = await verifyAttachmentFile({
      storageRelativePath: row.storage_relative_path,
      storedSizeBytes: row.stored_size_bytes,
      storedSha256: row.stored_sha256
    });
    if (!integrity.ok) {
      if (integrity.reason === "wrong-size") wrongSizeFiles.push(row.storage_relative_path);
      else if (integrity.reason === "wrong-hash") wrongHashFiles.push(row.storage_relative_path);
      else missingFiles.push(row.storage_relative_path);
    }
  }

  const tempRoot = path.join(uploadsRoot, ".tmp");
  const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
  const tempFiles = await walkFiles(tempRoot);
  const staleTemporaryFiles: string[] = [];
  for (const file of tempFiles) {
    const metadata = await stat(file).catch(() => undefined);
    if (metadata && metadata.mtimeMs < staleBefore) {
      staleTemporaryFiles.push(
        path.relative(uploadsRoot, file).split(path.sep).join("/")
      );
    }
  }

  return {
    missingFiles,
    wrongSizeFiles,
    wrongHashFiles,
    orphanFiles,
    staleTemporaryFiles
  };
}
