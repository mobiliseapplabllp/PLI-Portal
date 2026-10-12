/**
 * Migration 057 — Ticket allocation agreement workflow (Operations/Helpdesk only).
 *
 * Today, when a manager sets a ticket's allocation (allocation_total_hours +
 * allocation_from/to), it's immediately active — no sign-off from the assignee.
 * This adds a propose -> agree/disagree -> counter-propose -> confirm negotiation
 * on top of that, WITHOUT touching PM-side allocation (pm_project_members,
 * allocation segments) at all.
 *
 * Additive only:
 *   - hd_tickets.allocationAgreementStatus — new nullable column. Every ticket
 *     that ALREADY has an allocation set is backfilled to 'confirmed', so every
 *     existing ticket keeps behaving exactly as it does today. Only allocations
 *     proposed AFTER this ships (and after the feature flag below is turned on)
 *     go through the negotiation.
 *   - hd_ticket_allocation_proposals — new table, full negotiation history.
 *   - pm_settings.ticketAllocationAgreementEnabled — feature flag, default FALSE.
 *     While off, ticket allocation behaves identically to today (set = active).
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

async function tableExists(table) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, { replacements: [table] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('=== Migration 057: Ticket allocation agreement workflow ===\n');

  // 1) hd_tickets.allocationAgreementStatus
  if (!(await columnExists('hd_tickets', 'allocation_agreement_status'))) {
    await sequelize.query(`
      ALTER TABLE hd_tickets
      ADD COLUMN allocation_agreement_status VARCHAR(20) NULL DEFAULT NULL
    `);
    console.log('Added hd_tickets.allocation_agreement_status');
  } else {
    console.log('hd_tickets.allocation_agreement_status already exists — skipping');
  }

  // 2) Backfill — tickets that already have an allocation are grandfathered as
  // 'confirmed' so nothing changes for them. Tickets with no allocation get 'none'.
  const [, confirmedMeta] = await sequelize.query(`
    UPDATE hd_tickets
    SET allocation_agreement_status = 'confirmed'
    WHERE allocation_total_hours IS NOT NULL
      AND (allocation_agreement_status IS NULL OR allocation_agreement_status = '')
  `);
  console.log(`Backfilled 'confirmed' on ${confirmedMeta.affectedRows} already-allocated ticket(s)`);

  const [, noneMeta] = await sequelize.query(`
    UPDATE hd_tickets
    SET allocation_agreement_status = 'none'
    WHERE allocation_total_hours IS NULL
      AND (allocation_agreement_status IS NULL OR allocation_agreement_status = '')
  `);
  console.log(`Backfilled 'none' on ${noneMeta.affectedRows} unallocated ticket(s)`);

  // 3) hd_ticket_allocation_proposals — full negotiation history
  if (!(await tableExists('hd_ticket_allocation_proposals'))) {
    await sequelize.query(`
      CREATE TABLE hd_ticket_allocation_proposals (
        id                      INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id               INT NOT NULL,
        proposed_by_user_id     VARCHAR(36) NOT NULL,
        proposed_by_role        VARCHAR(10) NOT NULL COMMENT 'manager | employee',
        total_hours             DECIMAL(6,1) NOT NULL,
        allocation_from         DATE NOT NULL,
        allocation_to           DATE NOT NULL,
        status                  VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending | accepted | rejected | superseded',
        responded_by_user_id    VARCHAR(36) NULL,
        responded_at            DATETIME NULL,
        created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_hd_alloc_proposal_ticket FOREIGN KEY (ticket_id) REFERENCES hd_tickets(id) ON DELETE CASCADE,
        INDEX idx_hd_alloc_proposal_ticket (ticket_id)
      )
    `);
    console.log('Created hd_ticket_allocation_proposals');
  } else {
    console.log('hd_ticket_allocation_proposals already exists — skipping');
  }

  // 4) Feature flag — default OFF, so nothing changes until explicitly enabled.
  if (!(await columnExists('pm_settings', 'ticketAllocationAgreementEnabled'))) {
    await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN ticketAllocationAgreementEnabled BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log('Added pm_settings.ticketAllocationAgreementEnabled (default FALSE)');
  } else {
    console.log('pm_settings.ticketAllocationAgreementEnabled already exists — skipping');
  }

  console.log('\n=== Migration 057 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 057 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
