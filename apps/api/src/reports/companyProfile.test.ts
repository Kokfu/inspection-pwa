import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CompanyProfileError, companyProfileAssetPath, currentCompanyProfile, defaultCompanyProfile, loadCompanyProfile, parseCompanyProfileInput, saveCompanyProfile } from "./companyProfile.js";

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

test("saveCompanyProfile carries over the existing logoFile rather than clearing it (no upload feature yet)", async () => {
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
