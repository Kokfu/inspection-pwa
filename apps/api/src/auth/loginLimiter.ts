import { createHash } from "node:crypto";
import type { Request } from "express";
import type { Pool, PoolClient } from "pg";
import { performance } from "node:perf_hooks";

// Dedicated, expiring operational audit events; never prune ordinary audit history.
export const loginLimits = { account: 8, peer: 120, global: 300, windowSeconds: 600, globalSeconds: 60, workers: 4 } as const;
export const limiterAction = "login_budget_v1";
export const loginCleanupIntervalMs = 60_000;
const lockNamespace = 17293651;
let waiting = 0;
// Cleanup scheduling is only an optimization; PostgreSQL owns every counter.
let lastCleanupAt = -Infinity;
export function loginPeer(request: Request): string {
  // No forwarding chain is trusted. A proxy is deliberately one shared peer.
  return request.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
}
export function identityDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export type LoginLease = { client: PoolClient; eventId: string; release: () => Promise<void> };
export async function reserveLogin(database: Pool, username: string, peer: string): Promise<LoginLease | number> {
  // Bound this process's pool waiters too; the authoritative budget is in PostgreSQL.
  if (waiting >= 8) return 1;
  waiting++;
  let client: PoolClient;
  try { client = await database.connect(); } finally { waiting--; }
  let slot: number | undefined;
  let transaction = false;
  const release = async () => {
    try {
      if (transaction) await client.query("ROLLBACK");
      if (slot !== undefined) await client.query("SELECT pg_advisory_unlock($1,$2)", [lockNamespace, slot]);
      client.release();
    } catch (error) { client.release(true); throw error; }
  };
  try {
    for (let i = 1; i <= loginLimits.workers; i++) {
      if ((await client.query("SELECT pg_try_advisory_lock($1,$2) AS locked", [lockNamespace, i])).rows[0].locked) { slot = i; break; }
    }
    if (slot === undefined) { await release(); return 1; }
    await client.query("BEGIN"); transaction = true;
    await client.query("SELECT pg_advisory_xact_lock($1,0)", [lockNamespace]);
    const cleanupAt = performance.now();
    const cleanupDue = cleanupAt < lastCleanupAt || cleanupAt - lastCleanupAt >= loginCleanupIntervalMs;
    if (cleanupDue) {
      await client.query("DELETE FROM audit_events WHERE action=$1 AND created_at <= now() - interval '10 minutes'", [limiterAction]);
      // Publish the cadence while still holding the counting lock, so another
      // local caller cannot repeat cleanup at the COMMIT callback boundary.
      lastCleanupAt = cleanupAt;
    }
    const account = identityDigest(username), ip = identityDigest(peer);
    const rows = (await client.query<{ entity_id: string; reason: string; result: string; age: number }>(
      "SELECT entity_id,reason,result,extract(epoch FROM now()-created_at)::float8 AS age FROM audit_events WHERE action=$1 AND created_at > now()-interval '10 minutes'", [limiterAction]
    )).rows;
    const rules = [
      { rows: rows.filter(r => r.entity_id === account && r.result !== "success"), max: loginLimits.account, seconds: loginLimits.windowSeconds },
      { rows: rows.filter(r => r.reason === ip), max: loginLimits.peer, seconds: loginLimits.windowSeconds },
      { rows: rows.filter(r => r.age < loginLimits.globalSeconds), max: loginLimits.global, seconds: loginLimits.globalSeconds }
    ];
    const waits = rules.filter(r => r.rows.length >= r.max).map(r => Math.ceil(r.seconds - Math.max(...r.rows.map(e => e.age))));
    if (waits.length) {
      // Retain completed cleanup even when admission is denied.
      await client.query("COMMIT"); transaction = false;
      await release(); return Math.max(1, ...waits);
    }
    // Reserve pessimistically as failure BEFORE hash work; a crash cannot refund attempts.
    const eventId = (await client.query("INSERT INTO audit_events(action,entity_type,entity_id,result,reason) VALUES($1,'login_budget',$2,'failure',$3) RETURNING id", [limiterAction, account, ip])).rows[0].id as string;
    await client.query("COMMIT"); transaction = false;
    return { client, eventId, release };
  } catch (error) { lastCleanupAt = -Infinity; await release(); throw error; }
}
