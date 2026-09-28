import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { loadConfig } from "../config/env.js";

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);

export type CompanyProfile = {
  confirmed: boolean;
  legalName: string; registrationNo: string; address: string;
  tel: string; fax: string; email: string; complaintHotline: string;
  logoFile: string;
  verifiedBy: { name: string; title: string };
  reportNumberFormat: string;
  source: "file" | "default";
};

export const defaultReportNumberFormat = "MFE/SR/{YYYY}/{SEQ4}";
export const companyProfileAssetPath = fileURLToPath(new URL("./assets/company-profile.json", import.meta.url));

export function defaultCompanyProfile(): CompanyProfile {
  return { confirmed: false, legalName: "", registrationNo: "", address: "", tel: "", fax: "", email: "", complaintHotline: "", logoFile: "", verifiedBy: { name: "", title: "" }, reportNumberFormat: "", source: "default" };
}

export function loadCompanyProfile(file: string = companyProfileAssetPath): CompanyProfile {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")); } catch { return defaultCompanyProfile(); }
  if (!isRecord(raw)) return defaultCompanyProfile();
  const str = (value: unknown, maximum = 500) => typeof value === "string" && value.length <= maximum ? value.trim() : "";
  const verifiedBy = isRecord(raw.verifiedBy) ? raw.verifiedBy : {};
  const logo = str(raw.logoFile, 100);
  return {
    confirmed: raw.confirmed === true,
    legalName: str(raw.legalName), registrationNo: str(raw.registrationNo, 100), address: str(raw.address),
    tel: str(raw.tel, 100), fax: str(raw.fax, 100), email: str(raw.email, 200), complaintHotline: str(raw.complaintHotline, 100),
    logoFile: /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(logo) ? logo : "",
    verifiedBy: { name: str(verifiedBy.name, 200), title: str(verifiedBy.title, 200) },
    reportNumberFormat: str(raw.reportNumberFormat, 100),
    source: "file"
  };
}

export const companyProfile = loadCompanyProfile();

/** Where a Manager's saved edits persist (`apps/api/src/config/env.ts#companyProfilePath`). */
export const companyProfileRuntimePath = () => loadConfig().companyProfilePath;

/**
 * Live profile used by report rendering. Until a Manager saves an edit through the
 * API, the runtime path has never been written, so this falls back to the checked-in
 * asset — the exact `companyProfile` singleton's data — keeping today's PDFs
 * unchanged. Re-reads the file on every call (a few hundred bytes) so a save is
 * reflected immediately, with no server restart and no stale in-memory cache.
 */
export function currentCompanyProfile(path: string = companyProfileRuntimePath()): CompanyProfile {
  return loadCompanyProfile(existsSync(path) ? path : companyProfileAssetPath);
}

export class CompanyProfileError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

const requiredText = (value: unknown, field: string, maximum: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new CompanyProfileError("INVALID_COMPANY_PROFILE", `${field} must contain 1–${maximum} characters.`);
  }
  return value.trim();
};
const optionalText = (value: unknown, field: string, maximum: number): string => {
  if (typeof value !== "string" || value.length > maximum) {
    throw new CompanyProfileError("INVALID_COMPANY_PROFILE", `${field} must contain at most ${maximum} characters.`);
  }
  return value.trim();
};

/**
 * Validates a Manager's edit of the writable text fields — everything the PDF letterhead
 * shows except `logoFile` (that has its own write path, `saveCompanyLogo`/`clearCompanyLogo`,
 * since it is an image upload rather than a form field) and `source` (server-derived).
 * Mirrors `loadCompanyProfile`'s per-field length caps so a value that would round-trip
 * cleanly through the loader is exactly what is accepted here.
 */
export function parseCompanyProfileInput(input: unknown): Omit<CompanyProfile, "logoFile" | "source"> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CompanyProfileError("INVALID_COMPANY_PROFILE", "Company profile payload is invalid.");
  }
  const body = input as Record<string, unknown>;
  const allowedKeys = new Set(["confirmed", "legalName", "registrationNo", "address", "tel", "fax", "email", "complaintHotline", "verifiedBy", "reportNumberFormat"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new CompanyProfileError("INVALID_COMPANY_PROFILE", "Company profile payload contains unknown fields.");
  }
  if (typeof body.confirmed !== "boolean") throw new CompanyProfileError("INVALID_COMPANY_PROFILE", "confirmed must be a boolean.");
  const verifiedBy = body.verifiedBy;
  if (typeof verifiedBy !== "object" || verifiedBy === null || Array.isArray(verifiedBy)) {
    throw new CompanyProfileError("INVALID_COMPANY_PROFILE", "verifiedBy must be an object.");
  }
  const reportNumberFormat = requiredText(body.reportNumberFormat, "reportNumberFormat", 100);
  if (!reportNumberFormat.includes("{YYYY}") || !reportNumberFormat.includes("{SEQ4}")) {
    throw new CompanyProfileError("INVALID_COMPANY_PROFILE", "reportNumberFormat must include {YYYY} and {SEQ4}.");
  }
  return {
    confirmed: body.confirmed,
    legalName: requiredText(body.legalName, "legalName", 500),
    registrationNo: optionalText(body.registrationNo, "registrationNo", 100),
    address: requiredText(body.address, "address", 500),
    tel: optionalText(body.tel, "tel", 100),
    fax: optionalText(body.fax, "fax", 100),
    email: optionalText(body.email, "email", 200),
    complaintHotline: optionalText(body.complaintHotline, "complaintHotline", 100),
    verifiedBy: {
      name: optionalText((verifiedBy as Record<string, unknown>).name, "verifiedBy.name", 200),
      title: optionalText((verifiedBy as Record<string, unknown>).title, "verifiedBy.title", 200)
    },
    reportNumberFormat
  };
}

