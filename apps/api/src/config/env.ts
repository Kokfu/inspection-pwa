export type ApiConfig = {
  port: number;
  databaseUrl: string;
  authRequired: boolean;
  allowPhase2UnauthenticatedSync: boolean;
};

export function loadConfig(): ApiConfig {
  return {
    port: Number(process.env.API_PORT ?? 3000),
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgres://inspection_app:replace-with-a-real-secret-outside-git@postgres:5432/inspection",
    authRequired: process.env.AUTH_REQUIRED !== "false",
    allowPhase2UnauthenticatedSync:
      process.env.ALLOW_PHASE2_UNAUTHENTICATED_SYNC === "true"
  };
}
