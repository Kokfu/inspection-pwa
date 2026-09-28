# Automatic service reminder email (design)

Status: **DRAFT — OWNER REVIEW** (revised 2026-09-28). Planning only; no implementation in this task.
Owner scope: T7's in-app due/overdue view remains; outbound service-due reminders are also required. The owner clarified on 2026-09-28 that reminders must be **automatic on the calendar day before service**, sent to manager-selected technicians, supervisors, and additional email addresses. Gmail app password with fixed `smtp.gmail.com:587` is the v1 provider. The Gmail address and app password remain empty until the client enters them in the Manager Settings page.

## 1. Problem

Today `ManagerUpcomingServices.tsx` holds one `customers.next_service_due_date` per active customer and an admin can edit it. T7 uses that due date for in-app due/overdue display. There is no SMTP configuration, recipient selection, staff email field, send ledger, or scheduler. `inspection_jobs.created_by_user_id` identifies who created a visit, not who is assigned to receive reminders; technician-supervisor assignments scope access but also do not specify recipients for a customer/date. The API container currently joins only Docker's `internal: true` network, so it cannot directly reach Gmail SMTP.

## 2. Options

**A. Dedicated reminder worker with manager-selected recipients (recommended).** Keep the existing API for settings and recipient editing; add one small Compose worker using the API image. The worker reads PostgreSQL, checks tomorrow's dates in a configured timezone, and sends each recipient once. It joins the private DB network and a separate outbound network with no published port. This keeps the API's current network isolation and gives automatic sends a restart policy and a clear owner.

**B. Timer inside the API process.** Fewer containers, but the API would need outbound access and every API instance could start a timer. It couples user requests to SMTP and makes scale/restart behavior harder to reason about. Not recommended.

**C. Browser timer or PWA background sync.** A browser must be open and cannot hold the app password safely. Reject.

The earlier send-on-demand design is superseded by this automatic design. A manual resend may be added later as an audited recovery control, but it is not the normal trigger.

## 3. Recommendation (option A)

### 3.1 Manager Settings and recipient selection

Add an admin-only **Settings → Email reminders** page, matching the loading/editing/error shape of `ManagerCompanyProfile.tsx`. It has a sender Gmail address, a password input for its Gmail app password, a configured/unconfigured indicator, the reminder time and timezone, and a short explanation of what will be mailed. Fixed SMTP host/port are displayed as information, not editable fields. Initial values for sender and password are blank; no real credential is seeded or checked into Git. A blank password after configuration means keep the stored one; changing sender requires a new password. GET returns only `passwordConfigured` and a fixed mask, never a plaintext or partial password. The browser does not persist the secret.

On each customer's **Next Upcoming Service** row, add a **Reminder recipients** editor for that customer's **specific next due date**. The manager explicitly selects active technicians and supervisors and may add additional named email addresses. The selected staff must have a manager-maintained email address in their user profile; an active staff member without one is visibly ineligible until the manager fills it in. Do not infer recipient selection from visit creator or supervisor relationship. Save selected user IDs and extra addresses against the customer-plus-due-date reminder plan; validate roles, active status, addresses, and duplicates server-side. Before the scheduled send, resolve staff IDs to their current validated addresses, deduplicate case-insensitively, and show the manager a preview of the effective recipient list and next planned send date. If there are no valid recipients, the row displays **Reminder blocked: add recipients**, and no send is attempted.

V1 uses `customers.next_service_due_date` as the reminder date source, not an arbitrary open visit's `service_date`. This matches the existing Next Upcoming Service page and T7. A customer can have multiple visits, but only one authoritative next due date; if the business needs separate per-visit reminders, that is a separate model change. The manager should keep this due date in sync with the planned service. T7 remains independent of whether email is configured or delivered.

### 3.2 Storage — proposed forward migration `043_service_due_reminders.sql`

Migration 042 is currently the highest numbered migration. Add one forward 043 migration and register it; never modify 001–042 or historical inspection data. Proposed data:

- `service_due_email_settings`: singleton `id=1`, sender address, AES-GCM ciphertext/IV/tag and key version for app password, local send time, IANA timezone, updater and timestamp. Row may be absent until the client configures it.
- `users.reminder_email TEXT NULL` for technician/supervisor contact addresses, editable by admin. Existing accounts remain null. This is notification contact data, not a login identifier.
- `service_due_reminder_plans`: unique `(customer_id, due_date)`, with creator/updater and timestamps. `service_due_reminder_recipients` belongs to a plan and holds either a staff user ID or a validated extra email/name, with constraints that prevent duplicate selections. This records the manager's choices for each due date without rewriting visit authorship or technician-supervisor access assignments.
- `service_due_email_deliveries`: one row per **customer ID + due date + recipient address + reminder kind** with a unique constraint, recipient/source snapshot, status (`reserved`, `sent`, `failed`, `unknown`, `skipped`), attempt time, safe error category and SMTP acceptance timestamp. It is the send ledger and operational audit source. Never store the password or email body in this table.
- For optional recurrence, separate nullable, constrained customer fields for cadence and last advancement. Keep the existing `next_service_due_date` as the one due-date authority; existing customers keep their manual dates unchanged.

