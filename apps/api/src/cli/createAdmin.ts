import { hashPassword } from "../auth/passwords.js";
import { pool } from "../db/pool.js";
import { runMigrations } from "../db/migrations.js";

const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error("ADMIN_USERNAME and ADMIN_PASSWORD are required.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

await runMigrations();

const passwordHash = await hashPassword(password);

await pool.query(
  `
    INSERT INTO users (username, password_hash, role, is_active, updated_at)
    VALUES ($1, $2, 'admin', true, now())
    ON CONFLICT (username)
    DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = 'admin',
      is_active = true,
      updated_at = now();
  `,
  [username, passwordHash]
);

console.log(`Admin user '${username}' has been created or updated.`);
await pool.end();
