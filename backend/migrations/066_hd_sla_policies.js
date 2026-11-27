/**
 * Migration 066 — admin-configurable SLA policy per priority.
 *
 * Replaces the hardcoded 4-hour "At Risk" window that used to apply
 * identically to every ticket regardless of priority (see
 * TicketDetail.jsx's old AT_RISK_THRESHOLD_MS constant). Also lets a new
 * ticket's dueDate be auto-computed from its priority when the creator
 * doesn't pick one explicitly — an EXPLICIT dueDate always wins; this only
 * fills the gap when none was given, so existing manual-due-date behavior
 * is completely unchanged for anyone who still sets their own.
 *
 * One row per priority, keyed by the same names hd_options already seeds
 * (Critical/High/Medium/Low) — not a new taxonomy.
 *
 * Idempotent: safe to re-run (seed INSERTs are guarded by NOT EXISTS).
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

// Defaults are new (no per-priority distinction existed before this) —
// chosen so Medium's at-risk threshold matches the OLD hardcoded 4-hour
// window as closely as possible, since Medium was the de-facto "typical"
// ticket before this change; the others scale sensibly around it.
const DEFAULT_POLICIES = [
  { priority: 'Critical', resolutionHours: 4,  atRiskThresholdHours: 1 },
  { priority: 'High',     resolutionHours: 8,  atRiskThresholdHours: 2 },
  { priority: 'Medium',   resolutionHours: 24, atRiskThresholdHours: 4 },
  { priority: 'Low',      resolutionHours: 48, atRiskThresholdHours: 8 },
];

async function run() {
  console.log('=== Migration 066: hd_sla_policies ===\n');

  if (!(await tableExists('hd_sla_policies'))) {
    await sequelize.query(`
      CREATE TABLE hd_sla_policies (
        id                       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        priority                 VARCHAR(50) NOT NULL,
        resolution_hours         DECIMAL(10,2) NOT NULL COMMENT 'Auto-computed dueDate = createdAt + this, only when no explicit dueDate was given at creation',
        at_risk_threshold_hours  DECIMAL(10,2) NOT NULL COMMENT 'SLA status shows "At Risk" once this many hours remain before dueDate',
        is_active                BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Inactive = this priority falls back to fully manual due dates, no auto-compute',
        created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_hd_sla_policy_priority (priority)
      )
    `);
    console.log('Created hd_sla_policies');
  } else {
    console.log('hd_sla_policies already exists — skipping');
  }

  let seeded = 0;
  for (const p of DEFAULT_POLICIES) {
    const [result] = await sequelize.query(`
      INSERT INTO hd_sla_policies (priority, resolution_hours, at_risk_threshold_hours)
      SELECT ?, ?, ? FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM hd_sla_policies WHERE priority = ?)
    `, { replacements: [p.priority, p.resolutionHours, p.atRiskThresholdHours, p.priority] });
    seeded += result.affectedRows || 0;
  }
  console.log(`Seeded ${seeded} default SLA polic${seeded === 1 ? 'y' : 'ies'}`);

  console.log('\n=== Migration 066 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 066 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
