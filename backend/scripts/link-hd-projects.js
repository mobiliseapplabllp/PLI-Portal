#!/usr/bin/env node
/**
 * Link legacy helpdesk projects to the PM master (ONE PROJECT MASTER).
 *
 * For every hd_projects row with pm_project_id IS NULL:
 *   • exactly one pm_projects row with the same LOWER(TRIM(name))  → LINK
 *   • two or more matches                                          → SKIP (ambiguous — fix by hand)
 *   • no match                                                     → CREATE an 'Operations'
 *     pm_projects row (Non-Billable, status mapped from the hd status, managerId
 *     kept only when it is a real users.id) and link to it
 *
 *   node scripts/link-hd-projects.js            dry run — prints the plan, writes nothing
 *   node scripts/link-hd-projects.js --apply    performs the plan
 *
 * pm_projects rows are never modified, only inserted. Idempotent: linked rows
 * are ignored, so a re-run is a no-op.
 *
 * Exports `plan()` / `apply()` for tests; runs the CLI only when invoked directly.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { QueryTypes } = require('sequelize');
// config/database exports the Sequelize instance directly — do NOT destructure
const sequelize = require('../src/config/database');

const HD_STATUS_TO_PM = { active: 'Active', 'on hold': 'On Hold', on_hold: 'On Hold', completed: 'Completed' };
const mapStatus = (hdStatus) => HD_STATUS_TO_PM[String(hdStatus || '').trim().toLowerCase()] || 'Active';
const norm = (name) => String(name || '').trim().toLowerCase();

const select = (sql, replacements = {}, options = {}) =>
  sequelize.query(sql, { type: QueryTypes.SELECT, replacements, ...options });

/**
 * Compute the plan for unlinked helpdesk projects.
 * @param {{ hdIds?: number[] }} [opts] restrict to these hd ids (tests)
 * @returns {Promise<Array<{hd:object, action:'link'|'skip'|'create', pm?:object, matches?:object[]}>>}
 */
