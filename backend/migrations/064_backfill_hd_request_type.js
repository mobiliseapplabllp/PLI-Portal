/**
 * Migration 064 — backfill hd_tickets.request_type to canonical casing.
 *
 * Root cause: bulk import validated request_type case-insensitively but
 * stored whatever raw casing was in the uploaded spreadsheet ("incident",
 * "service_request", etc.) instead of normalizing it. This made the Request
 * Type filter silently miss rows for anyone whose visible tickets happened
 * to carry non-canonical casing — confirmed via live cross-role testing.
 * ticket.controller.js now normalizes on every write path (create, update,
 * bulk import) going forward; this migration fixes the rows already sitting
 * in the table with the wrong casing.
 *
 * Only ever touches request_type — nothing else on the row. Anything that
 * doesn't match a known request type (case/whitespace/underscore-insensitive)
 * is left completely untouched, never nulled out or guessed at.
 *
 * Idempotent: safe to re-run (each UPDATE's WHERE excludes already-correct rows).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('=== Migration 064: backfill hd_tickets.request_type casing ===\n');

  // BINARY forces a byte-for-byte comparison — without it, MySQL's default
  // case-insensitive collation treats 'incident' = 'Incident' as EQUAL, so a
  // plain `!=` here would silently exclude every lowercase row (caught via
  // a direct before/after check against the real data, not assumed).
  const [incidentResult] = await sequelize.query(`
    UPDATE hd_tickets
    SET request_type = 'Incident'
    WHERE LOWER(TRIM(request_type)) = 'incident' AND BINARY request_type != 'Incident'
  `);
  console.log(`Normalized ${incidentResult.affectedRows} row(s) to 'Incident'`);

  const [serviceResult] = await sequelize.query(`
    UPDATE hd_tickets
    SET request_type = 'Service Request'
    WHERE LOWER(REPLACE(REPLACE(TRIM(request_type), '_', ' '), '-', ' ')) = 'service request'
      AND BINARY request_type != 'Service Request'
  `);
  console.log(`Normalized ${serviceResult.affectedRows} row(s) to 'Service Request'`);

  console.log('\n=== Migration 064 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 064 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
