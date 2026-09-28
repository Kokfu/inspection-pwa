-- Service reminders are independent of inspection evidence and visit authorship.
ALTER TABLE users ADD COLUMN reminder_email TEXT NULL;
ALTER TABLE users ADD CONSTRAINT users_reminder_email_length CHECK (reminder_email IS NULL OR length(reminder_email) <= 254);

CREATE TABLE service_due_email_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  sender_email TEXT NOT NULL,
  password_ciphertext BYTEA NOT NULL,
  password_iv BYTEA NOT NULL,
  password_tag BYTEA NOT NULL,
  key_version SMALLINT NOT NULL DEFAULT 1 CHECK (key_version = 1),
  send_time TIME NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  updated_by_user_id BIGINT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (send_time = '09:00'::time AND timezone = 'Asia/Kuala_Lumpur')
);

CREATE TABLE service_due_reminder_plans (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  due_date DATE NOT NULL,
  review_required BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id),
  updated_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, due_date)
);

CREATE TABLE service_due_reminder_recipients (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES service_due_reminder_plans(id) ON DELETE CASCADE,
  staff_user_id BIGINT NULL REFERENCES users(id),
  extra_name TEXT NULL,
  extra_email TEXT NULL,
  CHECK ((staff_user_id IS NOT NULL AND extra_name IS NULL AND extra_email IS NULL)
    OR (staff_user_id IS NULL AND extra_name IS NOT NULL AND extra_email IS NOT NULL)),
  CHECK (extra_name IS NULL OR length(extra_name) BETWEEN 1 AND 160),
  CHECK (extra_email IS NULL OR length(extra_email) BETWEEN 3 AND 254)
);
CREATE UNIQUE INDEX service_due_recipient_staff_unique ON service_due_reminder_recipients(plan_id, staff_user_id) WHERE staff_user_id IS NOT NULL;
CREATE UNIQUE INDEX service_due_recipient_extra_unique ON service_due_reminder_recipients(plan_id, lower(extra_email)) WHERE extra_email IS NOT NULL;

CREATE TABLE service_due_email_deliveries (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  due_date DATE NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  source_staff_user_id BIGINT NULL REFERENCES users(id),
  reminder_kind TEXT NOT NULL DEFAULT 'day_before' CHECK (reminder_kind = 'day_before'),
  status TEXT NOT NULL CHECK (status IN ('reserved','sent','failed','unknown','skipped')),
  error_category TEXT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  smtp_accepted_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, due_date, recipient_email, reminder_kind),
  CHECK (recipient_email = lower(recipient_email)),
  CHECK (error_category IS NULL OR error_category IN ('auth','connection','tls','timeout','smtp_rejected','worker_interrupted','missed','invalid_recipient','not_configured'))
);
CREATE INDEX service_due_deliveries_status ON service_due_email_deliveries(status, due_date);

ALTER TABLE customers ADD COLUMN service_recurrence_kind TEXT NULL CHECK (service_recurrence_kind IN ('weekly','monthly'));
ALTER TABLE customers ADD COLUMN service_recurrence_interval SMALLINT NULL CHECK (service_recurrence_interval BETWEEN 1 AND 52);
ALTER TABLE customers ADD COLUMN service_recurrence_day SMALLINT NULL CHECK (service_recurrence_day BETWEEN 1 AND 31);
ALTER TABLE customers ADD COLUMN service_recurrence_last_job_id UUID NULL REFERENCES inspection_jobs(id);
ALTER TABLE customers ADD CONSTRAINT service_recurrence_complete CHECK (
  (service_recurrence_kind IS NULL AND service_recurrence_interval IS NULL AND service_recurrence_day IS NULL)
  OR (service_recurrence_kind='weekly' AND service_recurrence_interval IS NOT NULL AND service_recurrence_day BETWEEN 1 AND 7)
  OR (service_recurrence_kind='monthly' AND service_recurrence_interval=1 AND service_recurrence_day BETWEEN 1 AND 31)
);
