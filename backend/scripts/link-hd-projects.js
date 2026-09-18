/**
 * link-hd-projects — one-time backfill: legacy hd_projects → pm_projects (B12)
 *
 * Matches each hd_projects row to a pm_projects row by NAME (case/space
 * insensitive) and records the link:
 *   hd_projects.pm_project_id = pm.id
 *   hd_tickets.pm_project_id  = pm.id   for tickets of that hd project that
 *                                        do not have a pm_project_id yet
 *
 * Never creates pm_projects rows, never deletes anything, never touches
 * pm_projects. Unmatched / ambiguous names are only reported.
 * Requires migration 043 (pm_project_id columns) to have run.
 *
 *   node backend/scripts/link-hd-projects.js            # dry-run (default): print the plan
 *   node backend/scripts/link-hd-projects.js --apply    # write the links
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const APPLY = process.argv.includes('--apply');
const norm  = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

async function hasColumn(table, column) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] },
  );
  return Number(cnt) > 0;
}

async function run() {
  console.log(`\n[link-hd-projects] ${APPLY ? 'APPLY' : 'DRY-RUN (pass --apply to write)'}`);
  await sequelize.authenticate();

  for (const [t, c] of [['hd_projects', 'pm_project_id'], ['hd_tickets', 'pm_project_id']]) {
    if (!(await hasColumn(t, c))) {
      throw new Error(`${t}.${c} is missing — run migration 043 first`);
    }
  }

  const [hdProjects] = await sequelize.query(
    `SELECT id, name, pm_project_id AS pmProjectId FROM hd_projects ORDER BY name`);
  const [pmProjects] = await sequelize.query(`SELECT id, name FROM pm_projects`);

  // name → [pm rows] (a name shared by several PM projects is ambiguous)
  const byName = new Map();
  for (const p of pmProjects) {
    const k = norm(p.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  }

  const plan = { link: [], alreadyLinked: [], unmatched: [], ambiguous: [] };
  for (const hp of hdProjects) {
    if (hp.pmProjectId) { plan.alreadyLinked.push({ hd: hp, pmId: hp.pmProjectId }); continue; }
    const cands = byName.get(norm(hp.name)) || [];
    if (cands.length === 1)     plan.link.push({ hd: hp, pm: cands[0] });
    else if (cands.length > 1)  plan.ambiguous.push({ hd: hp, candidates: cands });
    else                        plan.unmatched.push(hp);
  }

  // Tickets needing pm_project_id, per hd project that is (or will be) linked
  const ticketTargets = [
    ...plan.link.map(({ hd, pm }) => ({ hdId: hd.id, hdName: hd.name, pmId: pm.id })),
    ...plan.alreadyLinked.map(({ hd, pmId }) => ({ hdId: hd.id, hdName: hd.name, pmId })),
  ];
  for (const t of ticketTargets) {
    const [[{ n }]] = await sequelize.query(
      `SELECT COUNT(*) AS n FROM hd_tickets WHERE project_id = ? AND pm_project_id IS NULL`,
      { replacements: [t.hdId] });
    t.tickets = Number(n);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n  hd_projects: ${hdProjects.length}   pm_projects: ${pmProjects.length}\n`);
  console.log(`  [link] ${plan.link.length} name match(es):`);
  for (const { hd, pm } of plan.link) {
    const tt = ticketTargets.find((x) => x.hdId === hd.id);
    console.log(`    hd#${hd.id} "${hd.name}"  →  pm ${pm.id}  (${tt.tickets} ticket(s) to backfill)`);
  }
  console.log(`  [already linked] ${plan.alreadyLinked.length}:`);
  for (const { hd, pmId } of plan.alreadyLinked) {
    const tt = ticketTargets.find((x) => x.hdId === hd.id);
    console.log(`    hd#${hd.id} "${hd.name}"  =  pm ${pmId}  (${tt.tickets} ticket(s) to backfill)`);
  }
  console.log(`  [ambiguous — skipped] ${plan.ambiguous.length}:`);
  for (const { hd, candidates } of plan.ambiguous) {
    console.log(`    hd#${hd.id} "${hd.name}"  ~  ${candidates.map((c) => c.id).join(', ')}`);
  }
  console.log(`  [unmatched — NOT created] ${plan.unmatched.length}:`);
  for (const hp of plan.unmatched) console.log(`    hd#${hp.id} "${hp.name}"`);

  const totalTickets = ticketTargets.reduce((s, t) => s + t.tickets, 0);
  console.log(`\n  Would set ${plan.link.length} hd_projects.pm_project_id and ${totalTickets} hd_tickets.pm_project_id`);

  if (!APPLY) { console.log('\n  Dry-run — nothing written.\n'); return; }

  // ── Apply ─────────────────────────────────────────────────────────────────
  await sequelize.transaction(async (t) => {
    for (const { hd, pm } of plan.link) {
      await sequelize.query(
        `UPDATE hd_projects SET pm_project_id = ? WHERE id = ? AND pm_project_id IS NULL`,
        { replacements: [pm.id, hd.id], transaction: t });
    }
    for (const tt of ticketTargets) {
      if (!tt.tickets) continue;
      await sequelize.query(
        `UPDATE hd_tickets SET pm_project_id = ? WHERE project_id = ? AND pm_project_id IS NULL`,
        { replacements: [tt.pmId, tt.hdId], transaction: t });
    }
  });
  console.log(`\n  [✓] Applied: ${plan.link.length} project link(s), ${totalTickets} ticket(s) backfilled.\n`);
}

run()
  .then(() => sequelize.close())
  .catch((err) => { console.error('[link-hd-projects] FAILED:', err.message); process.exit(1); });
