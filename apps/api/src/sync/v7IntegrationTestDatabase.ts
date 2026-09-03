import assert from "node:assert/strict";
import { loadConfig } from "../config/env.js";

export function v7IntegrationDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
  if (!databaseUrl) return undefined;
  assert.equal(loadConfig().databaseUrl, databaseUrl, "V7 integration setup and API code must use the same database URL");
  assert.equal(new URL(databaseUrl).port, "55432", "V7 integration tests require the dedicated isolated PostgreSQL port");
  return databaseUrl;
}
