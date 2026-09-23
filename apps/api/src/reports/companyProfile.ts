import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

export function formatReportNumber(year: number, sequence: number, format = companyProfile.reportNumberFormat || defaultReportNumberFormat) {
  const safeFormat = format.includes("{YYYY}") && format.includes("{SEQ4}") ? format : defaultReportNumberFormat;
  return safeFormat.replaceAll("{YYYY}", String(year).padStart(4, "0")).replaceAll("{SEQ4}", String(sequence).padStart(4, "0"));
}
