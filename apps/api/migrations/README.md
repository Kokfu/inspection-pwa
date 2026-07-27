# Migrations

Phase 2 will add the first PostgreSQL migration for a minimal idempotent offline record vertical slice.

PostgreSQL is the central shared authoritative database after successful sync.

Migration `007_inspection_photo_evidence.sql` adds immutable versioned
evidence policies, nullable historical-compatibility links, accepted
form-instance policy snapshots, and attachment metadata. Migrations 001-006
remain immutable. JPEG bytes are stored in the uploads bind mount, never in
PostgreSQL.

Migration 007 is still pre-release in Phase 5C1. Its accepted-policy trigger
was corrected in place before commit; the already-running local development
database receives the equivalent function/trigger replacement explicitly.
This is not a production migration precedent. Once committed or released,
007 is immutable and later changes require a new forward-only migration.
