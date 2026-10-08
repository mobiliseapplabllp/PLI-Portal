/**
 * Migration 051 — add 'on-hold' to hd_tickets.status
 *
 * The frontend (TicketDetail.jsx, CreateTicket.jsx) has offered "On Hold" as a
 * selectable ticket status for a while, but the DB column's ENUM never had it
 * — so picking it in the UI silently failed to save (Sequelize/DB rejected the
 * value) and the ticket's status just stayed wherever it was. This adds the
 * missing ENUM value so the status genuinely persists.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 051] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 051] Connected.\n');

  const [rows] = await sequelize.query(`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hd_tickets'
      AND COLUMN_NAME  = 'status'
  `);
  const columnType = rows[0]?.column_type || rows[0]?.COLUMN_TYPE || '';

  if (columnType.includes("'on-hold'")) {
    console.log("  [~] hd_tickets.status already includes 'on-hold' — skipping");
  } else {
    await sequelize.query(`
      ALTER TABLE hd_tickets
      MODIFY COLUMN status ENUM('open','in-progress','pending','on-hold','resolved','closed')
      NOT NULL DEFAULT 'open'
    `);
    console.log("  [+] hd_tickets.status ENUM now includes 'on-hold'");
  }

  console.log('\n[Migration 051] Done.\n');
  await sequelize.close();
}
run().catch(err => { console.error('[Migration 051] FAILED:', err); process.exit(1); });
