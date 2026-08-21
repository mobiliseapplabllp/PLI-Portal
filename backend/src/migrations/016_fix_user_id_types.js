/**
 * Migration 016 — Fix user FK column types in all hd_* tables
 * Run: node backend/src/migrations/016_fix_user_id_types.js
 * Target DB: pli_portal_uat
 *
 * Problem: All hd_* tables store PLI user IDs as INT, but PLI users.id
 * is VARCHAR(36) UUID. This causes:
 *   1. MySQL to silently truncate UUIDs to 0 on INSERT/UPDATE
 *   2. JOIN on users.id = hd_tickets.assignee_id to match ALL users
 *      whose UUID converts to the same integer → duplicate ticket rows
 *   3. Wrong assignee shown after assignment
 *
 * Fix: Change every user FK column from INT to VARCHAR(36) and NULL out
 * any legacy 0/garbage integer values that cannot represent a valid UUID.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  // ── hd_tickets ─────────────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_tickets
      MODIFY COLUMN assignee_id  VARCHAR(36) NULL,
      MODIFY COLUMN requester_id VARCHAR(36) NULL
  `);
  // Null out any legacy integer-truncated values (not valid UUIDs)
  await sequelize.query(`
    UPDATE hd_tickets SET assignee_id  = NULL WHERE assignee_id  IS NOT NULL AND assignee_id  NOT LIKE '%-%'
  `);
  await sequelize.query(`
    UPDATE hd_tickets SET requester_id = NULL WHERE requester_id IS NOT NULL AND requester_id NOT LIKE '%-%'
  `);
  console.log('✓ hd_tickets — assignee_id, requester_id → VARCHAR(36)');

  // ── hd_conversations ───────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_conversations
      MODIFY COLUMN user_id VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_conversations SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT LIKE '%-%'
  `);
  console.log('✓ hd_conversations — user_id → VARCHAR(36)');

  // ── hd_ticket_history ──────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_ticket_history
      MODIFY COLUMN changed_by VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_ticket_history SET changed_by = NULL WHERE changed_by IS NOT NULL AND changed_by NOT LIKE '%-%'
  `);
  console.log('✓ hd_ticket_history — changed_by → VARCHAR(36)');

  // ── hd_ticket_assignees — must drop+recreate UNIQUE key ───────────────────
  await sequelize.query(`
    ALTER TABLE hd_ticket_assignees
      DROP INDEX uq_ticket_user,
      MODIFY COLUMN user_id VARCHAR(36) NOT NULL,
      ADD UNIQUE KEY uq_ticket_user (ticket_id, user_id)
  `);
  await sequelize.query(`
    DELETE FROM hd_ticket_assignees WHERE user_id NOT LIKE '%-%'
  `);
  console.log('✓ hd_ticket_assignees — user_id → VARCHAR(36)');

  // ── hd_ticket_approvals ────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_ticket_approvals
      MODIFY COLUMN approver_id  VARCHAR(36) NOT NULL,
      MODIFY COLUMN requested_by VARCHAR(36) NOT NULL
  `);
  await sequelize.query(`
    DELETE FROM hd_ticket_approvals WHERE approver_id NOT LIKE '%-%' OR requested_by NOT LIKE '%-%'
  `);
  console.log('✓ hd_ticket_approvals — approver_id, requested_by → VARCHAR(36)');

  // ── hd_tasks ───────────────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_tasks
      MODIFY COLUMN assigned_to VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_tasks SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND assigned_to NOT LIKE '%-%'
  `);
  console.log('✓ hd_tasks — assigned_to → VARCHAR(36)');

  // ── hd_solutions ───────────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_solutions
      MODIFY COLUMN created_by VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_solutions SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT LIKE '%-%'
  `);
  console.log('✓ hd_solutions — created_by → VARCHAR(36)');

  // ── hd_announcements ───────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_announcements
      MODIFY COLUMN created_by VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_announcements SET created_by = NULL WHERE created_by IS NOT NULL AND created_by NOT LIKE '%-%'
  `);
  console.log('✓ hd_announcements — created_by → VARCHAR(36)');

  // ── hd_reminders ───────────────────────────────────────────────────────────
  // Allow NULL temporarily to migrate data, keep NOT NULL intent
  await sequelize.query(`
    ALTER TABLE hd_reminders
      MODIFY COLUMN user_id VARCHAR(36) NULL
  `);
  await sequelize.query(`
    DELETE FROM hd_reminders WHERE user_id NOT LIKE '%-%'
  `);
  console.log('✓ hd_reminders — user_id → VARCHAR(36)');

  // ── hd_attachments ─────────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_attachments
      MODIFY COLUMN uploaded_by VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_attachments SET uploaded_by = NULL WHERE uploaded_by IS NOT NULL AND uploaded_by NOT LIKE '%-%'
  `);
  console.log('✓ hd_attachments — uploaded_by → VARCHAR(36)');

  // ── hd_groups ──────────────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_groups
      MODIFY COLUMN manager_id VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_groups SET manager_id = NULL WHERE manager_id IS NOT NULL AND manager_id NOT LIKE '%-%'
  `);
  console.log('✓ hd_groups — manager_id → VARCHAR(36)');

  // ── hd_projects ────────────────────────────────────────────────────────────
  await sequelize.query(`
    ALTER TABLE hd_projects
      MODIFY COLUMN manager_id VARCHAR(36) NULL
  `);
  await sequelize.query(`
    UPDATE hd_projects SET manager_id = NULL WHERE manager_id IS NOT NULL AND manager_id NOT LIKE '%-%'
  `);
  console.log('✓ hd_projects — manager_id → VARCHAR(36)');

  console.log('\n✅ Migration 016 complete — all hd_* user FK columns now VARCHAR(36) in', process.env.MYSQL_DATABASE);
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Migration 016 failed:', err.message); process.exit(1); });
