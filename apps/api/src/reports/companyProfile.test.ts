import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  clearCompanyLogo, companyLogoRuntimePath, CompanyLogoError, CompanyProfileError, companyProfileAssetPath,
  currentCompanyProfile, defaultCompanyProfile, loadCompanyProfile, parseCompanyProfileInput,
  resolveCompanyLogoFile, runtimeLogoFileName, saveCompanyLogo, saveCompanyProfile
} from "./companyProfile.js";

async function pngBuffer(width: number, height: number, format: "png" | "jpeg" = "png") {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } });
  return format === "png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

test("currentCompanyProfile falls back to the checked-in asset until a runtime file exists, then reflects it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "company-profile-unit-"));
  const runtimePath = path.join(directory, "nested", "company-profile.json");
  try {
    assert.deepEqual(currentCompanyProfile(runtimePath), loadCompanyProfile(companyProfileAssetPath), "no runtime file yet: identical to the asset");
    const saved = saveCompanyProfile({
      confirmed: true, legalName: "ACME", registrationNo: "1-A", address: "1 Test Way",
      tel: "011", fax: "", email: "", complaintHotline: "", verifiedBy: { name: "", title: "" },
      reportNumberFormat: "ACME/{YYYY}/{SEQ4}"
    }, runtimePath);
    assert.equal(saved.legalName, "ACME");
    assert.deepEqual(currentCompanyProfile(runtimePath), saved, "reads back exactly what was just saved");
    const onDisk = JSON.parse(await readFile(runtimePath, "utf8"));
    assert.equal(onDisk.legalName, "ACME");
    assert.equal(Object.hasOwn(onDisk, "source"), false, "the internal `source` discriminant is never written to disk");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("saveCompanyProfile carries over the existing logoFile rather than clearing it (logo upload is a separate write path)", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "company-profile-unit-"));
  const runtimePath = path.join(directory, "company-profile.json");
  try {
    const first = saveCompanyProfile({
      confirmed: false, legalName: "A", registrationNo: "", address: "addr", tel: "", fax: "", email: "", complaintHotline: "",
      verifiedBy: { name: "", title: "" }, reportNumberFormat: "A/{YYYY}/{SEQ4}"
    }, runtimePath);
    assert.equal(first.logoFile, loadCompanyProfile(companyProfileAssetPath).logoFile, "first save inherits the asset's logoFile (mfe-logo.png)");
    const second = saveCompanyProfile({
      confirmed: false, legalName: "B", registrationNo: "", address: "addr", tel: "", fax: "", email: "", complaintHotline: "",
      verifiedBy: { name: "", title: "" }, reportNumberFormat: "B/{YYYY}/{SEQ4}"
    }, runtimePath);
    assert.equal(second.logoFile, first.logoFile, "logoFile survives an unrelated field edit");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("saveCompanyProfile leaves no partial file behind if a concurrent write raced it (atomic rename)", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "company-profile-unit-"));
  const runtimePath = path.join(directory, "company-profile.json");
  try {
    await writeFile(runtimePath, "not json at all {{{", "utf8");
    saveCompanyProfile({
      confirmed: false, legalName: "C", registrationNo: "", address: "addr", tel: "", fax: "", email: "", complaintHotline: "",
      verifiedBy: { name: "", title: "" }, reportNumberFormat: "C/{YYYY}/{SEQ4}"
    }, runtimePath);
    const parsed = JSON.parse(await readFile(runtimePath, "utf8"));
    assert.equal(parsed.legalName, "C", "the rename atomically replaces whatever was there before, never a half-write");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("parseCompanyProfileInput rejects what the loader would otherwise silently blank out", () => {
  const valid = {
    confirmed: false, legalName: "A", registrationNo: "", address: "addr", tel: "", fax: "", email: "", complaintHotline: "",
    verifiedBy: { name: "", title: "" }, reportNumberFormat: "A/{YYYY}/{SEQ4}"
  };
  assert.throws(() => parseCompanyProfileInput(null), CompanyProfileError);
  assert.throws(() => parseCompanyProfileInput({ ...valid, logoFile: "sneaked-in.png" }), CompanyProfileError, "logoFile is not manager-writable");
  assert.throws(() => parseCompanyProfileInput({ ...valid, legalName: "" }), CompanyProfileError, "legalName is required");
  assert.throws(() => parseCompanyProfileInput({ ...valid, legalName: "x".repeat(501) }), CompanyProfileError, "legalName has a 500-char cap");
  assert.throws(() => parseCompanyProfileInput({ ...valid, reportNumberFormat: "no tokens" }), CompanyProfileError, "must keep {YYYY} and {SEQ4}");
  assert.throws(() => parseCompanyProfileInput({ ...valid, confirmed: "yes" }), CompanyProfileError, "confirmed must be boolean");
  assert.throws(() => parseCompanyProfileInput({ ...valid, verifiedBy: null }), CompanyProfileError, "verifiedBy must be an object");
  assert.doesNotThrow(() => parseCompanyProfileInput(valid));
  assert.deepEqual(defaultCompanyProfile().source, "default");
});

test("resolveCompanyLogoFile returns nothing when no runtime logo and no checked-in default exist (today's shipped state)", () => {
  assert.equal(resolveCompanyLogoFile(""), undefined);
  assert.equal(resolveCompanyLogoFile("mfe-logo.png"), undefined, "the checked-in asset is not actually shipped yet — see BACKLOG's 'waiting for the client'");
});

test("saveCompanyLogo validates, normalizes to PNG, resizes oversized images, and points logoFile at the runtime file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "company-profile-logo-"));
  const runtimePath = path.join(directory, "company-profile.json");
  try {
    await assert.rejects(() => saveCompanyLogo(Buffer.alloc(0), runtimePath), CompanyLogoError, "empty buffer rejected");
    await assert.rejects(() => saveCompanyLogo(Buffer.alloc(3 * 1024 * 1024), runtimePath), CompanyLogoError, "oversized buffer rejected before it is even decoded");
    await assert.rejects(() => saveCompanyLogo(Buffer.from("not an image"), runtimePath), CompanyLogoError, "garbage bytes rejected");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    await assert.rejects(() => saveCompanyLogo(svg, runtimePath), CompanyLogoError, "SVG upload is out of scope");

    const small = await pngBuffer(40, 40);
    const saved = await saveCompanyLogo(small, runtimePath);
    assert.equal(saved.logoFile, runtimeLogoFileName);
    assert.equal(resolveCompanyLogoFile(saved.logoFile, runtimePath)?.path, companyLogoRuntimePath(runtimePath));
    assert.equal(resolveCompanyLogoFile(saved.logoFile, runtimePath)?.mime, "image/png");

    const large = await pngBuffer(3000, 1500, "jpeg");
    const savedLarge = await saveCompanyLogo(large, runtimePath);
    const normalizedMetadata = await sharp(await readFile(companyLogoRuntimePath(runtimePath))).metadata();
    assert.equal(savedLarge.logoFile, runtimeLogoFileName);
    assert.equal(normalizedMetadata.format, "png", "always normalized to PNG regardless of the JPEG source");
    assert.ok(normalizedMetadata.width! <= 1200 && normalizedMetadata.height! <= 1200, "resized to fit within the max dimension");
    assert.equal(Math.round((normalizedMetadata.width! / normalizedMetadata.height!) * 100), Math.round((3000 / 1500) * 100), "aspect ratio preserved");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("clearCompanyLogo removes the runtime file and blanks logoFile back to the default fallback", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "company-profile-logo-"));
  const runtimePath = path.join(directory, "company-profile.json");
  try {
    await saveCompanyLogo(await pngBuffer(20, 20), runtimePath);
    assert.ok(existsSync(companyLogoRuntimePath(runtimePath)));
    const cleared = clearCompanyLogo(runtimePath);
    assert.equal(cleared.logoFile, "");
    assert.equal(existsSync(companyLogoRuntimePath(runtimePath)), false, "the uploaded file itself is deleted, not just the reference");
    assert.equal(resolveCompanyLogoFile(cleared.logoFile, runtimePath), undefined);
    assert.doesNotThrow(() => clearCompanyLogo(runtimePath), "clearing again with nothing to remove is a no-op, not an error");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
