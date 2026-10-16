-- =============================================================================
-- Migration: Department SNAPSHOT on kpi_assignments
--
-- Problem: deadline (appraisal_cycles) and scoring (scoring_configs) lookups for
-- a KPI assignment currently resolve the employee's CURRENT department live.
-- If an employee transfers departments mid-cycle, an already-open assignment
-- silently starts being judged by the NEW department's deadlines/scoring, even
-- though its KPI items were set under the OLD department's targets.
--
-- Fix: kpi_assignments.departmentId is a SNAPSHOT, set once at creation time —
-- it never changes after that (except by the explicit department-transfer
-- conversion logic in user.service.js, which only touches NOT-YET-COMMITTED
-- months). Deadline/scoring lookups prefer this snapshot over the live
-- employee.departmentId; NULL (legacy rows predating this migration) falls
-- back to the live lookup, unchanged from today's behavior.
--
-- Additive only — deletes/drops nothing. Backfill is BEST-EFFORT: it sets
-- existing rows' snapshot to the employee's CURRENT department, since the
-- department at the TIME each row was originally created is not recorded
-- anywhere. For anyone who has never changed departments this is exactly
-- correct; for anyone who transferred before this migration ran, their
-- pre-migration history will reflect their current department, not the
-- (unrecoverable) historical one — a one-time, unavoidable limitation.
--
-- IMPORTANT: departmentId must be CHAR(36) COLLATE utf8mb4_bin, matching
-- departments.id exactly — see 20261012_department_wise_cycle_and_scoring.sql
-- for why (confirmed gotcha, same fix applied here).
-- =============================================================================

ALTER TABLE kpi_assignments
  ADD COLUMN departmentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER employeeId;

-- SET NULL (not CASCADE) on department delete — losing the snapshot just
-- falls back to live resolution; it must never delete KPI history.
ALTER TABLE kpi_assignments
  ADD CONSTRAINT fk_kpi_assignment_department
    FOREIGN KEY (departmentId) REFERENCES departments(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE kpi_assignments
  ADD INDEX idx_kpi_assignment_department (departmentId);

-- Backfill — best-effort, see note above.
UPDATE kpi_assignments ka
JOIN users u ON u.id = ka.employeeId
SET ka.departmentId = u.departmentId
WHERE ka.departmentId IS NULL AND u.departmentId IS NOT NULL;

-- Verification queries (run after migration to confirm):
-- SHOW INDEX FROM kpi_assignments;  -- fk_kpi_assignment_department / idx_kpi_assignment_department should appear
-- SELECT COUNT(*) FROM kpi_assignments WHERE departmentId IS NULL;  -- only employees with no department at all
