export type ApiConfig = {
  port: number;
  databaseUrl: string;
  sessionCookieName: string;
  sessionDurationHours: number;
  customerCatalogVersion: number;
  nodeEnv: string;
  uploadsPath: string;
  reportChromiumPath: string;
};

export function loadConfig(): ApiConfig {
  const nodeEnv = process.env.NODE_ENV ?? "production";
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
    reportChromiumPath: process.env.REPORT_CHROMIUM_PATH ?? "/usr/bin/chromium"
  };
}
