CREATE TABLE IF NOT EXISTS inspection_templates (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspection_template_sections (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES inspection_templates(id),
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0)
);

CREATE TABLE IF NOT EXISTS inspection_template_items (
  id UUID PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES inspection_template_sections(id),
  label TEXT NOT NULL,
  response_type TEXT NOT NULL CHECK (response_type IN ('status', 'number', 'text')),
  required BOOLEAN NOT NULL DEFAULT false,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0)
);

CREATE TABLE IF NOT EXISTS inspection_jobs (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES inspection_templates(id),
  job_reference TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  is_sample BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspections (
  id UUID PRIMARY KEY,
  client_uuid UUID NOT NULL UNIQUE,
  job_id UUID NOT NULL REFERENCES inspection_jobs(id),
  template_id UUID NOT NULL REFERENCES inspection_templates(id),
  template_version INTEGER NOT NULL CHECK (template_version > 0),
  template_snapshot JSONB NOT NULL,
  header JSONB NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL,
  created_by_user_id BIGINT REFERENCES users(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspection_responses (
  inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES inspection_template_items(id),
  response_value TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (inspection_id, template_item_id)
);

CREATE INDEX IF NOT EXISTS idx_inspections_performed_at
  ON inspections (performed_at);

CREATE INDEX IF NOT EXISTS idx_inspections_job_id
  ON inspections (job_id);

CREATE INDEX IF NOT EXISTS idx_inspection_template_sections_template_id
  ON inspection_template_sections (template_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_inspection_template_items_section_id
  ON inspection_template_items (section_id, sort_order);

INSERT INTO inspection_templates (id, code, name, version, is_sample)
VALUES (
  '00000000-0000-4000-8000-000000000401',
  'SAMPLE-INSPECTION-V1',
  'Sample Inspection Template',
  1,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inspection_template_sections (id, template_id, title, sort_order)
VALUES (
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000401',
  'Sample Inspection Section',
  1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inspection_template_items (id, section_id, label, response_type, required, options, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000402', 'General condition', 'status', true, '["pass", "fail", "not_applicable"]'::jsonb, 1),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000402', 'Sample measurement', 'number', true, '[]'::jsonb, 2),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000402', 'Safety check', 'status', true, '["pass", "fail", "not_applicable"]'::jsonb, 3),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000402', 'Additional observation', 'text', false, '[]'::jsonb, 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inspection_jobs (id, template_id, job_reference, title, status, is_sample)
VALUES (
  '00000000-0000-4000-8000-000000000410',
  '00000000-0000-4000-8000-000000000401',
  'SAMPLE-JOB-001',
  'Sample Inspection Job',
  'open',
  true
)
ON CONFLICT (id) DO NOTHING;
