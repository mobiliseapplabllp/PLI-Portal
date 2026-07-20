require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function columnExists(table, column) {
  const [[row]] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    { replacements: [table, column] }
  );
  return row.cnt > 0;
}

async function up() {
  await sequelize.authenticate();

  // Step 1a — Add approvalStatus to survey_dispatches
  if (!(await columnExists('survey_dispatches', 'approvalStatus'))) {
    await sequelize.query(`
      ALTER TABLE survey_dispatches
      ADD COLUMN approvalStatus
        ENUM('not_required','pending_approval','changes_requested',
             'approved','rejected','expired_unapproved')
        NOT NULL DEFAULT 'not_required'
      AFTER status
    `);
    console.log('  + approvalStatus added to survey_dispatches');
  } else {
    console.log('  ~ approvalStatus already exists, skipped');
  }

  // Step 1b — Add tempChangeSummary to survey_dispatches (revise → resubmit handoff)
  if (!(await columnExists('survey_dispatches', 'tempChangeSummary'))) {
    await sequelize.query(`
      ALTER TABLE survey_dispatches
      ADD COLUMN tempChangeSummary TEXT NULL AFTER approvalStatus
    `);
    console.log('  + tempChangeSummary added to survey_dispatches');
  } else {
    console.log('  ~ tempChangeSummary already exists, skipped');
  }

  // Step 2 — Create survey_dispatch_approvals
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS survey_dispatch_approvals (
      id                  CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      surveyDispatchId    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      requestedById       CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      reviewedById        CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      status              ENUM('pending','changes_requested','approved','rejected')
                          NOT NULL DEFAULT 'pending',
      overallFeedback     TEXT        NULL,
      approvalDeadline    DATETIME    NULL,
      submittedAt         DATETIME    NOT NULL,
      reviewedAt          DATETIME    NULL,
      escalationSentAt    DATETIME    NULL,
      changeSummary       JSON        NULL,
      version             INT         NOT NULL DEFAULT 1,
      createdAt           DATETIME    NOT NULL,
      updatedAt           DATETIME    NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_dispatch   (surveyDispatchId),
      INDEX idx_requester  (requestedById),
      INDEX idx_status     (status),
      INDEX idx_deadline   (approvalDeadline),
      FOREIGN KEY (surveyDispatchId) REFERENCES survey_dispatches(id) ON DELETE CASCADE,
      FOREIGN KEY (requestedById)    REFERENCES users(id),
      FOREIGN KEY (reviewedById)     REFERENCES users(id)
    )
  `);
  console.log('  + survey_dispatch_approvals created (or already exists)');

  // Step 3 — Create survey_dispatch_approval_feedbacks
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS survey_dispatch_approval_feedbacks (
      id                          CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      surveyDispatchApprovalId    CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      surveyQuestionId            CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      feedback                    TEXT      NOT NULL,
      createdAt                   DATETIME  NOT NULL,
      updatedAt                   DATETIME  NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_approval (surveyDispatchApprovalId),
      FOREIGN KEY (surveyDispatchApprovalId)
        REFERENCES survey_dispatch_approvals(id) ON DELETE CASCADE,
      FOREIGN KEY (surveyQuestionId)
        REFERENCES survey_questions(id) ON DELETE CASCADE
    )
  `);
  console.log('  + survey_dispatch_approval_feedbacks created (or already exists)');

  console.log('Migration 010 complete');
}

up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
