import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createManagerCompanyProfileRouter } from "./managerCompanyProfile.js";

type Get = (path: string, role?: string) => Promise<Response>;
type Put = (path: string, body: unknown, role?: string) => Promise<Response>;
type PutImage = (path: string, bytes: Buffer, contentType: string, role?: string) => Promise<Response>;

async function withServer(run: (get: Get, put: Put, putImage: PutImage, queries: Array<{ sql: string; values?: unknown[] }>) => Promise<void>) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const database = { async query(sql: string, values?: unknown[]) { queries.push({ sql, values }); return { rows: [] }; } };
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    const role = request.headers["x-role"];
    if (role === "admin" || role === "supervisor" || role === "inspector") request.currentUser = { id: 1, username: String(role), role };
    next();
  });
  app.use(createManagerCompanyProfileRouter(database as never));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number };
  const get: Get = (p, role) => fetch(`http://127.0.0.1:${address.port}${p}`, { headers: role ? { "x-role": role } : undefined });
  const put: Put = (p, body, role) => fetch(`http://127.0.0.1:${address.port}${p}`, {
    method: "PUT", headers: { "Content-Type": "application/json", ...(role ? { "x-role": role } : {}) }, body: JSON.stringify(body)
  });
  const putImage: PutImage = (p, bytes, contentType, role) => fetch(`http://127.0.0.1:${address.port}${p}`, {
    method: "PUT", headers: { "Content-Type": contentType, ...(role ? { "x-role": role } : {}) }, body: new Uint8Array(bytes)
  });
  try { await run(get, put, putImage, queries); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function pngBuffer(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer();
}

test("company profile GET/PUT authorize like every other manager settings route (admin only)", async () => {
  const runtimeDirectory = await mkdtemp(path.join(tmpdir(), "company-profile-route-"));
  const runtimePath = path.join(runtimeDirectory, "company-profile.json");
  const previous = process.env.COMPANY_PROFILE_PATH;
  process.env.COMPANY_PROFILE_PATH = runtimePath;
  try {
    await withServer(async (get, put) => {
      assert.equal((await get("/manager/company-profile")).status, 401, "no session is unauthenticated");
      assert.equal((await get("/manager/company-profile", "inspector")).status, 403, "a technician has no access");
      assert.equal((await get("/manager/company-profile", "supervisor")).status, 403, "a supervisor has no access (admin-only, like Service Catalog)");
      assert.equal((await put("/manager/company-profile", {}, "supervisor")).status, 403);

      const before = await (await get("/manager/company-profile", "admin")).json();
      assert.equal(before.companyProfile.source, undefined, "the wire shape never leaks the internal source discriminant");
      assert.equal(Object.hasOwn(before.companyProfile, "source"), false, "source is stripped, not just undefined");
      assert.equal(before.companyProfile.legalName, "MFE SERVICES SDN. BHD.", "falls back to the checked-in asset until a Manager ever saves");

      // `logoFile` is read-only (no upload feature yet): the editable draft never includes it,
      // mirroring what the Manager web form actually sends (`ManagerCompanyProfile.tsx`).
      const { logoFile, ...editable } = before.companyProfile;

      const withUnknownField = await put("/manager/company-profile", { companyProfile: { ...editable, logoFile } }, "admin");
      assert.equal(withUnknownField.status, 400, "logoFile is not a manager-writable field");

      const rejected = await put("/manager/company-profile", { companyProfile: { ...editable, reportNumberFormat: "no-tokens-here" } }, "admin");
      assert.equal(rejected.status, 400);
      const rejectedBody = await rejected.json();
      assert.equal(rejectedBody.error, "INVALID_COMPANY_PROFILE");

      const edited = { ...editable, legalName: "ACME FIRE SERVICES SDN. BHD.", confirmed: true };
      const saved = await put("/manager/company-profile", { companyProfile: edited }, "admin");
      assert.equal(saved.status, 200);
      const savedBody = await saved.json();
      assert.equal(savedBody.companyProfile.legalName, "ACME FIRE SERVICES SDN. BHD.");
      assert.equal(savedBody.companyProfile.confirmed, true);
      assert.equal(savedBody.companyProfile.logoFile, before.companyProfile.logoFile, "logoFile is carried over unchanged (no upload feature yet)");

      const reread = await (await get("/manager/company-profile", "admin")).json();
      assert.equal(reread.companyProfile.legalName, "ACME FIRE SERVICES SDN. BHD.", "the edit persists across requests, not just the response that saved it");

      const onDisk = JSON.parse(await readFile(runtimePath, "utf8"));
      assert.equal(onDisk.legalName, "ACME FIRE SERVICES SDN. BHD.");
    });
  } finally {
    if (previous === undefined) delete process.env.COMPANY_PROFILE_PATH; else process.env.COMPANY_PROFILE_PATH = previous;
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
});

test("company logo GET/PUT/reset authorize like the rest of the settings route and round-trip a real upload", async () => {
  const runtimeDirectory = await mkdtemp(path.join(tmpdir(), "company-profile-logo-route-"));
  const runtimePath = path.join(runtimeDirectory, "company-profile.json");
  const previous = process.env.COMPANY_PROFILE_PATH;
  process.env.COMPANY_PROFILE_PATH = runtimePath;
  try {
    await withServer(async (get, put, putImage) => {
      assert.equal((await get("/manager/company-profile/logo")).status, 401);
      assert.equal((await get("/manager/company-profile/logo", "supervisor")).status, 403);
      assert.equal((await putImage("/manager/company-profile/logo", Buffer.from("x"), "image/png", "supervisor")).status, 403);

      const beforeAny = await get("/manager/company-profile/logo", "admin");
      assert.equal(beforeAny.status, 204, "nothing uploaded yet, and no checked-in default ships today: 204, not a 404 console error (I-73)");
      assert.equal((await beforeAny.text()), "");

      const rejectedFormat = await putImage("/manager/company-profile/logo", Buffer.from("not an image"), "image/png", "admin");
      assert.equal(rejectedFormat.status, 400);
      assert.equal((await rejectedFormat.json()).error, "LOGO_FORMAT_INVALID");

      const wrongContentType = await putImage("/manager/company-profile/logo", await pngBuffer(20, 20), "text/plain", "admin");
      assert.equal(wrongContentType.status, 400, "express.raw only parses image/png or image/jpeg — anything else leaves an empty body");

      const png = await pngBuffer(50, 30);
      const uploaded = await putImage("/manager/company-profile/logo", png, "image/png", "admin");
      assert.equal(uploaded.status, 200);
      const uploadedBody = await uploaded.json();
      assert.equal(uploadedBody.companyProfile.logoFile, "company-logo.png");

      const preview = await get("/manager/company-profile/logo", "admin");
      assert.equal(preview.status, 200);
      assert.equal(preview.headers.get("content-type"), "image/png");
      const previewMetadata = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
      assert.equal(previewMetadata.width, 50);
      assert.equal(previewMetadata.height, 30);

      // Persists on disk, independent of the response that saved it.
      const reread = await get("/manager/company-profile/logo", "admin");
      assert.equal(reread.status, 200);

      const profileAfterUpload = await (await get("/manager/company-profile", "admin")).json();
      assert.equal(profileAfterUpload.companyProfile.logoFile, "company-logo.png");

      assert.equal((await put("/manager/company-profile/logo/reset", {}, "supervisor")).status, 403);
      const reset = await put("/manager/company-profile/logo/reset", {}, "admin");
      assert.equal(reset.status, 200);
      assert.equal((await reset.json()).companyProfile.logoFile, "");
      assert.equal((await get("/manager/company-profile/logo", "admin")).status, 204, "reset actually removed the file, not just the reference");
    });
  } finally {
    if (previous === undefined) delete process.env.COMPANY_PROFILE_PATH; else process.env.COMPANY_PROFILE_PATH = previous;
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
});
