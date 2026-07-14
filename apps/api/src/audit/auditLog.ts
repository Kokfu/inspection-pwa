import { pool } from "../db/pool.js";

export type AuditResult = "success" | "failure";

export async function auditLog(event: {
  actorUserId?: number;
  action: string;
  entityType?: string;
  entityId?: string;
  result: AuditResult;
  reason?: string;
}) {
  await pool.query(
    `
      INSERT INTO audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        result,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6);
    `,
    [
      event.actorUserId ?? null,
      event.action,
      event.entityType ?? null,
      event.entityId ?? null,
      event.result,
      event.reason ?? null
    ]
  );
}

