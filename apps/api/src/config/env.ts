import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export type ApiConfig = {
  port: number;
  databaseUrl: string;
  sessionCookieName: string;
  sessionDurationHours: number;
  customerCatalogVersion: number;
  nodeEnv: string;
  uploadsPath: string;
  reportChromiumPath: string;
  reportRenderer: "html" | "legacy";
  companyProfilePath: string;
};

/** Optional for inspection operation; mandatory before encrypted reminder settings can be saved or sent. */
export function serviceDueEmailEncryptionKey(): Buffer {
  let encoded = process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
  if (!encoded && process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE) {
    try {
      const path = process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE;
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size < 1 || stat.size > 128) throw new Error("INVALID_KEY_FILE");
      encoded = readFileSync(path, "utf8");
    } catch { throw new Error("SERVICE_DUE_EMAIL_ENCRYPTION_KEY_UNAVAILABLE"); }
  }
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("SERVICE_DUE_EMAIL_ENCRYPTION_KEY_UNAVAILABLE");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("SERVICE_DUE_EMAIL_ENCRYPTION_KEY_UNAVAILABLE");
  return key;
}

/** Called by the API after migrations. Never replace the key for an existing sender. */
export function provisionServiceDueEmailEncryptionKey(hasStoredPassword: boolean): boolean {
  try { serviceDueEmailEncryptionKey(); return true; }
  catch { /* A fresh installation may need its first key. */ }
  const path = process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE;
  if (!path || process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY || hasStoredPassword) return false;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const handle = openSync(path, "wx", 0o600);
    try { writeSync(handle, randomBytes(32).toString("base64")); fsyncSync(handle); }
    finally { closeSync(handle); }
    serviceDueEmailEncryptionKey();
    return true;
  } catch { return false; }
}

export function loadConfig(): ApiConfig {
  const nodeEnv = process.env.NODE_ENV ?? "production";
  const reportRenderer = process.env.REPORT_RENDERER ?? "html";
  if (reportRenderer !== "html" && reportRenderer !== "legacy") throw new Error("REPORT_RENDERER must be html or legacy");
  return {
    port: Number(process.env.API_PORT ?? 3000),
    databaseUrl:
      (nodeEnv === "test" ? process.env.SEED_INTEGRATION_DATABASE_URL : undefined) ??
      process.env.DATABASE_URL ??
      "postgres://inspection_app:replace-with-a-real-secret-outside-git@postgres:5432/inspection",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "inspection_session",
    sessionDurationHours: Number(process.env.SESSION_DURATION_HOURS ?? 12),
    customerCatalogVersion: Number(process.env.INSPECTION_CUSTOMER_CATALOG_VERSION ?? 7),
    nodeEnv,
    uploadsPath: process.env.UPLOADS_PATH ?? "/srv/uploads",
    reportChromiumPath: process.env.REPORT_CHROMIUM_PATH ?? "/usr/bin/chromium",
    reportRenderer,
    // Lives inside the same `/srv/operational` bind mount as the acceptance manifests
    // (docker-compose.yml's `INSPECTION_OPERATIONAL_PATH`), so a Manager's saved
    // company profile survives container restarts/rebuilds without a new volume.
    companyProfilePath: process.env.COMPANY_PROFILE_PATH ?? "/srv/operational/company-profile.json"
  };
}
