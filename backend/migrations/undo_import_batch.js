/**
 * One-off: undo a bulk-import batch by id.
 * Usage: node migrations/undo_import_batch.js <batchId>
 * Deletes every project created by that batch. Client orgs are left in place
 * (same behavior as the API's undo endpoint) — they may already be referenced
 * by other data by the time you undo.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bulkImport = require('../src/services/pm/bulkImport.service');
const sequelize = require('../src/config/database');

const batchId = process.argv[2];
if (!batchId) {
  console.error('Usage: node migrations/undo_import_batch.js <batchId>');
  process.exit(1);
}

bulkImport.undoImport(batchId)
  .then((result) => {
    console.log('Undo result:', result);
    return sequelize.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Undo failed:', err.message);
    process.exit(1);
  });
