-- =============================================================================
-- Migration: Department-wise Appraisal Cycle deadlines + Scoring Config
--
-- Run order: run this file ONCE on UAT, then on Production.
-- Purely ADDITIVE — unlike 20260713_scoring_config_fy_only.sql (which deleted
-- duplicate rows), this migration deletes nothing and drops nothing destructive.
--
-- New nullable `departmentId` column on both tables. NULL = "applies to every
-- department" (the GLOBAL fallback row) — every existing row gets NULL
-- automatically, so every existing cycle/config keeps behaving exactly as it
-- does today. A department only gets its own override when an admin
-- explicitly creates one.
--
-- MySQL unique indexes allow multiple NULLs (NULL <> NULL), so widening the
-- unique key to include departmentId still guarantees at most ONE global row
-- per (financialYear[, month]) while allowing any number of distinct
-- department-specific rows alongside it.
--
-- IMPORTANT: departmentId must be CHAR(36) COLLATE utf8mb4_bin, matching
-- departments.id exactly (departments.id uses utf8mb4_bin, NOT the tables'
-- own default utf8mb4_unicode_ci) — otherwise the FK add fails with
-- "incompatible" even though both columns are CHAR(36). Confirmed on UAT.
-- =============================================================================

-- ── appraisal_cycles ─────────────────────────────────────────────────────────
ALTER TABLE appraisal_cycles
  ADD COLUMN departmentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER month;

-- Confirmed via `SHOW INDEX FROM appraisal_cycles` on UAT (2026-10-12) — this is
-- the actual Sequelize-generated name for the original (financialYear, month) key.
ALTER TABLE appraisal_cycles
  DROP INDEX appraisal_cycles_financial_year_month;

ALTER TABLE appraisal_cycles
  ADD UNIQUE KEY uq_appraisal_cycle_fy_month_dept (financialYear, month, departmentId);

ALTER TABLE appraisal_cycles
  ADD CONSTRAINT fk_appraisal_cycle_department
    FOREIGN KEY (departmentId) REFERENCES departments(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ── scoring_configs ──────────────────────────────────────────────────────────
ALTER TABLE scoring_configs
  ADD COLUMN departmentId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER financialYear;

ALTER TABLE scoring_configs
  DROP INDEX uq_scoring_config_fy;

ALTER TABLE scoring_configs
  ADD UNIQUE KEY uq_scoring_config_fy_dept (financialYear, departmentId);

ALTER TABLE scoring_configs
  ADD CONSTRAINT fk_scoring_config_department
    FOREIGN KEY (departmentId) REFERENCES departments(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Verification queries (run after migration to confirm):
-- SELECT COUNT(*) FROM appraisal_cycles WHERE departmentId IS NOT NULL;  -- should be 0 right after migration
-- SELECT COUNT(*) FROM scoring_configs  WHERE departmentId IS NOT NULL;  -- should be 0 right after migration
-- SHOW INDEX FROM appraisal_cycles;  -- uq_appraisal_cycle_fy_month_dept should appear
-- SHOW INDEX FROM scoring_configs;   -- uq_scoring_config_fy_dept should appear
