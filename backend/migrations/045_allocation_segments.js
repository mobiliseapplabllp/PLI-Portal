/**
 * Migration 045 — Time-phased allocation (segments) + allocation history
 *
 * A project MEMBER (pm_project_members) may now hold N allocation SEGMENTS —
 * one period with one hours/day amount each. The legacy member columns
 * (hoursPerDay, allocationPct, allocationMode, allocationTotalHours,
 * allocationFrom, allocationTo, hoursConfirmed, exceptionStatus,
 * exceptionApprovalId) are KEPT and mirrored from the segments by the service
 * (allocation.service.mirrorMemberSummary) so every unswitched reader stays coherent.
 *
 * Creates
 *   pm_allocation_segments  { id, memberId → pm_project_members.id ON DELETE CASCADE,
 *                             projectId, userId, fromDate, toDate, allocationMode,
 *                             hoursPerDay, allocationTotalHours, hoursConfirmed,
 *                             exceptionStatus, exceptionApprovalId, note, createdById,
 *                             createdAt, updatedAt }
 *                           idx (memberId), (userId, fromDate, toDate), (projectId)
 *   pm_allocation_history   { id, projectId, memberId, segmentId NULL, userId, action,
 *                             before JSON, after JSON, byId, note, createdAt }
 * Adds
 *   pm_allocation_approvals.segmentId  CHAR(36) utf8mb4_bin NULL (+ idx_pm_alloc_approvals_segment)
 *
 * Backfill (idempotent — only members that have NO segment yet):
 *   ONE segment per member that has hoursPerDay or allocationPct.
 *   dates = allocationFrom/allocationTo when both valid and from ≤ to; otherwise
 *   fromDate = max(project.startDate, today) and toDate = project.endDate when
 *   ≥ fromDate else fromDate + 90 days. Reversed dates use the fallback AND are logged.
 *   Members with no hours → no segment.
 *   pm_allocation_approvals.segmentId ← the member's single segment (memberId set, segmentId NULL).
 *
 * Collations: pm_project_members.id / pm_projects.id / users.id are CHAR(36)
 * utf8mb4_bin — every id column here matches. pm_allocation_approvals.id is
 * utf8mb4_unicode_ci — exceptionApprovalId matches THAT so joins never mix.
 * Only one FK: memberId → pm_project_members ON DELETE CASCADE.
 *
 * Nothing is dropped; pm_projects is not touched. Safe to re-run.
 *
 *   node backend/migrations/045_allocation_segments.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const sequelize = require('../src/config/database');

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // LOCAL date
const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
};
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

async function hasTable(table) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  );
  return Number(cnt) > 0;
}
async function hasColumn(table, column) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return Number(cnt) > 0;
}
async function hasIndex(table, index) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    { replacements: [table, index] }
  );
  return Number(cnt) > 0;
}
async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  [~] ${table}.${column} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
}
async function addIndex(table, index, column) {
  if (await hasIndex(table, index)) { console.log(`  [~] ${table} index ${index} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD INDEX ${index} (${column})`);
  console.log(`  [+] ${table} index ${index} added`);
}
async function createTable(table, ddl) {
  if (await hasTable(table)) { console.log(`  [~] table ${table} already exists — skipping`); return; }
  await sequelize.query(ddl);
  console.log(`  [+] table ${table} created`);
}

const BIN = 'CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin';
const UCI = 'CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';

/**
 * Backfill one segment per member that has hours and no segment yet.
 * Returns { created, skippedNoHours, fallbackDates, reversed:[…] }.
 */
