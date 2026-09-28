-- Admin-managed many-to-many review assignments. Role validation is enforced by the API.
CREATE TABLE technician_supervisor_assignments (
  id BIGSERIAL PRIMARY KEY,
  technician_id BIGINT NOT NULL REFERENCES users(id),
  supervisor_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id BIGINT NOT NULL REFERENCES users(id),
  archived_at TIMESTAMPTZ NULL,
  UNIQUE (technician_id, supervisor_id)
);

CREATE INDEX idx_technician_supervisor_assignments_supervisor
  ON technician_supervisor_assignments (supervisor_id, technician_id);
