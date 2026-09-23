import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { runMigrations } from "../db/migrations.js";

const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME;

if (!username || !password) {
  console.error("ADMIN_USERNAME and ADMIN_PASSWORD are required.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}
if (displayName !== undefined && (!displayName.trim() || displayName.length > 160)) {
  console.error("ADMIN_DISPLAY_NAME must contain 1–160 characters when provided.");
  process.exit(1);
}

await runMigrations();

const passwordHash = await hashPassword(password);

await pool.query(
  `
    INSERT INTO users (username, password_hash, role, is_active, updated_at, display_name)
    VALUES ($1, $2, 'admin', true, now(), $3)
    ON CONFLICT (username)
    DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = 'admin',
      is_active = true,
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      updated_at = now();
  `,
  [username, passwordHash, displayName?.trim() ?? null]
);

console.log(`Admin user '${username}' has been created or updated.`);
await pool.end();
