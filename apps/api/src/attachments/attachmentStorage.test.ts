import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isUnsupportedWindowsDirectoryFsyncError, moveNormalizedAttachment, type MoveAttachmentIo, verifyAttachmentFile } from "./attachmentStorage.js";

const ioError = (code: string, syscall?: string) => Object.assign(new Error(code), { code, ...(syscall ? { syscall } : {}) });
function injectedMoveIo(options: { directoryOpenError?: Error; directorySyncError?: Error; directoryCloseError?: Error } = {}) {
  const calls: string[] = [];
  const fileHandle = { sync: async () => { calls.push("file.sync"); }, close: async () => { calls.push("file.close"); } };
  const directoryHandle = { sync: async () => { calls.push("directory.sync"); if (options.directorySyncError) throw options.directorySyncError; }, close: async () => { calls.push("directory.close"); if (options.directoryCloseError) throw options.directoryCloseError; } };
  const io: MoveAttachmentIo = {
    mkdir: async () => { calls.push("mkdir"); },
    open: async (_filePath, flags) => { if (flags === "r+") { calls.push("file.open"); return fileHandle; } calls.push("directory.open"); if (options.directoryOpenError) throw options.directoryOpenError; return directoryHandle; },
    rename: async () => { calls.push("rename"); }
  };
  return { io, calls };
}

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>) {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...original, value: platform });
  try { return await run(); } finally { Object.defineProperty(process, "platform", original); }
}

test("directory open and directory fsync failures remain fatal except exact Windows EPERM/fsync", async () => {
  for (const code of ["EACCES", "EPERM", "ENOENT", "EIO"]) {
    const failure = ioError(code, code === "EPERM" ? "fsync" : undefined); const { io, calls } = injectedMoveIo({ directoryOpenError: failure });
    await assert.rejects(() => moveNormalizedAttachment("source.tmp", "target/photo.jpg", io), (error: unknown) => error === failure, `directory open ${code} propagates`);
    assert.deepEqual(calls, ["mkdir", "file.open", "file.sync", "file.close", "rename", "directory.open"], `directory open ${code} is never mistaken for fsync compatibility`);
  }
  const supported = injectedMoveIo({ directorySyncError: ioError("EPERM", "fsync") });
  await moveNormalizedAttachment("source.tmp", "target/photo.jpg", supported.io); assert.deepEqual(supported.calls, ["mkdir", "file.open", "file.sync", "file.close", "rename", "directory.open", "directory.sync", "directory.close"], "only exact Windows directory fsync EPERM is tolerated and still closes the handle");
  for (const failure of [ioError("EPERM", "open"), ioError("EIO", "fsync"), ioError("EINVAL", "fsync"), ioError("ENOTSUP", "fsync")]) {
    const { io, calls } = injectedMoveIo({ directorySyncError: failure });
    await assert.rejects(() => moveNormalizedAttachment("source.tmp", "target/photo.jpg", io), (error: unknown) => error === failure, `directory sync ${failure.code}/${failure.syscall} propagates`);
    assert.deepEqual(calls, ["mkdir", "file.open", "file.sync", "file.close", "rename", "directory.open", "directory.sync", "directory.close"], `directory sync ${failure.code}/${failure.syscall} closes its successfully opened handle`);
  }
  const nonWindowsFailure = ioError("EPERM", "fsync"); const nonWindows = injectedMoveIo({ directorySyncError: nonWindowsFailure });
  await withPlatform("linux", async () => assert.rejects(() => moveNormalizedAttachment("source.tmp", "target/photo.jpg", nonWindows.io), (error: unknown) => error === nonWindowsFailure, "non-Windows EPERM/fsync propagates"));
  assert.equal(isUnsupportedWindowsDirectoryFsyncError(ioError("EPERM", "fsync"), "linux"), false, "the exception predicate requires win32");
  const syncFailure = ioError("EIO", "fsync"); const closeFailure = ioError("EACCES"); const combined = injectedMoveIo({ directorySyncError: syncFailure, directoryCloseError: closeFailure });
  await assert.rejects(() => moveNormalizedAttachment("source.tmp", "target/photo.jpg", combined.io), (error: unknown) => error === syncFailure, "directory sync failure remains primary when close also fails"); assert.ok(combined.calls.includes("directory.close"), "directory close is still attempted after sync failure");
});

test("exact Windows directory fsync EPERM continues to integrity verification", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "phase8f-attachment-storage-")); process.env.UPLOADS_PATH = root;
  const source = path.join(root, "normalized.tmp"); const finalPath = path.join(root, "inspections", "x", "photo.jpg"); const bytes = Buffer.from("retained evidence bytes"); const directory = path.dirname(finalPath);
  const io: MoveAttachmentIo = {
    mkdir: async (directoryPath, options) => mkdir(directoryPath, options),
    rename: async (sourcePath, destinationPath) => rename(sourcePath, destinationPath),
    open: async (filePath, flags) => { const handle = await open(filePath, flags); return filePath === directory && flags === "r" ? { sync: async () => { throw ioError("EPERM", "fsync"); }, close: () => handle.close() } : handle; }
  };
  try {
    await writeFile(source, bytes); await moveNormalizedAttachment(source, finalPath, io);
    const expectedSha256 = createHash("sha256").update(bytes).digest("hex"); assert.deepEqual(await verifyAttachmentFile({ storageRelativePath: "inspections/x/photo.jpg", storedSizeBytes: bytes.length, storedSha256: expectedSha256 }), { ok: true }, "tolerated directory fsync EPERM does not bypass authoritative hash verification");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("normal attachment publication still renames and hash verification fails closed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "phase8f-attachment-storage-")); process.env.UPLOADS_PATH = root;
  const source = path.join(root, "normalized.tmp"); const finalPath = path.join(root, "inspections", "x", "photo.jpg"); const bytes = Buffer.from("retained evidence bytes");
  try {
    await writeFile(source, bytes); await moveNormalizedAttachment(source, finalPath); assert.deepEqual(await readFile(finalPath), bytes, "normal filesystem sync path still renames the retained file");
    const expectedSha256 = createHash("sha256").update(bytes).digest("hex"); assert.deepEqual(await verifyAttachmentFile({ storageRelativePath: "inspections/x/photo.jpg", storedSizeBytes: bytes.length, storedSha256: expectedSha256 }), { ok: true }, "later hash verification accepts the retained file");
    await writeFile(finalPath, Buffer.from("tampered evidence bytes")); assert.deepEqual(await verifyAttachmentFile({ storageRelativePath: "inspections/x/photo.jpg", storedSizeBytes: bytes.length, storedSha256: expectedSha256 }), { ok: false, reason: "wrong-hash" }, "later hash verification rejects altered retained content");
  } finally { await rm(root, { recursive: true, force: true }); }
});
