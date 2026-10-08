/**
 * Migration 050 — Reset the allocations migration 045 invented for old members
 *
 * Before 045, a team member had no allocation dates — only a percentage, which
 * migration 026 had set to 100% for everyone. 045 turned that into one period per
 * member: 8 h/day, dated deploy-day → project end, or deploy-day + 90 days when
 * the project end was missing or already past (hence "16 Sep → 15 Dec" everywhere).
 * Nobody chose those numbers. This migration replaces them with what the business
 * asked for:
 *
 *   dates  = the PROJECT's start and end date (as-is, even if already past)
 *   hours  = 0 h/day  — a manager sets the real hours by editing the period
 *
 * Only an UNTOUCHED backfilled period is changed: no creator (made by 045), no note,
 * no exception, and never updated since it was created. hoursConfirmed is NOT used —
 * 045 copied it from the old member row, so it does not mean a person chose the period.
 * Anything a manager has entered or edited is left exactly as it is.
 *   - Member whose ONLY period is the backfilled one → that period is reset.
 *   - Member who ALSO has real periods → the backfilled one is deleted instead
 *     (resetting it to the project dates would overlap their real periods).
 *   - Project with no start / end date → that side keeps the period's current date.
 * The member's summary columns are re-mirrored from their periods afterwards.
 *
 * Idempotent: a reset period is no longer "untouched", so a second run changes 0 rows.
 *
 *   node backend/migrations/050_reset_backfilled_allocations.js --dry-run   ← preview
 *   node backend/migrations/050_reset_backfilled_allocations.js             ← apply
 *   … --include-edited   also reset old periods someone edited since the deploy
 *                        (discards those edits — the dry run reports how many there are)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

/**
 * DATE → 'YYYY-MM-DD', or null when it is not a real date. Production has project
 * dates stored as MySQL's zero date '0000-00-00' (and mysql2 can surface those as
 * an Invalid Date) — both mean "no date" and must never be written to a period.
 */
const dateOnly = (v) => {
  if (v == null) return null;
  let s;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    s = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  } else {
    s = String(v).slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith('0000') || s.endsWith('-00') || s.slice(5, 7) === '00') return null;
  return s;
};

/**
 * @param {{ dryRun?: boolean, projectId?: string }} [opts]
 *   dryRun    → report what would change, write nothing
 *   projectId → limit to one project (tests)
 */
