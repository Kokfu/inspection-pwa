import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./env.js";

const hardDefault = "postgres://inspection_app:replace-with-a-real-secret-outside-git@postgres:5432/inspection";

test("test configuration prefers the integration database URL while production never consults it", () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL, SEED_INTEGRATION_DATABASE_URL: process.env.SEED_INTEGRATION_DATABASE_URL };
  try {
    const seedUrl = "postgresql://test-only@127.0.0.1:55432/integration";
    const runtimeUrl = "postgresql://runtime-only@runtime-host:5432/runtime";
    process.env.SEED_INTEGRATION_DATABASE_URL = seedUrl;
    process.env.DATABASE_URL = runtimeUrl;
    process.env.NODE_ENV = "test";
    assert.equal(loadConfig().databaseUrl, seedUrl);
    process.env.NODE_ENV = "production";
    assert.equal(loadConfig().databaseUrl, runtimeUrl);
    delete process.env.DATABASE_URL;
    assert.equal(loadConfig().databaseUrl, hardDefault);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