The singleton and recipient/ledger tables belong in the same reviewed migration because automatic sending without durable recipient and delivery state would lose or duplicate notifications.

### 3.3 Credential protection

Propose `SERVICE_DUE_EMAIL_ENCRYPTION_KEY` as a required 32-byte random key (base64 representation), documented as a placeholder in `.env.example` and read/validated through `apps/api/src/config/env.ts`. Use AES-256-GCM with a fresh 96-bit IV per save. The API encrypts the Gmail app password on write; the worker decrypts it only immediately before SMTP. Never return it to the client, log it, or store it in browser storage. A missing/invalid key or corrupt ciphertext blocks email with a visible operations error; it must not prevent inspection data entry. Keep the key outside Git and back it up securely with deployment recovery material: database restoration without the same key cannot send email. Key rotation needs an explicit re-encryption procedure.

The API and worker need the key through a reviewed Compose environment pass-through. The Gmail sender and app password can remain unconfigured indefinitely; the worker reports **Not configured** and sends nothing until the client saves both. No test or sample Gmail credentials should be shipped.

### 3.4 Automatic schedule and delivery

Owner-confirmed send time: **09:00 Asia/Kuala_Lumpur** on the day before `next_service_due_date`. Example: a due date of 2026-09-29 is eligible at 09:00 on 2026-09-28. Schedule a run for 09:00 local time; also check at startup and periodically (e.g. every 15 minutes) to catch a delayed start or a PC reboot. Use the configured IANA timezone and date-only comparisons, rather than trusting the container or browser clock zone. If the PC reboots later that same day, it catches up once before local midnight. After midnight, it marks the missed reminder for manager attention and does not send a misleading late "tomorrow" message. Exact wall-clock delivery still depends on the PC, Docker, network and Gmail being available.

Each eligible customer/recipient pair is reserved under a PostgreSQL unique key before SMTP. Use a database lock so overlapping worker runs cannot send concurrently. Send an individual email per recipient, without exposing other addresses in To/CC. Template includes customer name and next service date, identifies it as a reminder, and avoids sensitive inspection/report data. SMTP uses fixed `smtp.gmail.com:587`, STARTTLS with certificate verification, bounded connection/send timeouts, and no automatic SMTP retry loop. A `sent` status means Gmail accepted the message for delivery, not that the recipient read it.

On a clear pre-handoff auth/connection failure, mark `failed` and show a manager-visible alert with a safe reason. After a timeout or process death when handoff may have occurred, mark `unknown`, never auto-retry that recipient/date, and show **delivery uncertain**. Other recipients continue independently. The manager can repair settings/address and later request a deliberate, audited resend with a new attempt identity, subject to duplicate warning; implementing that control can be a separate small checkpoint. The worker never turns a generic HTTP 200 or online status into a `sent` record.

If a due date changes, create the new date's plan by copying the previous plan's recipient *selections* and ask the manager to review them; never rewrite the previous date's plan or delivery history. This also applies when a recurrence advances the date. The worker resolves current active staff and addresses at send time, so a deactivated person cannot receive a new reminder just because they were selected earlier. If the change happens after some reminders were sent, the Manager page shows the old delivery history and warns that recipients may have been told the old date. The new date can generate its own reminder when it is tomorrow. No silent cancellation email is sent in v1.

### 3.5 Optional recurrence and manual edit interaction

This is independent of mail delivery. Recommend v1 supports only **every N weeks on one weekday** (N=1–52) and **monthly on day N** (1–31; skip months without that day). No cron syntax. The routine and first due date are set by admin and validated together. After a newly closed visit, the existing server close transaction advances `next_service_due_date` once to the first valid recurrence after the current due date and the visit service date; a replayed close does nothing. A failed close rolls back the advancement. The routine is optional; customers without one keep manual dates.

Editing a date while the routine is active is a one-time override that must still fall on its recurrence weekday/month day; the following close resumes the routine from the override. Clearing the date pauses reminders and recurrence until a new due date is set. The UI explains this before save. If the owner prefers arbitrary one-time dates while a routine remains active, that needs a separate override field rather than overloading `next_service_due_date`.

### 3.6 Failure visibility and deployment

