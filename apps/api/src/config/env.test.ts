import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig, provisionServiceDueEmailEncryptionKey, serviceDueEmailEncryptionKey } from "./env.js";

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

test("customer catalog version defaults to V7 and permits an explicit catalog pin", () => {
  const previous = process.env.INSPECTION_CUSTOMER_CATALOG_VERSION;
  try {
    delete process.env.INSPECTION_CUSTOMER_CATALOG_VERSION;
    assert.equal(loadConfig().customerCatalogVersion, 7);
    process.env.INSPECTION_CUSTOMER_CATALOG_VERSION = "6";
    assert.equal(loadConfig().customerCatalogVersion, 6);
  } finally {
    if (previous === undefined) delete process.env.INSPECTION_CUSTOMER_CATALOG_VERSION;
    else process.env.INSPECTION_CUSTOMER_CATALOG_VERSION = previous;
  }
});

test("report renderer defaults to html, accepts legacy, and rejects unknown configuration", () => {
  const previous = process.env.REPORT_RENDERER;
  try {
    delete process.env.REPORT_RENDERER; assert.equal(loadConfig().reportRenderer,"html");
    process.env.REPORT_RENDERER="legacy"; assert.equal(loadConfig().reportRenderer,"legacy");
    process.env.REPORT_RENDERER="typo"; assert.throws(loadConfig,/REPORT_RENDERER/);
  } finally { if (previous===undefined) delete process.env.REPORT_RENDERER; else process.env.REPORT_RENDERER=previous; }
});

test("first-run email key is generated once outside the repository and never replaced for existing settings", () => {
  const directory = mkdtempSync(join(tmpdir(), "reminder-key-test-"));
  const priorKey = process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
  const priorFile = process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE;
  const file = join(directory, "service-due-email.key");
  try {
    delete process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
    process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE = file;
    assert.equal(provisionServiceDueEmailEncryptionKey(true), false, "existing settings cannot silently get a new key");
    assert.throws(serviceDueEmailEncryptionKey);
    assert.equal(provisionServiceDueEmailEncryptionKey(false), true);
    const first = readFileSync(file, "utf8");
    assert.match(first, /^[A-Za-z0-9+/]{43}=$/);
    assert.equal(serviceDueEmailEncryptionKey().length, 32);
    assert.equal(provisionServiceDueEmailEncryptionKey(false), true);
    assert.equal(readFileSync(file, "utf8"), first, "restarts retain the original key");
    writeFileSync(file, "invalid");
    assert.equal(provisionServiceDueEmailEncryptionKey(false), false, "corrupt key is not replaced");
    assert.equal(readFileSync(file, "utf8"), "invalid");
  } finally {
    if (priorKey === undefined) delete process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY;
    else process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY = priorKey;
    if (priorFile === undefined) delete process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE;
    else process.env.SERVICE_DUE_EMAIL_ENCRYPTION_KEY_FILE = priorFile;
    rmSync(directory, { recursive: true, force: true });
  }
});
