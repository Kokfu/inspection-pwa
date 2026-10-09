import { pool } from "../db/pool.js";
import { runAdminCli } from "./adminCli.js";

// Resets the password of an EXISTING admin only. Deliberately does not run migrations: a reset must not alter schema.
try {
  process.exitCode = await runAdminCli("reset", pool);
} finally {
  await pool.end();
}
