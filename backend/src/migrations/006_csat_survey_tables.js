/**
 * Migration: 006_csat_survey_tables
 *
 * PURPOSE:
 *   Creates all 7 tables for the CSAT Survey module.
 *   All statements use CREATE TABLE IF NOT EXISTS — safe to re-run.
 *
 * NOTE: All CHAR(36) UUID columns use COLLATE utf8mb4_bin to match users.id
 *
 * RUN ONCE:
 *   node backend/src/migrations/006_csat_survey_tables.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function runMigration() {
  console.log('[Migration 006] Starting CSAT survey tables...');
  try {
    await sequelize.authenticate();
    console.log('[Migration 006] DB connection OK');

    // ── 1. client_organisations ──────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS client_organisations (
        id            CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        name          VARCHAR(255) NOT NULL,
        description   TEXT NULL,
        contactPerson VARCHAR(255) NULL,
        contactEmail  VARCHAR(255) NULL,
        contactPhone  VARCHAR(50) NULL,
        industry      VARCHAR(100) NULL,
        isActive      TINYINT(1) NOT NULL DEFAULT 1,
        createdById   CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_corg_createdby FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] client_organisations ✓');

    // ── 2. client_employees ──────────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS client_employees (
        id                   CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        clientOrganisationId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        name                 VARCHAR(255) NOT NULL,
        email                VARCHAR(255) NOT NULL,
        isActive             TINYINT(1) NOT NULL DEFAULT 1,
        createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_cemp_org_email (clientOrganisationId, email),
        CONSTRAINT fk_cemp_org FOREIGN KEY (clientOrganisationId) REFERENCES client_organisations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] client_employees ✓');

    // ── 3. surveys ───────────────────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS surveys (
        id              CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        name            VARCHAR(255) NOT NULL,
        description     TEXT NULL,
        thankYouMessage TEXT NULL,
        status          ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
        createdById     CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_survey_createdby FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] surveys ✓');

    // ── 4. survey_questions ──────────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS survey_questions (
        id           CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        surveyId     CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        questionText TEXT NOT NULL,
        helperText   TEXT NULL,
        questionType ENUM('text','radio','select','checkbox','rating') NOT NULL,
        options      JSON NULL,
        \`minValue\`  INT NULL,
        \`maxValue\`  INT NULL,
        minLabel     VARCHAR(100) NULL,
        maxLabel     VARCHAR(100) NULL,
        isRequired   TINYINT(1) NOT NULL DEFAULT 0,
        orderIndex   INT NOT NULL DEFAULT 0,
        createdAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_sq_survey FOREIGN KEY (surveyId) REFERENCES surveys(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] survey_questions ✓');

    // ── 5. survey_dispatches ─────────────────────────────────────────────────
    // parentDispatchId self-ref FK is added via ALTER TABLE below
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS survey_dispatches (
        id                   CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        surveyId             CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        clientOrganisationId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        employeeIds          JSON NOT NULL,
        emailSubject         VARCHAR(255) NOT NULL,
        totalRecipients      INT NOT NULL DEFAULT 0,
        dispatchMode         ENUM('instant','scheduled','recurring') NOT NULL DEFAULT 'instant',
        status               ENUM('pending','active','closed') NOT NULL DEFAULT 'pending',
        scheduledAt          DATETIME NULL,
        recurrencePattern    ENUM('weekly','monthly','quarterly') NULL,
        recurrenceEndAt      DATETIME NULL,
        nextDispatchAt       DATETIME NULL,
        parentDispatchId     CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        expiresAt            DATETIME NULL,
        reminderDays         INT NULL,
        sentAt               DATETIME NULL,
        sentById             CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_sd_survey  FOREIGN KEY (surveyId)             REFERENCES surveys(id)              ON DELETE RESTRICT,
        CONSTRAINT fk_sd_org     FOREIGN KEY (clientOrganisationId) REFERENCES client_organisations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_sd_sentby  FOREIGN KEY (sentById)             REFERENCES users(id)                ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] survey_dispatches ✓');

    // Self-referencing FK — must be added after table exists
    try {
      await sequelize.query(`
        ALTER TABLE survey_dispatches
          ADD CONSTRAINT fk_sd_parent
          FOREIGN KEY (parentDispatchId) REFERENCES survey_dispatches(id) ON DELETE SET NULL;
      `);
      console.log('[Migration 006] survey_dispatches self-ref FK ✓');
    } catch (err) {
      if (err.original && (err.original.code === 'ER_DUP_KEYNAME' || err.original.errno === 1826)) {
        console.log('[Migration 006] self-ref FK already exists — skipped');
      } else {
        throw err;
      }
    }

    // ── 6. survey_recipients ─────────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS survey_recipients (
        id               CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        surveyDispatchId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        clientEmployeeId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        token            CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        status           ENUM('sent','opened','submitted') NOT NULL DEFAULT 'sent',
        emailSentAt      DATETIME NULL,
        emailError       TEXT NULL,
        openedAt         DATETIME NULL,
        submittedAt      DATETIME NULL,
        reminderSentAt   DATETIME NULL,
        createdAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_sr_token (token),
        CONSTRAINT fk_sr_dispatch FOREIGN KEY (surveyDispatchId) REFERENCES survey_dispatches(id) ON DELETE CASCADE,
        CONSTRAINT fk_sr_employee FOREIGN KEY (clientEmployeeId) REFERENCES client_employees(id)  ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] survey_recipients ✓');

    // ── 7. survey_responses ──────────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS survey_responses (
        id                CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        surveyRecipientId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        surveyQuestionId  CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        answer            TEXT NULL,
        createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT fk_sresp_recipient FOREIGN KEY (surveyRecipientId) REFERENCES survey_recipients(id) ON DELETE CASCADE,
        CONSTRAINT fk_sresp_question  FOREIGN KEY (surveyQuestionId)  REFERENCES survey_questions(id)  ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration 006] survey_responses ✓');

    console.log('[Migration 006] All 7 CSAT tables created successfully.');
  } catch (err) {
    console.error('[Migration 006] FAILED:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