/** Atomic write (temp file + rename) shared by every profile writer, so a mid-write
 *  crash/power loss on the client PC never leaves a half-written, unparsable file behind. */
function writeAtomic(path: string, contents: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, contents);
  renameSync(temporaryPath, path);
}

function writeProfileFile(profile: CompanyProfile, path: string) {
  writeAtomic(path, `${JSON.stringify({ ...profile, source: undefined }, null, 2)}\n`);
}

/**
 * Persists a Manager's edit. `logoFile` is carried over from whatever is currently
 * effective — this never touches the logo image itself; see `saveCompanyLogo`/
 * `clearCompanyLogo` for that.
 */
export function saveCompanyProfile(input: unknown, path: string = companyProfileRuntimePath()): CompanyProfile {
  const patch = parseCompanyProfileInput(input);
  const logoFile = currentCompanyProfile(path).logoFile;
  writeProfileFile({ ...patch, logoFile, source: "file" }, path);
  return currentCompanyProfile(path);
}

export class CompanyLogoError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

export const companyLogoMaxBytes = 2 * 1024 * 1024;
export const companyLogoMaxDimension = 1200;
const companyLogoInputPixelLimit = 20_000_000;
/** Sentinel `logoFile` value meaning "read the runtime logo file", distinct from the
 *  checked-in defaults' own filenames (`mfe-logo.png` / `mfe-logo.svg`). */
export const runtimeLogoFileName = "company-logo.png";

export function companyLogoRuntimePath(path: string = companyProfileRuntimePath()): string {
  return join(dirname(path), runtimeLogoFileName);
}

const assetLogoCandidates: ReadonlyArray<{ file: string; mime: string; path: string }> = [
  { file: "mfe-logo.png", mime: "image/png", path: fileURLToPath(new URL("./assets/mfe-logo.png", import.meta.url)) },
  { file: "mfe-logo.svg", mime: "image/svg+xml", path: fileURLToPath(new URL("./assets/mfe-logo.svg", import.meta.url)) }
];

/**
 * The single source of truth for "what image is the current company logo" — shared by
 * the PDF renderer (`renderReportHtml.ts`) and the Manager preview endpoint
 * (`GET /manager/company-profile/logo`), so the two can never disagree. Prefers the
 * runtime upload when `logoFile` names it and it exists; otherwise falls back to
 * whichever checked-in default asset actually exists (today: neither ships, so this
 * returns `undefined` and the PDF shows its "MFE" text placeholder — unchanged until a
 * Manager uploads one).
 */
export function resolveCompanyLogoFile(logoFile: string, path: string = companyProfileRuntimePath()): { path: string; mime: string } | undefined {
  const runtimePath = companyLogoRuntimePath(path);
  if (logoFile === runtimeLogoFileName && existsSync(runtimePath)) return { path: runtimePath, mime: "image/png" };
  const asset = assetLogoCandidates.find((candidate) => candidate.file === logoFile && existsSync(candidate.path))
    ?? assetLogoCandidates.find((candidate) => existsSync(candidate.path));
  return asset ? { path: asset.path, mime: asset.mime } : undefined;
}

/**
 * Validates and stores a Manager-uploaded logo: PNG/JPEG only, decompression-bomb
 * guarded (`limitInputPixels`, mirroring `attachmentStorage.ts`'s normalization), then
 * normalized to a single canonical PNG capped at `companyLogoMaxDimension` on its
 * longest edge (a letterhead logo renders at 62pt square — this is generous headroom,
 * not a thumbnail). SVG upload is not supported (kept out of scope; the checked-in
 * default may still be an SVG file if one is ever added).
 */
export async function saveCompanyLogo(source: Buffer, path: string = companyProfileRuntimePath()): Promise<CompanyProfile> {
  if (source.length === 0 || source.length > companyLogoMaxBytes) {
    throw new CompanyLogoError("LOGO_SIZE_INVALID", `Logo image must be at most ${Math.floor(companyLogoMaxBytes / (1024 * 1024))}MB.`);
  }
  const image = sharp(source, { failOn: "warning", limitInputPixels: companyLogoInputPixelLimit, pages: 1 });
  const metadata = await image.metadata().catch(() => undefined);
  if (!metadata || (metadata.format !== "png" && metadata.format !== "jpeg") || !metadata.width || !metadata.height) {
    throw new CompanyLogoError("LOGO_FORMAT_INVALID", "Logo must be a valid PNG or JPEG image.");
  }
  const normalized = await image
    .resize({ width: companyLogoMaxDimension, height: companyLogoMaxDimension, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  writeAtomic(companyLogoRuntimePath(path), normalized);
  writeProfileFile({ ...currentCompanyProfile(path), logoFile: runtimeLogoFileName, source: "file" }, path);
  return currentCompanyProfile(path);
}

/** Removes an uploaded logo and reverts to whichever checked-in default exists (today: none). */
export function clearCompanyLogo(path: string = companyProfileRuntimePath()): CompanyProfile {
  const logoPath = companyLogoRuntimePath(path);
  if (existsSync(logoPath)) unlinkSync(logoPath);
  writeProfileFile({ ...currentCompanyProfile(path), logoFile: "", source: "file" }, path);
  return currentCompanyProfile(path);
}

export function formatReportNumber(year: number, sequence: number, format = currentCompanyProfile().reportNumberFormat || defaultReportNumberFormat) {
  const safeFormat = format.includes("{YYYY}") && format.includes("{SEQ4}") ? format : defaultReportNumberFormat;
  return safeFormat.replaceAll("{YYYY}", String(year).padStart(4, "0")).replaceAll("{SEQ4}", String(sequence).padStart(4, "0"));
}
