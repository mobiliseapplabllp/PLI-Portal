/**
 * Migration 011 — Helpdesk Module Tables (hd_* prefix)
 * Run: node backend/src/migrations/011_helpdesk_tables.js
 * Target DB: pli_portal_uat
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  // 1. Helpdesk Groups (support teams / departments)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_groups (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(120) NOT NULL,
      manager_id    INT NULL COMMENT 'FK to users.id',
      enable_approvals TINYINT(1) NOT NULL DEFAULT 0,
      enable_sla    TINYINT(1) NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_groups');

  // 2. Helpdesk Projects (each has a public widget token)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_projects (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(200) NOT NULL,
      description   TEXT NULL,
      public_token  VARCHAR(64) NOT NULL UNIQUE COMMENT 'UUID for embeddable widget',
      manager_id    INT NULL COMMENT 'FK to users.id',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_projects');

  // 3. Tickets (core table)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_tickets (
      id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      req_number      VARCHAR(20) NOT NULL UNIQUE COMMENT 'REQ-0001 format',
      title           VARCHAR(300) NOT NULL,
      description     TEXT NULL,
      status          ENUM('open','in-progress','pending','resolved','closed') NOT NULL DEFAULT 'open',
      priority        ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
      category        VARCHAR(100) NULL,
      requester_id    INT NULL COMMENT 'FK to users.id',
      assignee_id     INT NULL COMMENT 'FK to users.id (primary assignee)',
      group_id        INT NULL COMMENT 'FK to hd_groups.id',
      project_id      INT NULL COMMENT 'FK to hd_projects.id',
      due_date        DATETIME NULL,
      closed_at       DATETIME NULL,
      widget_source   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = submitted via public widget',
      widget_email    VARCHAR(200) NULL COMMENT 'Email of widget submitter (no user account)',
      widget_name     VARCHAR(200) NULL COMMENT 'Name of widget submitter',
      sla_breached    TINYINT(1) NOT NULL DEFAULT 0,
      sla_breach_at   DATETIME NULL,
      linked_ticket_id INT NULL COMMENT 'FK to hd_tickets.id',
      link_type       VARCHAR(30) NULL COMMENT 'related|duplicate|blocks|blocked-by',
      reopen_count    INT NOT NULL DEFAULT 0,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_priority (priority),
      INDEX idx_requester (requester_id),
      INDEX idx_assignee (assignee_id),
      INDEX idx_group (group_id),
      INDEX idx_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_tickets');

  // 4. Ticket conversations (replies + internal notes)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_conversations (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NOT NULL,
      user_id       INT NULL COMMENT 'NULL for widget (non-user) replies',
      author_name   VARCHAR(200) NULL COMMENT 'Fallback name for widget replies',
      author_email  VARCHAR(200) NULL COMMENT 'Fallback email for widget replies',
      message       TEXT NOT NULL,
      attachments   JSON NULL COMMENT 'Array of {filename, path, size, mime}',
      is_internal   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = internal note not visible to requester',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_conversations');

  // 5. Ticket history / audit trail
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_ticket_history (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NOT NULL,
      changed_by    INT NULL COMMENT 'FK to users.id; NULL for system changes',
      field         VARCHAR(60) NOT NULL,
      old_value     TEXT NULL,
      new_value     TEXT NULL,
      changed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_ticket_history');

  // 6. Multi-assignee per ticket (with workload weight)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_ticket_assignees (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NOT NULL,
      user_id       INT NOT NULL,
      weight        INT NOT NULL DEFAULT 100 COMMENT 'Percentage of workload',
      assigned_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ticket_user (ticket_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_ticket_assignees');

  // 7. Ticket approvals (email-token one-click flow)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_ticket_approvals (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NOT NULL,
      approver_id   INT NOT NULL COMMENT 'FK to users.id',
      requested_by  INT NOT NULL COMMENT 'FK to users.id',
      token         VARCHAR(128) NOT NULL UNIQUE COMMENT 'Single-use email link token',
      status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      notes         TEXT NULL COMMENT 'Approver comment',
      approved_at   DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id),
      INDEX idx_token (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_ticket_approvals');

  // 8. Sub-tasks per ticket
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_tasks (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NOT NULL,
      title         VARCHAR(300) NOT NULL,
      assigned_to   INT NULL COMMENT 'FK to users.id',
      status        ENUM('open','in-progress','done') NOT NULL DEFAULT 'open',
      due_date      DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_tasks');

  // 9. Knowledge Base articles
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_solutions (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title         VARCHAR(300) NOT NULL,
      content       LONGTEXT NOT NULL,
      category      VARCHAR(100) NULL,
      created_by    INT NULL COMMENT 'FK to users.id',
      is_public     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = visible without login',
      views         INT NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FULLTEXT INDEX ft_title_content (title, content)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_solutions');

  // 10. System announcements
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_announcements (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title         VARCHAR(300) NOT NULL,
      body          TEXT NOT NULL,
      created_by    INT NULL COMMENT 'FK to users.id',
      expires_at    DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_announcements');

  // 11. Ticket reminders
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_reminders (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NOT NULL,
      user_id       INT NOT NULL COMMENT 'FK to users.id — who gets the reminder',
      remind_at     DATETIME NOT NULL,
      message       TEXT NULL,
      sent          TINYINT(1) NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_unsent (sent, remind_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_reminders');

  // 12. Attachments (uploaded files)
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_attachments (
      id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT NULL COMMENT 'FK to hd_tickets.id',
      conversation_id INT NULL COMMENT 'FK to hd_conversations.id',
      uploaded_by   INT NULL COMMENT 'FK to users.id',
      filename      VARCHAR(300) NOT NULL COMMENT 'Original filename',
      stored_name   VARCHAR(300) NOT NULL COMMENT 'UUID filename on disk',
      mime_type     VARCHAR(100) NULL,
      size_bytes    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id),
      INDEX idx_conversation (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_attachments');

  console.log('\n✅ Migration 011 complete — all 12 helpdesk tables created in', process.env.MYSQL_DATABASE);
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Migration failed:', err.message); process.exit(1); });
