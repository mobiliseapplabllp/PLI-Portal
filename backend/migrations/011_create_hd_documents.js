require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
async function run() {
  console.log('\n[Migration 011] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 011] Connected.\n');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_documents (
      id             CHAR(36)     NOT NULL PRIMARY KEY,
      ticket_id      INT          NOT NULL,
      category       VARCHAR(150) NOT NULL DEFAULT 'Others',
      filename       VARCHAR(255) NOT NULL,
      stored_name    VARCHAR(255) NOT NULL,
      mime_type      VARCHAR(100) NULL,
      size_bytes     INT          NULL,
      uploaded_by_id CHAR(36)     NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_hd_documents_ticket (ticket_id),
      CONSTRAINT fk_hd_doc_ticket FOREIGN KEY (ticket_id) REFERENCES hd_tickets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] hd_documents table created (or already exists)');
  console.log('\n[Migration 011] Done.\n');
  await sequelize.close();
}
run().catch(err => { console.error('[Migration 011] FAILED:', err); process.exit(1); });
