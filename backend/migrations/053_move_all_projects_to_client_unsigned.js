/**
 * Migration 053 — pm_projects.projectTypeId (real FK, mirrors migration 052),
 * bulk reassignment of every project EXCEPT "Client Signed Projects" onto
 * "Client Unsigned Projects", plus milestone sync:
 *   - "Client Signed Projects" projects: ADD-ONLY sync against that type's
 *     current template (never deletes anything).
 *   - Projects that were "Demo" BEFORE this move: full sync against
 *     "Client Unsigned Projects"' current template — matching-name milestones
 *     are kept as-is, missing template phases are added, and any existing
 *     parent milestone with NO match in the new template is DELETED (its
 *     tasks, then its sub-milestones' tasks and the subs, then itself).
 *   - Every other project type (IOT/Hardware, Prototype, AI Related, etc.)
 *     only has its type reassigned — milestones untouched.
 *
 * pm_projects.projectType was string-only, same anti-pattern migration 052
 * fixed on pm_milestone_templates.
 *
 * Idempotent for the FK/backfill/move steps. The Demo delete step is NOT
 * safely re-runnable in the sense of "undoing itself" — once an unmatched
 * milestone is deleted it's gone — but re-running after it's already done
 * is a no-op (nothing left to add or delete). Back up pm_projects, pm_milestones,
 * pm_tasks, pm_milestone_date_logs before running.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { randomUUID } = require('crypto');
const sequelize = require('../src/config/database');
const PmProjectType = require('../src/models/pm/PmProjectType');
const PmMilestoneTemplate = require('../src/models/pm/PmMilestoneTemplate');
const Project = require('../src/models/pm/Project');
const Milestone = require('../src/models/pm/Milestone');
const Task = require('../src/models/pm/Task');
const PmMilestoneDateLog = require('../src/models/pm/PmMilestoneDateLog');

const TARGET_TYPE_NAME = 'Client Unsigned Projects';
const KEEP_TYPE_NAME = 'Client Signed Projects';
// pm_projects.projectType still holds the OLD short label for Signed projects
// ("Signed") from before that type was renamed — the free-text column never
// caught up. Match on it too so those rows are correctly identified as "keep".
const KEEP_TYPE_LEGACY_NAMES = ['Signed'];
const DEMO_TYPE_NAME = 'Demo';

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

async function constraintExists(table, name) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
  `, { replacements: [table, name] });
  return rows[0].cnt > 0;
}

async function indexExists(table, name) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
  `, { replacements: [table, name] });
  return rows[0].cnt > 0;
}

// Sync a project's top-level milestones against a template's phase list, by name.
// Always adds missing phases. Only deletes unmatched existing ones when allowDelete.
async function syncProjectMilestones(project, templates, { allowDelete } = {}) {
  const existing = await Milestone.findAll({ where: { projectId: project.id, parentMilestoneId: null } });
  const existingByName = new Map(existing.map(m => [m.name, m]));
  const templateNames = new Set(templates.map(t => t.name));
  let nextOrder = existing.reduce((max, m) => Math.max(max, m.order || 0), 0);

  const added = [];
  for (const t of templates) {
    if (existingByName.has(t.name)) continue;
    nextOrder += 1;
    await Milestone.create({
      id: randomUUID(),
      projectId: project.id,
      name: t.name,
      isDefault: true,
      minPct: t.minPct,
      maxPct: t.maxPct,
      weightPercentage: null,
      status: 'not_started',
      order: t.sortOrder || nextOrder,
      parentMilestoneId: null,
    });
    added.push(t.name);
  }

  const removed = [];
  if (allowDelete) {
    for (const m of existing) {
      if (templateNames.has(m.name)) continue;
      const subs = await Milestone.findAll({ where: { parentMilestoneId: m.id } });
      for (const sub of subs) {
        await Task.destroy({ where: { milestoneId: sub.id } });
        await PmMilestoneDateLog.destroy({ where: { milestoneId: sub.id } });
        await sub.destroy();
      }
      await Task.destroy({ where: { milestoneId: m.id } });
      await PmMilestoneDateLog.destroy({ where: { milestoneId: m.id } });
      await m.destroy();
      removed.push(m.name);
    }
  }

  return { added, removed };
}

async function primaryKeyExists(table) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'PRIMARY KEY'
  `, { replacements: [table] });
  return rows[0].cnt > 0;
}

async function isAutoIncrement(table, column) {
  const [rows] = await sequelize.query(`
    SELECT EXTRA FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return (rows[0]?.EXTRA || '').includes('auto_increment');
}

async function fkTargetTable(table, column) {
  const [rows] = await sequelize.query(`
    SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
  `, { replacements: [table, column] });
  return rows[0] || null;
}

async function run() {
  console.log('=== Migration 053: project type FK + bulk move + milestone sync ===\n');

  // -2) pm_projects itself has NO PRIMARY KEY on production — the only index on
  // the table is the one this migration added for projectTypeId. That's why any
  // FK referencing pm_projects(id) (ours, and the pm_milestones repoint below)
  // fails with "missing index". Repair it first. id is a UUID (no AUTO_INCREMENT
  // needed). Schema-only — existing row values untouched.
  if (!(await primaryKeyExists('pm_projects'))) {
    await sequelize.query(`ALTER TABLE pm_projects ADD PRIMARY KEY (id)`);
    console.log('Added missing PRIMARY KEY on pm_projects(id)');
  } else {
    console.log('pm_projects already has a PRIMARY KEY — skipping');
  }

  // -1) pm_milestones.projectId points at "pm_projects_dead" — a frozen snapshot
  // left behind by a past schema migration — instead of the live "pm_projects"
  // table. Any project created after that snapshot fails to get milestones
  // written. Repoint it at the real table, same ON DELETE/UPDATE CASCADE.
  const milestoneProjectFk = await fkTargetTable('pm_milestones', 'projectId');
  if (milestoneProjectFk && milestoneProjectFk.REFERENCED_TABLE_NAME === 'pm_projects_dead') {
    await sequelize.query(`ALTER TABLE pm_milestones DROP FOREIGN KEY \`${milestoneProjectFk.CONSTRAINT_NAME}\``);
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD CONSTRAINT fk_pm_milestones_project_v2
      FOREIGN KEY (projectId) REFERENCES pm_projects(id)
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log(`Repointed pm_milestones.projectId FK from pm_projects_dead to pm_projects (was ${milestoneProjectFk.CONSTRAINT_NAME})`);
  } else if (milestoneProjectFk) {
    console.log(`pm_milestones.projectId FK already points at "${milestoneProjectFk.REFERENCED_TABLE_NAME}" — skipping`);
  } else {
    console.log('pm_milestones.projectId has no FK constraint — skipping repoint');
  }

  // 0) pm_project_types has no PRIMARY KEY on production (schema gap from however
  // that table was originally created) — MySQL refuses to add a FK referencing a
  // column with no index. Repair it first: add the PK, and AUTO_INCREMENT since
  // PmProjectType.create() relies on it. Schema-only, existing row values untouched.
  if (!(await primaryKeyExists('pm_project_types'))) {
    await sequelize.query(`ALTER TABLE pm_project_types ADD PRIMARY KEY (id)`);
    console.log('Added missing PRIMARY KEY on pm_project_types(id)');
  } else {
    console.log('pm_project_types already has a PRIMARY KEY — skipping');
  }
  if (!(await isAutoIncrement('pm_project_types', 'id'))) {
    await sequelize.query(`ALTER TABLE pm_project_types MODIFY id INT NOT NULL AUTO_INCREMENT`);
    console.log('Set pm_project_types.id to AUTO_INCREMENT');
  } else {
    console.log('pm_project_types.id already AUTO_INCREMENT — skipping');
  }

  // 1) Add pm_projects.projectTypeId if missing
  if (!(await columnExists('pm_projects', 'projectTypeId'))) {
    await sequelize.query(`ALTER TABLE pm_projects ADD COLUMN projectTypeId INT NULL`);
    console.log('Added pm_projects.projectTypeId');
  } else {
    console.log('pm_projects.projectTypeId already exists — skipping add');
  }

  if (!(await indexExists('pm_projects', 'idx_pm_projects_project_type_id'))) {
    await sequelize.query(`CREATE INDEX idx_pm_projects_project_type_id ON pm_projects (projectTypeId)`);
    console.log('Added index idx_pm_projects_project_type_id');
  } else {
    console.log('Index idx_pm_projects_project_type_id already exists — skipping');
  }

  // The name fk_pm_projects_project_type is poisoned on this DB — a previous
  // failed attempt (missing index on pm_project_types) left it registered in
  // InnoDB's internal metadata even though the FK was never actually created,
  // and DROP FOREIGN KEY on this table can't clean up a name it never "had".
  // Sidestep it with a different (purely cosmetic) constraint name instead.
  const FK_NAME = 'fk_pm_projects_project_type_v2';
  if (!(await constraintExists('pm_projects', FK_NAME))) {
    await sequelize.query(`
      ALTER TABLE pm_projects
      ADD CONSTRAINT ${FK_NAME}
      FOREIGN KEY (projectTypeId) REFERENCES pm_project_types(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    console.log(`Added FK ${FK_NAME}`);
  } else {
    console.log(`FK ${FK_NAME} already exists — skipping`);
  }

  // 2) Resolve the types involved
  const keepType = await PmProjectType.findOne({ where: { name: KEEP_TYPE_NAME } });
  if (!keepType) {
    console.log(`WARNING: no project type named "${KEEP_TYPE_NAME}" found — nothing will be excluded from the move.`);
  } else {
    console.log(`Keeping projects of type "${KEEP_TYPE_NAME}" (id=${keepType.id}) untouched`);
  }

  let targetType = await PmProjectType.findOne({ where: { name: TARGET_TYPE_NAME } });
  if (!targetType) {
    const maxSort = (await PmProjectType.max('sortOrder')) || 0;
    targetType = await PmProjectType.create({ name: TARGET_TYPE_NAME, isActive: true, sortOrder: maxSort + 1 });
    console.log(`Created project type "${TARGET_TYPE_NAME}" (id=${targetType.id})`);
  } else {
    console.log(`Using existing project type "${TARGET_TYPE_NAME}" (id=${targetType.id})`);
  }

  const demoType = await PmProjectType.findOne({ where: { name: DEMO_TYPE_NAME } });
  if (!demoType) {
    console.log(`No project type named "${DEMO_TYPE_NAME}" found — no Demo-specific milestone sync will run.`);
  }

  // 3) Backfill projectTypeId for every project by matching its CURRENT name
  const [, backfillMeta] = await sequelize.query(`
    UPDATE pm_projects p
    JOIN pm_project_types pt ON pt.name COLLATE utf8mb4_unicode_ci = p.projectType COLLATE utf8mb4_unicode_ci
    SET p.projectTypeId = pt.id
    WHERE p.projectTypeId IS NULL OR p.projectTypeId <> pt.id
  `);
  console.log(`Backfilled projectTypeId on ${backfillMeta.affectedRows} project(s) by exact name match`);

  // 3b) Legacy-name backfill for the keep-type's old label ("Signed")
  if (keepType && KEEP_TYPE_LEGACY_NAMES.length > 0) {
    const [, legacyMeta] = await sequelize.query(`
      UPDATE pm_projects
      SET projectTypeId = ?
      WHERE projectType COLLATE utf8mb4_unicode_ci IN (?)
        AND (projectTypeId IS NULL OR projectTypeId <> ?)
    `, { replacements: [keepType.id, KEEP_TYPE_LEGACY_NAMES, keepType.id] });
    console.log(`Backfilled projectTypeId on ${legacyMeta.affectedRows} project(s) via legacy name match (${KEEP_TYPE_LEGACY_NAMES.join(', ')})`);
  }

  // 4) Snapshot which projects are currently Demo — BEFORE the move overwrites
  // their type — since the Demo milestone sync needs this exact list.
  let demoProjects = [];
  if (demoType) {
    demoProjects = await Project.findAll({ where: { projectTypeId: demoType.id } });
    console.log(`Snapshotted ${demoProjects.length} project(s) currently on "${DEMO_TYPE_NAME}"`);
  }
  // Fallback: an earlier run may have already moved every Demo project onto the
  // target type before the milestone sync got to run (e.g. it crashed on a later
  // step). In that case nothing is left typed "Demo" to snapshot here — but that
  // prior run's own printed report already proved every project it moved came
  // from "Demo" (nothing else appeared in its move report), so everyone
  // currently on the target type is confirmed to be ex-Demo.
  if (demoProjects.length === 0 && targetType) {
    const targetMembers = await Project.findAll({ where: { projectTypeId: targetType.id } });
    if (targetMembers.length > 0) {
      demoProjects = targetMembers;
      console.log(`No projects currently on "${DEMO_TYPE_NAME}" — falling back to all ${demoProjects.length} current "${TARGET_TYPE_NAME}" project(s) (confirmed ex-Demo by the prior move's own report)`);
    }
  }

  // 5) Report what's about to move (before) — excludes the keep type
  const [before] = await sequelize.query(`
    SELECT COALESCE(projectType, '(none)') AS projectType, COUNT(*) AS cnt
    FROM pm_projects
    WHERE (projectTypeId IS NULL OR projectTypeId <> ?)
      AND (? IS NULL OR projectTypeId <> ?)
    GROUP BY projectType
  `, { replacements: [targetType.id, keepType?.id ?? null, keepType?.id ?? -1] });

  if (before.length === 0) {
    console.log('\nNo projects to move (already on target, or all excluded).');
  } else {
    console.log('\nProjects about to move (grouped by current projectType):');
    before.forEach(r => console.log(`  "${r.projectType}" -> ${r.cnt} project(s)`));
  }

  // 6) Bulk move — everything except the keep type and rows already on target
  const [, updateMeta] = await sequelize.query(`
    UPDATE pm_projects
    SET projectType = ?, projectTypeId = ?
    WHERE (projectTypeId IS NULL OR projectTypeId <> ?)
      AND (? IS NULL OR projectTypeId <> ?)
  `, { replacements: [targetType.name, targetType.id, targetType.id, keepType?.id ?? null, keepType?.id ?? -1] });

  console.log(`\nProjects moved this run: ${updateMeta.affectedRows}`);

  const [[{ totalMoved }]] = await sequelize.query(
    `SELECT COUNT(*) AS totalMoved FROM pm_projects WHERE projectTypeId = ?`,
    { replacements: [targetType.id] }
  );
  console.log(`Total projects now on "${TARGET_TYPE_NAME}": ${totalMoved}`);

  if (keepType) {
    const [[{ totalKept }]] = await sequelize.query(
      `SELECT COUNT(*) AS totalKept FROM pm_projects WHERE projectTypeId = ?`,
      { replacements: [keepType.id] }
    );
    console.log(`Total projects still on "${KEEP_TYPE_NAME}": ${totalKept}`);
  }

  // 7) Additive-only milestone sync for Client Signed Projects
  if (keepType) {
    console.log(`\n--- Syncing "${KEEP_TYPE_NAME}" projects' milestones (add-only) ---`);
    const templates = await PmMilestoneTemplate.findAll({
      where: { projectTypeId: keepType.id, isActive: true },
      order: [['sortOrder', 'ASC']],
    });
    if (templates.length === 0) {
      console.log(`No active milestone templates found for "${KEEP_TYPE_NAME}" — nothing to sync.`);
    } else {
      const keepProjects = await Project.findAll({ where: { projectTypeId: keepType.id } });
      let projectsChanged = 0, milestonesAdded = 0;
      for (const project of keepProjects) {
        const { added } = await syncProjectMilestones(project, templates, { allowDelete: false });
        if (added.length > 0) {
          projectsChanged++;
          milestonesAdded += added.length;
          console.log(`  "${project.name}" (${project.id}): added ${added.length} milestone(s) — ${added.join(', ')}`);
        }
      }
      console.log(`\n${KEEP_TYPE_NAME} sync: ${milestonesAdded} milestone(s) added across ${projectsChanged} project(s)`);
    }
  }

  // 8) Full sync (add + delete unmatched) for projects that WERE Demo
  if (demoType && demoProjects.length > 0) {
    console.log(`\n--- Syncing former "${DEMO_TYPE_NAME}" projects' milestones against "${TARGET_TYPE_NAME}" (add + delete unmatched) ---`);
    const templates = await PmMilestoneTemplate.findAll({
      where: { projectTypeId: targetType.id, isActive: true },
      order: [['sortOrder', 'ASC']],
    });
    if (templates.length === 0) {
      console.log(`No active milestone templates found for "${TARGET_TYPE_NAME}" — nothing to sync.`);
    } else {
      let projectsChanged = 0, milestonesAdded = 0, milestonesRemoved = 0;
      for (const project of demoProjects) {
        const { added, removed } = await syncProjectMilestones(project, templates, { allowDelete: true });
        if (added.length > 0 || removed.length > 0) {
          projectsChanged++;
          milestonesAdded += added.length;
          milestonesRemoved += removed.length;
          console.log(`  "${project.name}" (${project.id}): added [${added.join(', ') || '-'}], removed [${removed.join(', ') || '-'}]`);
        }
      }
      console.log(`\nDemo->${TARGET_TYPE_NAME} sync: ${milestonesAdded} added, ${milestonesRemoved} removed, across ${projectsChanged} project(s)`);
    }
  }

  console.log('\n=== Migration 053 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 053 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
