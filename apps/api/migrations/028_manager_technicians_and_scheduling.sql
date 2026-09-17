ALTER TABLE customers ADD COLUMN next_service_due_date DATE;
ALTER TABLE customers ADD COLUMN contact_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_next_service_due_date ON customers
  (next_service_due_date) WHERE is_active = true AND is_demo = false
  AND next_service_due_date IS NOT NULL;