async function plan(opts = {}) {
  const idFilter = Array.isArray(opts.hdIds) && opts.hdIds.length ? 'AND h.id IN (:hdIds)' : '';
  const hd = await select(
    `SELECT h.id, h.name, h.description, h.status, h.manager_id AS managerId
       FROM hd_projects h
      WHERE h.pm_project_id IS NULL ${idFilter}
      ORDER BY h.id`,
    { hdIds: opts.hdIds || [0] }
  );
  if (!hd.length) return [];

  const pm = await select(`SELECT id, name, status, projectType FROM pm_projects`);
  // A master carries at most ONE helpdesk profile (Project.hasOne). Masters that
  // already have one — or are claimed earlier in this same plan — are not linked again.
  const taken = new Set(
    (await select(`SELECT pm_project_id AS id FROM hd_projects WHERE pm_project_id IS NOT NULL`)).map(r => String(r.id))
  );
  const byName = new Map();
  for (const p of pm) {
    const k = norm(p.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  }

  const userIds = [...new Set(hd.map(h => h.managerId).filter(Boolean))];
  const users = userIds.length
    ? await select(`SELECT id FROM users WHERE id IN (:userIds)`, { userIds })
    : [];
  const realUsers = new Set(users.map(u => String(u.id)));

  return hd.map((h) => {
    const matches = byName.get(norm(h.name)) || [];
    if (matches.length === 1) {
      if (taken.has(String(matches[0].id))) {
        return { hd: h, action: 'skip', matches, reason: 'PM project already has a helpdesk profile' };
      }
      taken.add(String(matches[0].id));
      return { hd: h, action: 'link', pm: matches[0] };
    }
    if (matches.length > 1)  return { hd: h, action: 'skip', matches };
    return {
      hd: h,
      action: 'create',
      create: {
        name:        String(h.name).trim(),
        description: h.description ?? null,
        status:      mapStatus(h.status),
        managerId:   h.managerId && realUsers.has(String(h.managerId)) ? h.managerId : null,
      },
    };
  });
}

/**
 * Execute a plan. Each row runs in its own transaction so one failure does not
 * undo the others (and a re-run picks up the remainder).
 * @returns {Promise<{linked:number, created:number, skipped:number, failed:number}>}
 */
async function apply(rows) {
  const { randomUUID } = require('crypto');
  const summary = { linked: 0, created: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    if (row.action === 'skip') { summary.skipped++; continue; }
    try {
      await sequelize.transaction(async (transaction) => {
        let pmId = row.pm?.id;
        if (row.action === 'create') {
          pmId = randomUUID();
          const c = row.create;
          await sequelize.query(
            `INSERT INTO pm_projects
               (id, name, description, managerId, status, billingType, projectType, createdById, createdAt, updatedAt)
             VALUES (:id, :name, :description, :managerId, :status, 'Non-Billable', 'Operations', NULL, NOW(), NOW())`,
            { replacements: { id: pmId, name: c.name, description: c.description, managerId: c.managerId, status: c.status }, transaction }
          );
          row.createdPmId = pmId;
        }
        // Guard: only link rows that are STILL unlinked (idempotent under concurrency)
        await sequelize.query(
          // Also refresh the cached name/description from the master so the copy never starts stale.
          `UPDATE hd_projects h JOIN pm_projects p ON p.id = :pmId
              SET h.pm_project_id = :pmId, h.name = p.name, h.description = p.description, h.updated_at = NOW()
            WHERE h.id = :hdId AND h.pm_project_id IS NULL`,
          { replacements: { pmId, hdId: row.hd.id }, transaction }
        );
      });
      if (row.action === 'create') summary.created++;
      summary.linked++;
    } catch (err) {
      summary.failed++;
      row.error = err.message;
    }
  }
  return summary;
}

function printPlan(rows) {
  if (!rows.length) { console.log('  Nothing to do — every helpdesk project is already linked.'); return; }
  const table = rows.map((r) => ({
    'hd id':   r.hd.id,
    'hd name': r.hd.name,
    'hd status': r.hd.status,
    action:    r.action === 'link' ? 'LINK' : r.action === 'skip' ? 'SKIP (ambiguous)' : 'UNMATCHED → would create Operations project',
    'pm id':   r.pm ? r.pm.id : r.action === 'skip' ? r.matches.map(m => m.id).join(' | ') : (r.createdPmId || '(new)'),
    'pm name': r.pm ? r.pm.name : r.action === 'skip' ? r.matches.map(m => m.name).join(' | ') : r.create.name,
    'pm status': r.pm ? r.pm.status : r.action === 'skip' ? '' : r.create.status,
    ...(r.error ? { error: r.error } : {}),
  }));
  console.table(table);
}

async function main() {
  const applyMode = process.argv.includes('--apply');
  console.log(`\n[link-hd-projects] ${applyMode ? 'APPLY' : 'DRY RUN'} — DB ${process.env.MYSQL_DATABASE || 'pli_portal'}\n`);
  await sequelize.authenticate();

  const rows = await plan();
  printPlan(rows);

  if (!applyMode) {
    const counts = rows.reduce((a, r) => { a[r.action] = (a[r.action] || 0) + 1; return a; }, {});
    console.log(`  Plan: ${counts.link || 0} link · ${counts.create || 0} create · ${counts.skip || 0} skip`);
    if (rows.length) console.log('  Re-run with --apply to perform the plan.');
  } else {
    const s = await apply(rows);
    if (s.failed) printPlan(rows.filter(r => r.error));
    console.log(`  Applied: ${s.linked} linked (${s.created} Operations project(s) created) · ${s.skipped} skipped · ${s.failed} failed`);
  }

  const [[c]] = await sequelize.query(
    `SELECT COUNT(*) AS total, SUM(pm_project_id IS NOT NULL) AS linked FROM hd_projects`
  );
  console.log(`  hd_projects: ${c.total} total, ${Number(c.linked) || 0} linked\n`);
  await sequelize.close();
}

if (require.main === module) {
  main().catch((err) => { console.error('[link-hd-projects] FAILED:', err.message); process.exit(1); });
}

module.exports = { plan, apply, mapStatus };
