import { pool } from "../db/pool.js";
import { runMigrations } from "../db/migrations.js";
import { runAdminCli } from "./adminCli.js";

// Creates a NEW admin only. To change an existing admin's password use reset-admin-password.
try {
  await runMigrations();
  process.exitCode = await runAdminCli("create", pool);
} finally {
  await pool.end();
}
