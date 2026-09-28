import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireRoleAudited } from "../middleware/requireRole.js";
import { decryptPassword, encryptPassword, localClock, datePlusDays, validDate, validEmail } from "../reminderCore.js";
import { matchesRecurrence, type ServiceRecurrence } from "../serviceRecurrence.js";

class ReminderError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
function body(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new ReminderError("INVALID_REQUEST", "Request body is invalid.");
  }
  return value as Record<string, unknown>;
}
function customerId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ReminderError("INVALID_CUSTOMER_ID", "Customer ID is invalid.");
  return value;
}
async function audit(client: PoolClient, actor: number, action: string, entity: string) {
  await client.query("INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result) VALUES($1,$2,'service_due_reminder',$3,'success')", [actor, action, entity]);
}

export function createManagerRemindersRouter(database: Pick<Pool, "query" | "connect"> = pool) {
  const router = Router();
  const admin = requireRoleAudited(database, "admin");
  router.get("/manager/reminders/settings", admin, async (_request, response, next) => {
    try {
      const settings = (await database.query<{ senderEmail: string }>("SELECT sender_email AS \"senderEmail\" FROM service_due_email_settings WHERE id=1")).rows[0];
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ settings: { senderEmail: settings?.senderEmail ?? "", passwordConfigured: !!settings, passwordMask: settings ? "••••••••" : "", smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", sendTime: "09:00", timezone: "Asia/Kuala_Lumpur" } });
    } catch (error) { next(error); }
  });
  router.put("/manager/reminders/settings", admin, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const input = body(request.body, ["senderEmail", "appPassword"]);
      if (!validEmail(input.senderEmail) || typeof input.appPassword !== "string" || input.appPassword.length > 1024) throw new ReminderError("INVALID_SETTINGS", "Enter a Gmail address and valid app password.");
      const sender = input.senderEmail.trim().toLowerCase();
      if (!sender.endsWith("@gmail.com") && !sender.endsWith("@googlemail.com")) throw new ReminderError("INVALID_SENDER", "Sender must be a Gmail address.");
      client = await database.connect();
      await client.query("BEGIN");
      const current = (await client.query<{ sender_email: string }>("SELECT sender_email FROM service_due_email_settings WHERE id=1 FOR UPDATE")).rows[0];
      if (!input.appPassword && (!current || current.sender_email !== sender)) throw new ReminderError("PASSWORD_REQUIRED", "A new sender requires an app password.");
      if (input.appPassword) {
        const encrypted = encryptPassword(input.appPassword);
        await client.query(`INSERT INTO service_due_email_settings(id,sender_email,password_ciphertext,password_iv,password_tag,updated_by_user_id)
          VALUES(1,$1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET sender_email=$1,password_ciphertext=$2,password_iv=$3,password_tag=$4,updated_by_user_id=$5,updated_at=now()`,
        [sender, encrypted.ciphertext, encrypted.iv, encrypted.tag, request.currentUser!.id]);
      }
      await audit(client, request.currentUser!.id, "service_due_settings_updated", "1");
      await client.query("COMMIT");
      response.setHeader("Cache-Control", "private, no-store");
      response.json({ settings: { senderEmail: sender, passwordConfigured: true, passwordMask: "••••••••", smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", sendTime: "09:00", timezone: "Asia/Kuala_Lumpur" } });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.put("/manager/reminders/staff/:staffId/email", admin, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = request.params.staffId;
      if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) throw new ReminderError("INVALID_STAFF_ID", "Staff ID is invalid.");
      const input = body(request.body, ["email"]);
      if (input.email !== null && !validEmail(input.email)) throw new ReminderError("INVALID_EMAIL", "Email address is invalid.");
      const email = input.email === null ? null : (input.email as string).trim().toLowerCase();
      client = await database.connect(); await client.query("BEGIN");
      const updated = await client.query("UPDATE users SET reminder_email=$2,updated_at=now() WHERE id=$1 AND role IN ('inspector','supervisor') AND hidden_at IS NULL RETURNING id", [id, email]);
      if (!updated.rows[0]) throw new ReminderError("STAFF_NOT_FOUND", "Staff member was not found.", 404);
      await audit(client, request.currentUser!.id, "service_due_staff_email_updated", id);
      await client.query("COMMIT");
      response.setHeader("Cache-Control", "private, no-store"); response.json({ staffId: Number(id), email });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.get("/manager/reminders/staff", admin, async (_request, response, next) => {
    try {
      const staff = await database.query(`SELECT id::int AS id,username,display_name AS "displayName",role,is_active AS "isActive",reminder_email AS email FROM users WHERE role IN ('inspector','supervisor') AND hidden_at IS NULL ORDER BY username`);
      response.setHeader("Cache-Control", "private, no-store"); response.json({ staff: staff.rows });
    } catch (error) { next(error); }
  });
  router.get("/manager/reminders/plans/:customerId", admin, async (request, response, next) => {
    try {
      const id = customerId(request.params.customerId);
      const customer = (await database.query<{ dueDate: string | null }>("SELECT next_service_due_date::text AS \"dueDate\" FROM customers WHERE id=$1 AND is_active=true AND is_demo=false", [id])).rows[0];
      if (!customer) throw new ReminderError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      const plan = customer.dueDate ? (await database.query<{ id: string; reviewRequired: boolean }>("SELECT id::text AS id,review_required AS \"reviewRequired\" FROM service_due_reminder_plans WHERE customer_id=$1 AND due_date=$2::date", [id, customer.dueDate])).rows[0] : undefined;
      const recipients = plan ? (await database.query(`SELECT staff_user_id::int AS "staffUserId",extra_name AS "extraName",extra_email AS "extraEmail" FROM service_due_reminder_recipients WHERE plan_id=$1 ORDER BY id`, [plan.id])).rows : [];
      const effective = plan ? (await database.query(`SELECT DISTINCT ON (lower(COALESCE(staff.reminder_email,recipient.extra_email))) lower(COALESCE(staff.reminder_email,recipient.extra_email)) AS email,
        COALESCE(staff.display_name,staff.username,recipient.extra_name) AS name FROM service_due_reminder_recipients recipient LEFT JOIN users staff ON staff.id=recipient.staff_user_id
        WHERE recipient.plan_id=$1 AND (recipient.staff_user_id IS NULL OR (staff.is_active=true AND staff.role IN ('inspector','supervisor'))) AND COALESCE(staff.reminder_email,recipient.extra_email) IS NOT NULL
        ORDER BY lower(COALESCE(staff.reminder_email,recipient.extra_email))`, [plan.id])).rows.filter((row) => validEmail(row.email)) : [];
      const priorSentCount = (await database.query<{ count: number }>(`SELECT count(*)::int AS count FROM service_due_email_deliveries
        WHERE customer_id=$1 AND due_date IS DISTINCT FROM $2::date AND status='sent'`, [id, customer.dueDate])).rows[0]!.count;
      response.setHeader("Cache-Control", "private, no-store"); response.json({ plan: { customerId: id, dueDate: customer.dueDate, reviewRequired: plan?.reviewRequired ?? false, recipients, effective, blocked: !effective.length, plannedSendDate: customer.dueDate ? datePlusDays(customer.dueDate, -1) : null, priorSentCount } });
    } catch (error) { next(error); }
  });
  router.put("/manager/reminders/plans/:customerId", admin, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = customerId(request.params.customerId);
      const input = body(request.body, ["dueDate", "staffUserIds", "extras"]);
      if (!validDate(input.dueDate) || !Array.isArray(input.staffUserIds) || !Array.isArray(input.extras) || input.staffUserIds.length + input.extras.length > 100) throw new ReminderError("INVALID_PLAN", "Reminder plan is invalid.");
      const staffIds = input.staffUserIds as unknown[];
      if (staffIds.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0) || new Set(staffIds).size !== staffIds.length) throw new ReminderError("INVALID_STAFF", "Staff selection is invalid.");
      const extras = input.extras as unknown[];
      if (extras.some((value) => !value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "email,name" || !validEmail((value as { email: unknown }).email) || typeof (value as { name: unknown }).name !== "string" || !(value as { name: string }).name.trim() || (value as { name: string }).name.length > 160)) throw new ReminderError("INVALID_EXTRA", "Extra recipient is invalid.");
      const normalizedExtras = extras.map((value) => ({ name: (value as { name: string }).name.trim(), email: (value as { email: string }).email.trim().toLowerCase() }));
      if (new Set(normalizedExtras.map((value) => value.email)).size !== normalizedExtras.length) throw new ReminderError("DUPLICATE_EMAIL", "Duplicate extra email address.");
      client = await database.connect(); await client.query("BEGIN");
      const customer = (await client.query<{ dueDate: string }>("SELECT next_service_due_date::text AS \"dueDate\" FROM customers WHERE id=$1 AND is_active=true AND is_demo=false FOR UPDATE", [id])).rows[0];
      if (!customer || customer.dueDate !== input.dueDate) throw new ReminderError("STALE_DUE_DATE", "Due date changed. Reload before editing recipients.", 409);
      const staff = await client.query<{ id: number; reminder_email: string | null }>("SELECT id::int AS id,reminder_email FROM users WHERE id=ANY($1::bigint[]) AND role IN ('inspector','supervisor') AND is_active=true", [staffIds]);
      if (staff.rows.length !== staffIds.length || staff.rows.some((row) => !validEmail(row.reminder_email))) throw new ReminderError("STAFF_EMAIL_REQUIRED", "Selected staff must be active and have a valid reminder email.");
      const addresses = [...staff.rows.map((row) => row.reminder_email!.toLowerCase()), ...normalizedExtras.map((row) => row.email)];
      if (new Set(addresses).size !== addresses.length) throw new ReminderError("DUPLICATE_EMAIL", "Recipient addresses must be unique.");
      const plan = (await client.query<{ id: string }>(`INSERT INTO service_due_reminder_plans(customer_id,due_date,created_by_user_id,updated_by_user_id)
        VALUES($1,$2::date,$3,$3) ON CONFLICT(customer_id,due_date) DO UPDATE SET updated_by_user_id=$3,updated_at=now(),review_required=false RETURNING id::text AS id`, [id, input.dueDate, request.currentUser!.id])).rows[0]!;
      await client.query("DELETE FROM service_due_reminder_recipients WHERE plan_id=$1", [plan.id]);
      for (const staffId of staffIds) await client.query("INSERT INTO service_due_reminder_recipients(plan_id,staff_user_id) VALUES($1,$2)", [plan.id, staffId]);
      for (const extra of normalizedExtras) await client.query("INSERT INTO service_due_reminder_recipients(plan_id,extra_name,extra_email) VALUES($1,$2,$3)", [plan.id, extra.name, extra.email]);
      await audit(client, request.currentUser!.id, "service_due_plan_updated", plan.id);
      await client.query("COMMIT");
      response.setHeader("Cache-Control", "private, no-store"); response.json({ saved: true, dueDate: input.dueDate });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.get("/manager/reminders/recurrence/:customerId", admin, async (request, response, next) => {
    try {
      const id = customerId(request.params.customerId);
      const current = (await database.query<{ dueDate: string | null; kind: string | null; interval: number | null; day: number | null }>(
        `SELECT next_service_due_date::text AS "dueDate",service_recurrence_kind AS kind,service_recurrence_interval AS interval,service_recurrence_day AS day
         FROM customers WHERE id=$1 AND is_active=true AND is_demo=false`, [id]
      )).rows[0];
      if (!current) throw new ReminderError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      response.setHeader("Cache-Control", "private, no-store"); response.json({ recurrence: current });
    } catch (error) { next(error); }
  });
  router.put("/manager/reminders/recurrence/:customerId", admin, async (request, response, next) => {
    let client: PoolClient | undefined;
    try {
      const id = customerId(request.params.customerId);
      const input = body(request.body, ["kind", "interval", "day", "dueDate"]);
      const clear = input.kind === null && input.interval === null && input.day === null;
      const rule = clear ? null : input.kind === "weekly" || input.kind === "monthly"
        ? { kind: input.kind, interval: input.interval, day: input.day } as ServiceRecurrence : null;
      if (!clear && (!rule || !validDate(input.dueDate) || !matchesRecurrence(input.dueDate, rule))) {
        throw new ReminderError("INVALID_RECURRENCE", "Choose a valid first due date that matches the routine.");
      }
      if (clear && input.dueDate !== null && !validDate(input.dueDate)) throw new ReminderError("INVALID_DUE_DATE", "Due date is invalid.");
      client = await database.connect(); await client.query("BEGIN");
      const previous = (await client.query<{ dueDate: string | null }>(
        `SELECT next_service_due_date::text AS "dueDate" FROM customers WHERE id=$1 AND is_active=true AND is_demo=false FOR UPDATE`, [id]
      )).rows[0];
      if (!previous) throw new ReminderError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
      await client.query(`UPDATE customers SET service_recurrence_kind=$2,service_recurrence_interval=$3,service_recurrence_day=$4,next_service_due_date=$5::date,
        service_recurrence_last_job_id=NULL WHERE id=$1`, [id, clear ? null : rule!.kind, clear ? null : rule!.interval, clear ? null : rule!.day, input.dueDate]);
      if (previous.dueDate && input.dueDate && previous.dueDate !== input.dueDate) {
        const copied = (await client.query<{ id: string }>(`
          INSERT INTO service_due_reminder_plans(customer_id,due_date,review_required,created_by_user_id,updated_by_user_id)
          SELECT $1,$2::date,true,$3,$3 FROM service_due_reminder_plans WHERE customer_id=$1 AND due_date=$4::date
          ON CONFLICT(customer_id,due_date) DO NOTHING RETURNING id::text AS id`, [id, input.dueDate, request.currentUser!.id, previous.dueDate])).rows[0];
        if (copied) await client.query(`INSERT INTO service_due_reminder_recipients(plan_id,staff_user_id,extra_name,extra_email)
          SELECT $1,recipient.staff_user_id,recipient.extra_name,recipient.extra_email FROM service_due_reminder_recipients recipient
          JOIN service_due_reminder_plans prior ON prior.id=recipient.plan_id WHERE prior.customer_id=$2 AND prior.due_date=$3::date`, [copied.id, id, previous.dueDate]);
      }
      await audit(client, request.currentUser!.id, "service_recurrence_updated", id);
      await client.query("COMMIT");
      response.setHeader("Cache-Control", "private, no-store"); response.json({ recurrence: { dueDate: input.dueDate, kind: clear ? null : rule!.kind, interval: clear ? null : rule!.interval, day: clear ? null : rule!.day } });
    } catch (error) { await client?.query("ROLLBACK").catch(() => undefined); next(error); }
    finally { client?.release(); }
  });
  router.get("/manager/reminders/status", admin, async (_request, response, next) => {
    try {
      const savedSettings = (await database.query<{ password_ciphertext: Buffer; password_iv: Buffer; password_tag: Buffer }>(
        "SELECT password_ciphertext,password_iv,password_tag FROM service_due_email_settings WHERE id=1"
      )).rows[0];
      const configured = !!savedSettings;
      let encryptionUnavailable = false;
      if (savedSettings) {
        try { decryptPassword(savedSettings.password_ciphertext, savedSettings.password_iv, savedSettings.password_tag); }
        catch { encryptionUnavailable = true; }
      }
      const counts = (await database.query(`SELECT status,count(*)::int AS count FROM service_due_email_deliveries GROUP BY status`)).rows;
      const deliveries = (await database.query(`SELECT delivery.customer_id AS "customerId",customer.display_name AS "customerName",delivery.due_date::text AS "dueDate",delivery.recipient_email AS "recipientEmail",delivery.status,delivery.error_category AS "errorCategory",delivery.attempted_at AS "attemptedAt" FROM service_due_email_deliveries delivery JOIN customers customer ON customer.id=delivery.customer_id ORDER BY delivery.attempted_at DESC LIMIT 200`)).rows;
      const gaps = (await database.query(`SELECT customer.id AS "customerId",customer.display_name AS "customerName",customer.next_service_due_date::text AS "dueDate" FROM customers customer LEFT JOIN service_due_reminder_plans plan ON plan.customer_id=customer.id AND plan.due_date=customer.next_service_due_date WHERE customer.is_active=true AND customer.is_demo=false AND customer.next_service_due_date IS NOT NULL AND (plan.id IS NULL OR NOT EXISTS(
        SELECT 1 FROM service_due_reminder_recipients recipient LEFT JOIN users staff ON staff.id=recipient.staff_user_id
        WHERE recipient.plan_id=plan.id AND (recipient.extra_email IS NOT NULL OR (staff.is_active=true AND staff.role IN ('inspector','supervisor') AND staff.reminder_email IS NOT NULL))
      )) ORDER BY customer.next_service_due_date LIMIT 100`)).rows;
      const clock = localClock(new Date());
      response.setHeader("Cache-Control", "private, no-store"); response.json({ configured, encryptionUnavailable, nextRunDate: clock.time < "09:00" ? clock.date : datePlusDays(clock.date, 1), nextRunTime: "09:00", timezone: "Asia/Kuala_Lumpur", counts, deliveries, gaps });
    } catch (error) { next(error); }
  });
  return router;
}
export const managerRemindersRouter = createManagerRemindersRouter();
