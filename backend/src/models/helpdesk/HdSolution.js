/**
 * HdSolution — Knowledge Base article.
 * Table: hd_solutions
 *
 * isPublic = true  → accessible without authentication (public KB)
 * isPublic = false → accessible only to authenticated users
 *
 * Full-text search is supported via MySQL FULLTEXT index on (title, content).
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdSolution = sequelize.define('HdSolution', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  title: {
    type:      DataTypes.STRING(300),
    allowNull: false,
    validate:  { notEmpty: { msg: 'Article title is required' }, len: [3, 300] },
  },
  content: {
    type:      DataTypes.TEXT('long'),
    allowNull: false,
    validate:  { notEmpty: { msg: 'Article content is required' } },
  },
  category: {
    type:      DataTypes.STRING(100),
    allowNull: true,
  },
  // PLI Portal user UUID
  createdBy: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'created_by',
  },
  isPublic: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'is_public',
  },
  views: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName:  'hd_solutions',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   'updated_at',
});

module.exports = HdSolution;