Add a Manager reminder status view: configured/unconfigured, next run, recipient gaps, sent/failed/unknown/missed counts, and per-customer delivery history. No silent SMTP errors. Audit settings changes, recipient edits, schedule changes, send reservations/outcomes, and administrator-triggered resends if added. Do not include passwords or raw SMTP responses in responses, logs, traces, or audit events.

Add one `reminder-worker` Compose service from the existing API image, without published ports. Connect it to the private DB network and a new outbound-only bridge network; leave PostgreSQL on the private network and the web/API ingress pattern unchanged. Give the worker a restart policy, startup health/status reporting, and documented Windows PC/Docker restart behavior. Verify Gmail SMTP egress from the actual client network before acceptance: some networks block outbound 587. No new inbound public port, domain, or third-party cloud database is needed.

## 4. Data / migration impact

One proposed additive migration 043, plus reviewed Docker Compose and placeholder `.env.example` changes during implementation. Customer/staff data remains on the client's PostgreSQL. Historical due dates, inspection templates, accepted records, and Dexie schema are unchanged. The SMTP password is encrypted in PostgreSQL, with its key kept separately outside Git.

## 5. Offline impact

In-app T7 remains visible according to its own offline behavior. Settings and recipient edits require the API; the reminder worker needs the PC, PostgreSQL, outbound internet, and configured Gmail credentials. Inspection forms, local drafts, attachments and sync queues remain usable offline. A missed reminder is visible after recovery; the worker does not send an overdue "tomorrow" email on the due date.

## 6. Security

- Settings, staff notification email, recipient selection, and resend controls are admin-only at API and UI levels. Supervisors/technicians receive email but cannot change sender credentials or recipient plans.
- Validate all input server-side; use parameterized SQL, unique constraints, strict email/date/role checks, and `Cache-Control: private, no-store` for sensitive settings/status responses.
- Deduplicate individual recipients, send one message per address, rate-limit deliberate resends, and never accept arbitrary HTML/body or SMTP host/port from a browser.
- Never log or return Gmail app password, encryption key, ciphertext, SMTP AUTH exchange, or a raw SMTP server error. Review backup/restore and key custody before production use.
- Worker outbound egress is a deliberate deployment change. Preserve PostgreSQL isolation and publish no worker port.

## 7. Test plan for the implementation chat

- **Unit:** timezone/day-before boundaries, daylight-saving-safe IANA date handling, recurrence edges, recipient deduplication, email template escaping, key validation/AES-GCM tamper failure.
- **Disposable PostgreSQL integration:** 043 applies/replays; admin-only route matrix; recipient constraints; same recipient/date cannot be reserved twice under concurrent workers; customer/date changes; due-date advancement exactly once and rollback; settings GET never reveals password.
- **Fake SMTP:** individual messages; Gmail acceptance, auth rejection, connection failure, timeout/unknown; no retry loop; one recipient failure does not block the others; no send while unconfigured; worker reboot catch-up and midnight missed status.
- **Web:** admin settings empty state and masked reload, staff email entry, per-customer recipient picker, effective-recipient preview, blocked/sent/failed/unknown/missed statuses, T7 regression, technician offline-entry regression.
- **Deployment/acceptance:** Compose config/build; worker reaches fake SMTP while Postgres has no public port; cold restart/persistence; client-network egress check; only when owner provides a test Gmail account/app password, send a live test email to an owner-approved address. A fake SMTP pass is not a live delivery proof. Run standard task-brief gates and `git diff --check` before hand-back. Stop before staging.

## 8. Owner decisions and information needed

1. **Sender:** Gmail app password only, fixed `smtp.gmail.com:587` — already confirmed. Sender/password may remain empty until the client configures the Settings page. Never provide them in chat or Git.
2. **Time:** owner confirmed **09:00 `Asia/Kuala_Lumpur`**. The day-before date is calendar-based in that timezone.
3. **Recipient scope:** owner confirmed selection **per customer due date**, with selectable active technician/supervisor accounts plus extra email addresses. Individual service visits do not each have a separate reminder plan in v1.
4. **Email content:** recommend customer name, service date, and neutral scheduling wording only. Owner may provide approved wording and whether site/time should be included when known.
5. **Failure contact:** owner should identify which manager checks the reminder status and resolves failed/unknown/missed sends. No Gmail address, app password, production domain, or personal email is needed for coding; a test Gmail sender and approved test recipient are needed only for a later live acceptance test.
6. **Recurrence:** recommend weekly/monthly only, with a manual-date override as in §3.5. Confirm whether this belongs in the first implementation checkpoint or a follow-up after automatic reminders work.

Owner approval: **PENDING**. This design supersedes the earlier send-on-demand draft. Implement in a separate chat after the owner reviews these choices; do not add a worker, migration, UI/API code, or real credentials in this planning task.
