/**
 * Migration: 004_add_self_review_revert_comment
 *
 * PURPOSE:
 *   Adds selfReviewRevertComment, selfReviewRevertedById, selfReviewRevertedAt
 *   columns to kpi_assignments to track who reverted and when.
 *
 * RUN ONCE:
 *   node backend/src/migrations/004_add_self_review_revert_comment.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function addColumnIfMissing(column, definition) {
  try {
    await sequelize.query(`ALTER TABLE kpi_assignments ADD COLUMN ${column} ${definition}`);
    console.log(`[Migration 004] Added column: ${column}`);
  } catch (err) {
    if (err.message.includes('Duplicate column name')) {
      console.log(`[Migration 004] Column already exists, skipping: ${column}`);
    } else {
      throw err;
    }
  }
}

async function runMigration() {
  console.log('[Migration 004] Starting...');
  try {
    await sequelize.authenticate();
    console.log('[Migration 004] DB connection OK');

    await addColumnIfMissing('selfReviewRevertComment',  'TEXT NULL AFTER commitmentRejectionComment');
    await addColumnIfMissing('selfReviewRevertedById',   'CHAR(36) NULL AFTER selfReviewRevertComment');
    await addColumnIfMissing('selfReviewRevertedAt',     'DATETIME NULL AFTER selfReviewRevertedById');

    console.log('[Migration 004] Completed successfully.');
  } catch (err) {
    console.error('[Migration 004] FAILED:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