async function backfillSegments() {
  const [[settings]] = await sequelize.query(`SELECT workingHoursPerDay FROM pm_settings WHERE id = 1`);
  const capacity = Number(settings?.workingHoursPerDay) || 8;

  const [rows] = await sequelize.query(
    `SELECT m.id, m.projectId, m.userId, m.hoursPerDay, m.allocationPct, m.allocationMode, m.allocationTotalHours,
            m.allocationFrom, m.allocationTo, m.hoursConfirmed, m.exceptionStatus, m.exceptionApprovalId,
            p.name AS projectName, p.startDate AS projectStart, p.endDate AS projectEnd
       FROM pm_project_members m
       JOIN pm_projects p ON p.id = m.projectId
       LEFT JOIN pm_allocation_segments s ON s.memberId = m.id
      WHERE s.id IS NULL
      ORDER BY p.name, m.createdAt`
  );

  const out = { created: 0, skippedNoHours: 0, fallbackDates: 0, reversed: [] };
  const now = today();

  for (const r of rows) {
    let hours = r.hoursPerDay != null ? Number(r.hoursPerDay) : null;
    if (hours == null && r.allocationPct != null) hours = Math.round(Number(r.allocationPct) * capacity / 100 * 2) / 2;
    if (hours == null || !Number.isFinite(hours) || hours <= 0) { out.skippedNoHours++; continue; }

    const from = toDate(r.allocationFrom), to = toDate(r.allocationTo);
    let fromDate, toDate_;
    if (from && to && from <= to) {
      fromDate = iso(from); toDate_ = iso(to);
    } else {
      const ps = toDate(r.projectStart), pe = toDate(r.projectEnd);
      const f = ps && ps > now ? ps : now;
      const t = pe && pe >= f ? pe : new Date(f.getTime() + 90 * DAY_MS);
      fromDate = iso(f); toDate_ = iso(t);
      out.fallbackDates++;
      if (from && to && from > to) {
        out.reversed.push({ memberId: r.id, userId: r.userId, project: r.projectName, allocationFrom: iso(from), allocationTo: iso(to), fromDate, toDate: toDate_ });
        console.log(`  [!] reversed dates on member ${r.id} (${r.projectName}): ${iso(from)} > ${iso(to)} → fallback ${fromDate}..${toDate_}`);
      }
    }

    const mode = r.allocationMode === 'total' ? 'total' : 'per_day';
    await sequelize.query(
      `INSERT INTO pm_allocation_segments
         (id, memberId, projectId, userId, fromDate, toDate, allocationMode, hoursPerDay, allocationTotalHours,
          hoursConfirmed, exceptionStatus, exceptionApprovalId, note, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NOW(), NOW())`,
      { replacements: [
        crypto.randomUUID(), r.id, r.projectId, r.userId, fromDate, toDate_, mode, hours,
        r.allocationTotalHours == null ? null : Number(r.allocationTotalHours),
        r.hoursConfirmed ? 1 : 0,
        ['none', 'pending', 'approved', 'rejected'].includes(r.exceptionStatus) ? r.exceptionStatus : 'none',
        r.exceptionApprovalId || null,
      ] }
    );
    out.created++;
  }
  return out;
}

