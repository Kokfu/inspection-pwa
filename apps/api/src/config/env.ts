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
