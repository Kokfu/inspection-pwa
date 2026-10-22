import type { Pool } from "pg";
import { pool } from "./db/pool.js";
import { decryptPassword, datePlusDays, localClock, mailText, nextRunAt, validEmail } from "./reminderCore.js";
import { writeReminderHeartbeat } from "./reminderHealth.js";
import { sendGmail, SmtpFailure } from "./reminderSmtp.js";

type Candidate = { customerId: string; dueDate: string; customerName: string; email: string; name: string; staffUserId: string | null };
type Sender = (input: { sender: string; password: string; recipient: string; subject: string; body: string }) => Promise<void>;

async function candidates(database: Pool, dueDate: string, through = false): Promise<Candidate[]> {
  const result = await database.query<Candidate>(`
    SELECT customer.id AS "customerId", customer.next_service_due_date::text AS "dueDate",
      customer.display_name AS "customerName", lower(COALESCE(staff.reminder_email, recipient.extra_email)) AS email,
      COALESCE(staff.display_name, staff.username, recipient.extra_name) AS name,
      recipient.staff_user_id::text AS "staffUserId"
    FROM customers customer
    JOIN service_due_reminder_plans plan ON plan.customer_id=customer.id AND plan.due_date=customer.next_service_due_date
    JOIN service_due_reminder_recipients recipient ON recipient.plan_id=plan.id
    LEFT JOIN users staff ON staff.id=recipient.staff_user_id
    WHERE customer.is_active=true AND customer.is_demo=false AND customer.next_service_due_date ${through ? "<=" : "="} $1::date
      AND (recipient.staff_user_id IS NULL OR (staff.is_active=true AND staff.role IN ('inspector','supervisor')))
    ORDER BY customer.id, recipient.id`, [dueDate]);
  const unique = new Map<string, Candidate>();
  for (const row of result.rows) if (validEmail(row.email)) unique.set(`${row.customerId}:${row.dueDate}:${row.email}`, unique.get(`${row.customerId}:${row.dueDate}:${row.email}`) ?? row);
  return [...unique.values()];
}

async function reserve(database: Pool, row: Candidate, status: "reserved" | "skipped") {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id FROM customers WHERE id=$1 AND next_service_due_date=$2::date AND is_active=true AND is_demo=false FOR UPDATE", [row.customerId, row.dueDate]);
    if (!current.rows[0]) { await client.query("ROLLBACK"); return null; }
    const selected = await client.query(`SELECT recipient.id FROM service_due_reminder_plans plan
      JOIN service_due_reminder_recipients recipient ON recipient.plan_id=plan.id
      LEFT JOIN users staff ON staff.id=recipient.staff_user_id
      WHERE plan.customer_id=$1 AND plan.due_date=$2::date AND
        ((recipient.staff_user_id=$3::bigint AND staff.is_active=true AND staff.role IN ('inspector','supervisor') AND lower(staff.reminder_email)=$4)
        OR ($3::bigint IS NULL AND recipient.staff_user_id IS NULL AND lower(recipient.extra_email)=$4)) LIMIT 1`,
    [row.customerId, row.dueDate, row.staffUserId, row.email]);
    if (!selected.rows[0]) { await client.query("ROLLBACK"); return null; }
    const result = await client.query<{ id: string }>(`
      INSERT INTO service_due_email_deliveries(customer_id,due_date,recipient_email,recipient_name,source_staff_user_id,status,error_category)
      VALUES($1,$2::date,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id::text AS id`,
    [row.customerId, row.dueDate, row.email, row.name, row.staffUserId, status, status === "skipped" ? "missed" : null]);
    if (result.rows[0]) await client.query(
      `INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason)
       VALUES(NULL,'service_due_email_reserved','service_due_email_delivery',$1,'success',$2)`,
      [result.rows[0].id, status]);
    await client.query("COMMIT");
    return result.rows[0]?.id ?? null;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

async function finish(database: Pool, id: string, status: "sent" | "failed" | "unknown", category: string | null) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE service_due_email_deliveries SET status=$2,error_category=$3,updated_at=now(),
      smtp_accepted_at=CASE WHEN $2='sent' THEN now() ELSE NULL END WHERE id=$1 AND status='reserved'`, [id, status, category]);
    await client.query(`INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id,result,reason)
      VALUES(NULL,'service_due_email_outcome','service_due_email_delivery',$1,$2,$3)`, [id, status === "sent" ? "success" : "failure", category ?? status]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

export async function runReminderCycle(database: Pool = pool, now = new Date(), send: Sender = sendGmail) {
  const clock = localClock(now);
  // A process death after reservation has an ambiguous SMTP outcome. Never resend it.
  await database.query(`UPDATE service_due_email_deliveries SET status='unknown',error_category='worker_interrupted',updated_at=now()
    WHERE status='reserved' AND attempted_at < now() - interval '20 minutes'`);
  const todayRows = await candidates(database, clock.date, true);
  for (const row of todayRows) await reserve(database, row, "skipped");
  if (clock.time < "09:00") return { state: "waiting" };
  const settings = (await database.query<{ sender_email: string; password_ciphertext: Buffer; password_iv: Buffer; password_tag: Buffer }>(
    "SELECT sender_email,password_ciphertext,password_iv,password_tag FROM service_due_email_settings WHERE id=1"
  )).rows[0];
  if (!settings) return { state: "not_configured" };
  let password: string;
  try { password = decryptPassword(settings.password_ciphertext, settings.password_iv, settings.password_tag); }
  catch { return { state: "encryption_unavailable" }; }
  const tomorrow = datePlusDays(clock.date, 1);
  for (const row of await candidates(database, tomorrow)) {
    const id = await reserve(database, row, "reserved");
    if (!id) continue;
    const { subject, body } = mailText(row.customerName, row.dueDate);
    try { await send({ sender: settings.sender_email, password, recipient: row.email, subject, body }); await finish(database, id, "sent", null); }
    catch (error) {
      const failure = error instanceof SmtpFailure ? error : new SmtpFailure("connection", true);
      await finish(database, id, failure.uncertain ? "unknown" : "failed", failure.category);
    }
  }
  return { state: "checked" };
}

if (process.argv[1]?.endsWith("reminderWorker.js")) {
  async function cycle() {
    try { const result = await runReminderCycle(); console.log(`service reminder worker: ${result.state}`); writeReminderHeartbeat(); }
    catch { console.error("service reminder worker cycle failed"); }
  }
  void cycle();
  setInterval(() => void cycle(), 15 * 60 * 1000);
  function scheduleNine() {
    const delay = Math.max(1000, nextRunAt(new Date()).getTime() - Date.now());
    setTimeout(() => { void cycle(); scheduleNine(); }, delay);
  }
  scheduleNine();
}
