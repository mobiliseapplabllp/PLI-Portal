/**
 * Migration 058 — KPI Definition delegation + approval.
 *
 * Today, only hr_admin / admin / sales_director can create or edit a KPI Plan
 * (the target-setting catalog), and sales_director's writes apply instantly —
 * no sign-off. This adds:
 *
 *   - kpi_definers — admin grants a specific user "Definer" rights, auto-scoped
 *     to that user's OWN department (never admin-picked).
 *   - kpi_definition_approvers — admin assigns exactly one approver per
 *     department (any user). No row for a department = falls back to admin.
 *   - kpi_definition_change_requests — every KPI-plan write made by anyone
 *     OTHER than the `admin` role (this now includes hr_admin and
 *     sales_director, who previously wrote instantly) is staged here first and
 *     only actually applied once approved. Only `admin` still writes directly.
 *
 * Purely additive — 3 brand new tables, nothing existing altered. Does not
 * touch kpi_plans, kpi_plan_items, kpi_assignments, or kpi_items in any way.
 * Idempotent: safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function tableExists(table) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, { replacements: [table] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('=== Migration 058: KPI Definition delegation + approval ===\n');

  // 1) kpi_definers
  if (!(await tableExists('kpi_definers'))) {
    await sequelize.query(`
      CREATE TABLE kpi_definers (
        id            CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
        userId        CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        departmentId  CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        isActive      BOOLEAN NOT NULL DEFAULT TRUE,
        grantedById   CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        grantedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revokedAt     DATETIME NULL,
        createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_kpi_definer_user (userId),
        CONSTRAINT fk_kpi_definer_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_definer_department FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_definer_granted_by FOREIGN KEY (grantedById) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Created kpi_definers');
  } else {
    console.log('kpi_definers already exists — skipping');
  }

  // 2) kpi_definition_approvers
  if (!(await tableExists('kpi_definition_approvers'))) {
    await sequelize.query(`
      CREATE TABLE kpi_definition_approvers (
        id            CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
        departmentId  CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        userId        CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        assignedById  CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        assignedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_kpi_definition_approver_dept (departmentId),
        CONSTRAINT fk_kpi_def_approver_department FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_def_approver_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_def_approver_assigned_by FOREIGN KEY (assignedById) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Created kpi_definition_approvers');
  } else {
    console.log('kpi_definition_approvers already exists — skipping');
  }

  // 3) kpi_definition_change_requests
  if (!(await tableExists('kpi_definition_change_requests'))) {
    await sequelize.query(`
      CREATE TABLE kpi_definition_change_requests (
        id              CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
        action          VARCHAR(32) NOT NULL COMMENT 'createPlan|updatePlan|updatePlanStatus|addPlanItem|updatePlanItem|deletePlanItem|publishPlan',
        departmentId    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        planId          CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT 'NULL only for createPlan, before the plan exists',
        itemId          CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        payload         JSON NULL,
        status          VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|rejected',
        requestedById   CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        approverId      CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT 'resolved at submit time; NULL = falls back to any admin',
        reviewedById    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        reviewedAt      DATETIME NULL,
        reviewNote      VARCHAR(500) NULL,
        resultPlanId    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT 'set after a createPlan request is approved and applied',
        createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_kpi_def_request_status (status),
        INDEX idx_kpi_def_request_approver (approverId),
        INDEX idx_kpi_def_request_requester (requestedById),
        CONSTRAINT fk_kpi_def_request_department FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_def_request_plan FOREIGN KEY (planId) REFERENCES kpi_plans(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_def_request_item FOREIGN KEY (itemId) REFERENCES kpi_plan_items(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_def_request_requester FOREIGN KEY (requestedById) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_kpi_def_request_approver FOREIGN KEY (approverId) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_kpi_def_request_reviewer FOREIGN KEY (reviewedById) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_kpi_def_request_result_plan FOREIGN KEY (resultPlanId) REFERENCES kpi_plans(id) ON DELETE SET NULL
      )
    `);
    console.log('Created kpi_definition_change_requests');
  } else {
    console.log('kpi_definition_change_requests already exists — skipping');
  }

  console.log('\n=== Migration 058 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 058 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
