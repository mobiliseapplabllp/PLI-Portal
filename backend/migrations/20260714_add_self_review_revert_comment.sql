-- Add selfReviewRevertComment column to kpi_assignments
-- Stores the reason when a manager/admin reverts an employee's self-review back to editable

ALTER TABLE kpi_assignments
  ADD COLUMN selfReviewRevertComment TEXT NULL AFTER commitmentRejectionComment;
