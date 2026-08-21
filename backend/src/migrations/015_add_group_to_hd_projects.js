'use strict';

/**
 * Migration 015 — Add group_id to hd_projects
 *
 * Links each helpdesk project to an hd_group so the CreateTicket form
 * can scope the Project dropdown to the selected requester's team.
 *
 * Target DB: pli_portal_uat (UAT environment only)
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE || process.env.DB_NAME,
  process.env.MYSQL_USER     || process.env.DB_USER,
  process.env.MYSQL_PASSWORD || process.env.DB_PASS,
  {
    host:    process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port:    parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
    dialect: 'mysql',
    logging: false,
  }
);

async function up() {
  const qi = sequelize.getQueryInterface();

  // 1. Add group_id column
  await qi.addColumn('hd_projects', 'group_id', {
    type:       Sequelize.INTEGER,
    allowNull:  true,
    defaultValue: null,
    references: { model: 'hd_groups', key: 'id' },
    onDelete:   'SET NULL',
    onUpdate:   'CASCADE',
    after:      'manager_id',
  });

  // 2. Add status column (Active / On Hold / Completed)
  await qi.addColumn('hd_projects', 'status', {
    type:         Sequelize.STRING(50),
    allowNull:    false,
    defaultValue: 'Active',
    after:        'group_id',
  });

  console.log('✅ Migration 015 complete — group_id + status added to hd_projects');
}

up()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ Migration 015 failed:', err.message); process.exit(1); });
