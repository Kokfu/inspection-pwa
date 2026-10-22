import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { runMigrations } from "./migrations.js";

const databaseUrl = process.env.SEED_INTEGRATION_DATABASE_URL;
const operationalCodes = ["MAK-SITI-PRODUCTS", "HOKUDEN-MALAYSIA"];

test("production startup seeds no customers a Manager can see; the default seed keeps the operational fixtures", {
  skip: !databaseUrl
}, async () => {
  assert.equal(
    new URL(databaseUrl!).pathname,
    "/phase6_seed_integration",
    "seed integration test only permits its dedicated database"
  );
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    // The exact call server.ts and cli/createAdmin.ts make on a client's empty database.
    await runMigrations(pool, { operationalCustomers: false });
    await runMigrations(pool, { operationalCustomers: false });

    const visible = await pool.query<{ customer_code: string }>(
      "SELECT customer_code FROM customers WHERE is_demo = false ORDER BY customer_code"
    );
    assert.deepEqual(visible.rows, [], "a fresh production database has no non-demo customers");
    const named = await pool.query("SELECT 1 FROM customers WHERE customer_code = ANY($1)", [operationalCodes]);
    assert.equal(named.rowCount, 0, "Mak Siti and Hokuden are not published");
    const orphans = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM customer_sites WHERE customer_id = ANY($1::uuid[])",
      [["00000000-0000-4000-8000-000000000830", "00000000-0000-4000-8000-000000000840"]]
    );
    assert.equal(orphans.rows[0]?.count, "0", "no sites or configuration are left behind for them");

    // Everything the app still needs from the seed must be present.
    const templates = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM master_service_report_templates");
    assert.ok(Number(templates.rows[0]?.count) > 0, "report templates are still seeded");
    const demo = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM customers WHERE is_demo = true");
    assert.ok(Number(demo.rows[0]?.count) > 0, "hidden demo customers are still seeded");
    const users = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users");
    assert.equal(users.rows[0]?.count, "0", "no accounts are seeded");

    // The default (tests and development databases) is unchanged, and a later default
    // start never removes anything that exists.
    await runMigrations(pool);
    const restored = await pool.query<{ customer_code: string }>(
      "SELECT customer_code FROM customers WHERE customer_code = ANY($1) ORDER BY customer_code", [operationalCodes]
    );
    assert.deepEqual(restored.rows.map((row) => row.customer_code), operationalCodes.slice().sort());
    await runMigrations(pool, { operationalCustomers: false });
    const kept = await pool.query("SELECT 1 FROM customers WHERE customer_code = ANY($1)", [operationalCodes]);
    assert.equal(kept.rowCount, 2, "a production restart does not delete existing customers");
  } finally {
    await pool.end();
  }
});
