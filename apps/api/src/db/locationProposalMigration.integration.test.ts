import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pool } from "./pool.js";
import { v7IntegrationDatabaseUrl } from "../sync/v7IntegrationTestDatabase.js";

test("056 applies over 048 cold and populated; real constraint names, rows and append-only triggers survive", { skip: !v7IntegrationDatabaseUrl() }, async () => {
  const client = await pool.connect();
  try {
    for (const populated of [false, true]) {
      await client.query("BEGIN");
      // Isolated transaction-local schema: rollback removes only this test fixture.
      await client.query('CREATE SCHEMA w0_migration; SET LOCAL search_path TO w0_migration');
      await client.query(`CREATE TABLE customers(id uuid PRIMARY KEY);
        CREATE TABLE users(id bigint PRIMARY KEY);
        CREATE TABLE customer_configuration_revisions(id uuid PRIMARY KEY);`);
      await client.query(await readFile(new URL("../../migrations/048_customer_location_proposals.sql", import.meta.url), "utf8"));
      const checks = (await client.query(`SELECT conname FROM pg_constraint WHERE conrelid='customer_location_proposal_decisions'::regclass AND contype='c'`)).rows.map((r) => r.conname);
      assert.ok(checks.includes("customer_location_proposal_decisions_decision_check"));
      assert.ok(checks.includes("customer_location_proposal_decisions_decided_by_role_check"));
      const triggers = (await client.query(`SELECT tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('customer_location_proposals'::regclass,'customer_location_proposal_decisions'::regclass) ORDER BY tgname`)).rows;
      const customer = randomUUID(), proposal = randomUUID(), job = randomUUID();
      await client.query("INSERT INTO customers VALUES($1);", [customer]);
      await client.query("INSERT INTO users VALUES(1),(2)");
      const insertProposal = async (id: string) => client.query(`INSERT INTO customer_location_proposals(id,customer_id,system_key,job_id,submitted_by_user_id,submitted_by_role,payload)
        VALUES($1,$2,'co2_fire_extinguisher',$3,1,'inspector','{}')`, [id, customer, job]);
      if (populated) {
        await insertProposal(proposal);
        await client.query(`INSERT INTO customer_location_proposal_decisions(id,proposal_id,decision,note,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
          VALUES($1,$2,'rejected','Old decision',2,'admin',1,$3,$4)`, [randomUUID(), proposal, randomUUID(), "a".repeat(64)]);
      }
      const before = (await client.query("SELECT to_jsonb(d) AS row FROM customer_location_proposal_decisions d ORDER BY id")).rows;
      await client.query(await readFile(new URL("../../migrations/056_location_proposal_edit_withdraw.sql", import.meta.url), "utf8"));
      const after = (await client.query("SELECT to_jsonb(d)-'applied_patch' AS row FROM customer_location_proposal_decisions d ORDER BY id")).rows;
      assert.deepEqual(after, before);
      assert.deepEqual((await client.query(`SELECT tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('customer_location_proposals'::regclass,'customer_location_proposal_decisions'::regclass) ORDER BY tgname`)).rows, triggers);
      const withdrawn = randomUUID(); await insertProposal(withdrawn);
      await client.query(`INSERT INTO customer_location_proposal_decisions(id,proposal_id,decision,decided_by_user_id,decided_by_role,sequence,request_id,request_fingerprint)
        VALUES($1,$2,'withdrawn',1,'inspector',1,$3,$4)`, [randomUUID(), withdrawn, randomUUID(), "b".repeat(64)]);
      for (const sql of ["UPDATE customer_location_proposals SET payload='{}'", "DELETE FROM customer_location_proposal_decisions", "TRUNCATE customer_location_proposal_decisions", "TRUNCATE customer_location_proposals CASCADE"]) {
        await client.query("SAVEPOINT immutable");
        await assert.rejects(client.query(sql), /append-only/);
        await client.query("ROLLBACK TO SAVEPOINT immutable");
      }
      await client.query("ROLLBACK");
    }
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});