async function run() {
  console.log('\n[Migration 045] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 045] Connected.\n');

  // pm_allocation_segments ──────────────────────────────────────────────────
  await createTable('pm_allocation_segments', `
    CREATE TABLE pm_allocation_segments (
      id                   ${BIN} NOT NULL,
      memberId             ${BIN} NOT NULL COMMENT 'pm_project_members.id',
      projectId            ${BIN} NOT NULL COMMENT 'pm_projects.id (denormalised from the member)',
      userId               ${BIN} NOT NULL COMMENT 'users.id (denormalised from the member)',
      fromDate             DATE NOT NULL,
      toDate               DATE NOT NULL,
      allocationMode       ENUM('per_day','total') NOT NULL DEFAULT 'per_day',
      hoursPerDay          DECIMAL(3,1) NOT NULL,
      allocationTotalHours DECIMAL(6,1) NULL DEFAULT NULL,
      hoursConfirmed       TINYINT(1) NOT NULL DEFAULT 1,
      exceptionStatus      ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
      exceptionApprovalId  ${UCI} NULL DEFAULT NULL COMMENT 'pm_allocation_approvals.id (matches its collation)',
      note                 VARCHAR(255) NULL DEFAULT NULL,
      createdById          ${BIN} NULL DEFAULT NULL,
      createdAt            DATETIME NOT NULL,
      updatedAt            DATETIME NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_pm_alloc_segments_member (memberId),
      INDEX idx_pm_alloc_segments_user_dates (userId, fromDate, toDate),
      INDEX idx_pm_alloc_segments_project (projectId),
      CONSTRAINT fk_pm_alloc_segments_member FOREIGN KEY (memberId)
        REFERENCES pm_project_members (id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='One allocation period (hours/day over fromDate..toDate) of a project member'
  `);

  // pm_allocation_history ───────────────────────────────────────────────────
  await createTable('pm_allocation_history', `
    CREATE TABLE pm_allocation_history (
      id         ${BIN} NOT NULL,
      projectId  ${BIN} NOT NULL,
      memberId   ${BIN} NOT NULL,
      segmentId  ${BIN} NULL DEFAULT NULL,
      userId     ${BIN} NOT NULL COMMENT 'the allocated person',
      action     ENUM('add','update','remove','confirm','exception_request','exception_approve','exception_reject','exception_cancel','release') NOT NULL,
      \`before\` JSON NULL DEFAULT NULL,
      \`after\`  JSON NULL DEFAULT NULL,
      byId       ${BIN} NULL DEFAULT NULL COMMENT 'users.id who made the change',
      note       VARCHAR(255) NULL DEFAULT NULL,
      createdAt  DATETIME NOT NULL,
      PRIMARY KEY (id),
      INDEX idx_pm_alloc_history_project (projectId, createdAt),
      INDEX idx_pm_alloc_history_member (memberId),
      INDEX idx_pm_alloc_history_segment (segmentId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='Audit trail of every allocation segment / exception write'
  `);

  // pm_allocation_approvals.segmentId ───────────────────────────────────────
  await addColumn('pm_allocation_approvals', 'segmentId',
    `${BIN} NULL DEFAULT NULL COMMENT 'Exception only: pm_allocation_segments.id the request is about'`);
  await addIndex('pm_allocation_approvals', 'idx_pm_alloc_approvals_segment', 'segmentId');

  // Backfill ────────────────────────────────────────────────────────────────
  const bf = await backfillSegments();
  const [, meta] = await sequelize.query(
    `UPDATE pm_allocation_approvals a
       JOIN pm_allocation_segments s ON s.memberId = a.memberId
        SET a.segmentId = s.id
      WHERE a.segmentId IS NULL AND a.memberId IS NOT NULL
        AND (SELECT COUNT(*) FROM pm_allocation_segments s2 WHERE s2.memberId = a.memberId) = 1`
  );
  const approvalsLinked = meta && typeof meta.affectedRows === 'number' ? meta.affectedRows : 0;

  const [[seg]] = await sequelize.query(`SELECT COUNT(*) n FROM pm_allocation_segments`);
  const [[mem]] = await sequelize.query(`SELECT COUNT(*) n FROM pm_project_members WHERE hoursPerDay IS NOT NULL OR allocationPct IS NOT NULL`);
  const [[noSeg]] = await sequelize.query(
    `SELECT COUNT(*) n FROM pm_project_members m LEFT JOIN pm_allocation_segments s ON s.memberId = m.id
      WHERE s.id IS NULL AND (m.hoursPerDay IS NOT NULL OR m.allocationPct IS NOT NULL)`
  );
  const [[appr]] = await sequelize.query(`SELECT COUNT(*) n FROM pm_allocation_approvals WHERE memberId IS NOT NULL AND segmentId IS NULL`);

  console.log(
    `\n  [✓] segments created this run: ${bf.created} (fallback dates: ${bf.fallbackDates}, reversed: ${bf.reversed.length}, skipped no hours: ${bf.skippedNoHours})` +
    `\n      segments total: ${seg.n} · members with hours: ${mem.n} · members with hours but no segment: ${noSeg.n}` +
    `\n      approvals linked to a segment this run: ${approvalsLinked} · approvals with memberId but no segmentId: ${appr.n}`
  );
  console.log('\n[Migration 045] Done.\n');
  return { ...bf, approvalsLinked, segmentsTotal: Number(seg.n), membersWithHours: Number(mem.n), membersWithoutSegment: Number(noSeg.n) };
}

module.exports = { run, backfillSegments };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch(err => { console.error('[Migration 045] FAILED:', err.message); process.exit(1); });
}
