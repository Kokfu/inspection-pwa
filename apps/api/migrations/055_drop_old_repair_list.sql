-- Retire the old Repair List (migrations 051/052). All of its data was test data; Repair Visits (054) replace it.
-- Forward-only: 051/052 stay in the folder unedited. Idempotent, no CASCADE, so an object this migration
-- does not name can never be dropped by accident. Dependent tables are dropped before the tables they reference.
BEGIN;
DROP TABLE IF EXISTS repair_exports;
DROP TABLE IF EXISTS repair_approvals;
DROP TABLE IF EXISTS repair_finding_reviews;
DROP TABLE IF EXISTS staged_repair_evidence;
DROP TABLE IF EXISTS repair_records;
DROP TABLE IF EXISTS repair_work_orders;
DROP TABLE IF EXISTS repair_findings;
DROP FUNCTION IF EXISTS repair_cycle_guard();
DROP FUNCTION IF EXISTS repair_finding_identity_guard();
DROP FUNCTION IF EXISTS repair_work_order_guard();
DROP FUNCTION IF EXISTS repair_append_only();
COMMIT;