async function run({ dryRun = false, projectId = null, includeEdited = false } = {}) {
  console.log(`[Migration 050] Reset backfilled allocations → project dates, 0 h/day${dryRun ? '  (DRY RUN — nothing is written)' : ''}${includeEdited ? '  (INCLUDING periods edited since the deploy)' : ''}${projectId ? ` (project ${projectId} only)` : ''}`);

  // Periods 045 made that a person HAS edited since — not reset by default, always reported
  if (!includeEdited) {
    const [[edited]] = await sequelize.query(`
      SELECT COUNT(*) AS n FROM pm_allocation_segments s
       WHERE s.createdById IS NULL AND s.note IS NULL AND s.exceptionStatus = 'none'
         AND s.exceptionApprovalId IS NULL AND s.hoursPerDay <> 0
         AND ABS(TIMESTAMPDIFF(SECOND, s.createdAt, s.updatedAt)) > 5
         ${projectId ? 'AND s.projectId = :projectId' : ''}`, { replacements: { projectId } });
    if (Number(edited.n) > 0) {
      console.log(`  [!] ${edited.n} old period(s) were EDITED by someone since the deploy and are NOT reset.`);
      console.log('      To set those to 0 h as well, re-run with --include-edited (that discards the edits).');
    }
  }

  const [rows] = await sequelize.query(`
    SELECT s.id, s.memberId, s.projectId, s.fromDate, s.toDate, s.hoursPerDay,
           p.name AS projectName, p.startDate AS projectStart, p.endDate AS projectEnd,
           u.name AS userName,
           (SELECT COUNT(*) FROM pm_allocation_segments o WHERE o.memberId = s.memberId) AS memberSegments
      FROM pm_allocation_segments s
      JOIN pm_projects p ON p.id = s.projectId
      LEFT JOIN users u  ON u.id = s.userId
     WHERE s.createdById IS NULL          -- created by migration 045, not by a person
       -- NOT filtered on hoursConfirmed: 045 copied that flag from the old member row,
       -- so a pre-release "Confirm" click made an invented period look manager-entered.
       AND s.note IS NULL
       AND s.exceptionStatus = 'none'
       AND s.exceptionApprovalId IS NULL
       ${includeEdited ? '' : 'AND ABS(TIMESTAMPDIFF(SECOND, s.createdAt, s.updatedAt)) <= 5'}
       ${projectId ? 'AND s.projectId = :projectId' : ''}
     ORDER BY p.name, u.name`,
    { replacements: { projectId } }
  );

  const plan = rows.map((r) => {
    const curFrom = dateOnly(r.fromDate), curTo = dateOnly(r.toDate);
    let from = dateOnly(r.projectStart) || curFrom;
    let to   = dateOnly(r.projectEnd)   || curTo;
    let note = '';
    if (from > to) { from = curFrom; to = curTo; note = ' (project dates reversed — kept current dates)'; }
    if (!dateOnly(r.projectStart)) note += ' (no project start — kept current start)';
    if (!dateOnly(r.projectEnd))   note += ' (no project end — kept current end)';
    // Last line of defence: never write anything but two real, ordered dates
    if (!dateOnly(from) || !dateOnly(to) || from > to) { from = curFrom; to = curTo; }
    const action = Number(r.memberSegments) > 1 ? 'delete' : 'reset';
    const alreadyDone = action === 'reset' && from === curFrom && to === curTo && Number(r.hoursPerDay) === 0;
    return { ...r, curFrom, curTo, from, to, note, action, alreadyDone };
  }).filter((p) => !p.alreadyDone);

  const resets  = plan.filter((p) => p.action === 'reset');
  const deletes = plan.filter((p) => p.action === 'delete');
  console.log(`  [i] untouched backfilled periods: ${plan.length}  → reset ${resets.length}, delete ${deletes.length}`);
  plan.forEach((p) => console.log(
    `      ${p.action === 'reset' ? 'reset ' : 'delete'} ${p.projectName} › ${p.userName || p.memberId}: ` +
    `${p.curFrom} → ${p.curTo} @ ${Number(p.hoursPerDay)}h` +
    (p.action === 'reset' ? `  ⇒  ${p.from} → ${p.to} @ 0h${p.note}` : '  (member has real periods)')
  ));

  if (dryRun || plan.length === 0) {
    console.log(`[Migration 050] ${dryRun ? 'dry run complete — run without --dry-run to apply' : 'nothing to do'}.`);
    return { reset: 0, deleted: 0, planned: plan.length };
  }

  // Loaded lazily so a dry run needs nothing beyond the DB connection
  const alloc = require('../src/services/pm/allocation.service');
  const pmSettings = require('../src/services/pm/pmSettings.service');
  const calendar = await pmSettings.getCalendar();

  const t = await sequelize.transaction();
  try {
    for (const p of resets) {
      await sequelize.query(
        // updatedAt is bumped explicitly (raw SQL bypasses Sequelize's timestamps):
        // the period is no longer "untouched", so a re-run leaves it alone.
        `UPDATE pm_allocation_segments
            SET fromDate = ?, toDate = ?, hoursPerDay = 0, allocationMode = 'per_day', allocationTotalHours = 0,
                hoursConfirmed = 0, updatedAt = NOW()
          WHERE id = ?`,
        { replacements: [p.from, p.to, p.id], transaction: t }
      );
    }
    for (const p of deletes) {
      await sequelize.query('DELETE FROM pm_allocation_segments WHERE id = ?', { replacements: [p.id], transaction: t });
    }
    const memberIds = [...new Set(plan.map((p) => p.memberId))];
    for (const memberId of memberIds) await alloc.mirrorMemberSummary(memberId, t, calendar);
    await t.commit();
    console.log(`  [=] reset ${resets.length}, deleted ${deletes.length}, re-mirrored ${memberIds.length} member(s)`);
  } catch (err) {
    await t.rollback();
    throw err;
  }
  console.log('[Migration 050] done.');
  return { reset: resets.length, deleted: deletes.length, planned: plan.length };
}

module.exports = { run };

if (require.main === module) {
  run({ dryRun: process.argv.includes('--dry-run'), includeEdited: process.argv.includes('--include-edited') })
    .then(() => sequelize.close())
    .catch((err) => { console.error('[Migration 050] FAILED:', err); process.exit(1); });
}
