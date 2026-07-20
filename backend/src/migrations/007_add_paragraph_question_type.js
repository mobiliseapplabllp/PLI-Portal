/**
 * Migration 007 — Add 'paragraph' to survey_questions.questionType ENUM
 * Run: node backend/src/migrations/007_add_paragraph_question_type.js
 */
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  await sequelize.query(`
    ALTER TABLE survey_questions
    MODIFY COLUMN questionType ENUM('text','radio','select','checkbox','rating','paragraph') NOT NULL;
  `);
  console.log('Migration 007 complete: paragraph added to questionType ENUM');
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
