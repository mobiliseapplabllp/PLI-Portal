-- =============================================================================
-- Migration: Scoring Config — FY-only (remove quarter column)
--            + QuarterlyApproval — add scoringConfigId snapshot column
--
-- Run order: run this file ONCE on UAT, then on Production.
-- Safe to run on a live DB — all ALTERs are additive except the quarter removal.
-- =============================================================================

-- STEP 1: Keep only the FIRST (earliest) scoring config record per financialYear.
--         All subsequent per-quarter duplicates are deleted.
DELETE sc
FROM scoring_configs sc
INNER JOIN (
  SELECT financialYear, MIN(createdAt) AS earliest
  FROM scoring_configs
  GROUP BY financialYear
) keep_row
  ON sc.financialYear = keep_row.financialYear
 AND sc.createdAt > keep_row.earliest;

-- STEP 2: Drop the old FY+Quarter unique constraint.
ALTER TABLE scoring_configs
  DROP INDEX uq_scoring_config_fy_q;

-- STEP 3: Drop the quarter column.
ALTER TABLE scoring_configs
  DROP COLUMN quarter;

-- STEP 4: Add the new FY-only unique constraint.
ALTER TABLE scoring_configs
  ADD UNIQUE KEY uq_scoring_config_fy (financialYear);

-- STEP 5: Add scoringConfigId snapshot column to quarterly_approvals.
--         Nullable — older records will have NULL (config was not tracked before).
ALTER TABLE quarterly_approvals
  ADD COLUMN scoringConfigId CHAR(36) NULL AFTER approvedAt,
  ADD CONSTRAINT fk_qa_scoring_config
    FOREIGN KEY (scoringConfigId) REFERENCES scoring_configs(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- Verification queries (run after migration to confirm):
-- SELECT COUNT(*) FROM scoring_configs;                      -- should be 1 per FY
-- SHOW INDEX FROM scoring_configs;                           -- uq_scoring_config_fy should appear
-- SHOW COLUMNS FROM quarterly_approvals LIKE 'scoringConfigId'; -- should show the new column
