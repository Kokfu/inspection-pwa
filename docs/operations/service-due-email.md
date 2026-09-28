# Service due email operations

The `reminder-worker` Compose service sends individual service reminders at 09:00 `Asia/Kuala_Lumpur` on the calendar day before `customers.next_service_due_date`. It checks again every 15 minutes and on startup. A reboot later that day catches up once. A reboot after local midnight records a missed outcome and does not send an outdated “tomorrow” email. The worker has no published port. PostgreSQL remains on the private `internal` network.

## Configuration

1. Generate a random 32-byte encryption key, encode it as standard base64, and put it in the client's untracked `.env` as `SERVICE_DUE_EMAIL_ENCRYPTION_KEY`. Pass the same value to the API and worker. Keep it with encrypted recovery material outside Git. The sender cannot be configured without it. Inspections continue to work if it is absent.
2. Start Docker Desktop automatically with Windows sign-in and configure the Compose stack to start after Docker is ready. Disable sleep/hibernation during service hours; check the worker after Windows Update or power recovery. A UPS is recommended.
3. In Manager Settings → Email reminders, enter the client Gmail address and Gmail app password. The password is write-only in the UI and encrypted in PostgreSQL. The SMTP host and port are fixed at `smtp.gmail.com:587`, with STARTTLS and certificate verification.
4. Add notification email addresses for active technicians and supervisors. For each customer due date, choose staff and any named extra email addresses in Next Upcoming Service → Reminder recipients. Review copied selections when a due date changes.
5. Check Manager Settings → Email reminders for failed, uncertain, and missed outcomes. There is no automatic SMTP retry. Resolve failures manually and use the delivery history before contacting recipients or changing the date.

The client network must permit outbound TCP 587 to Gmail. Test egress on the actual client PC/network before accepting live delivery. A fake sender integration test proves reservation and outcome handling; a local fake SMTP protocol test proves command sequencing but does not perform a real TLS handshake or prove Gmail acceptance. Live acceptance requires a client-provided test account and approved recipient. A `sent` result means SMTP accepted the message, not that it was read.

## Recovery and key custody

Restore the matching database and the same encryption key. A database restored without its original key cannot decrypt the app password; the manager must enter a new app password after installing a new key. Do not rotate the key by simply replacing `.env`; an explicit re-encryption procedure is required. The key and app password must never go into Git or a support ticket.

The worker reserves one row per customer, due date, recipient address, and reminder kind before SMTP. A process death or timeout after possible handoff is marked `unknown`; it is never resent automatically. Existing sent/failed/unknown/missed rows are retained when due dates change. No cancellation email is sent automatically.

## Recurrence

The optional customer routine is independent of mail. Every N weeks uses 1–52 weeks on a selected weekday. Monthly uses a selected day from 1–31 and skips months without that day. A new successful visit close advances the due date once; replayed closes do not. Manual customers keep their dates. Editing a date while a routine is active is a one-time override on the routine’s weekday or month day. Clearing the date pauses the routine; clearing the routine keeps the manual due date.
