const Milestone              = require('../../models/pm/Milestone');
const PmMilestoneTemplate    = require('../../models/pm/PmMilestoneTemplate');
const PmMilestoneDateLog     = require('../../models/pm/PmMilestoneDateLog');
const Task                   = require('../../models/pm/Task');
const Project                = require('../../models/pm/Project');
const ProjectMember          = require('../../models/pm/ProjectMember');
const User                   = require('../../models/User');
const { randomUUID }         = require('crypto');
// config/database exports the Sequelize instance directly — do NOT destructure
const sequelize              = require('../../config/database');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../utils/errors');

async function logDateChange(milestoneId, changedById, field, oldValue, newValue, reason) {
  try {
    await PmMilestoneDateLog.create({
      id: require('crypto').randomUUID(),
      milestoneId,
      changedById,
      field,
      oldValue: oldValue || null,
      newValue: newValue || null,
      reason: reason || null,
    });
  } catch (e) {
    // Non-fatal — log but don't block the update
    console.error('[DateLog] Failed to log date change:', e.message);
  }
}

const MANAGERS = ['admin', 'manager', 'senior_manager'];

/**
 * Weight budget guard.
 *
 * Milestone weights are shares of a 100% budget:
 *   - top-level milestones (parentMilestoneId = null) share the PROJECT's 100%
 *   - sub-milestones share their PARENT milestone's 100%
 *
 * Throws ValidationError if applying `newWeight` would push the group over 100%.
 * `excludeMilestoneId` is the row being edited, so its own current value is not
 * double-counted (pass null when creating).
 */
async function assertWeightWithinBudget(projectId, parentMilestoneId, excludeMilestoneId, newWeight) {
  if (newWeight == null || Number.isNaN(newWeight)) return;

  const siblings = await Milestone.findAll({
    where: { projectId, parentMilestoneId: parentMilestoneId ?? null },
    attributes: ['id', 'weightPercentage'],
  });

  const othersTotal = siblings
    .filter(m => String(m.id) !== String(excludeMilestoneId))
    .reduce((sum, m) => sum + (m.weightPercentage != null ? Number(m.weightPercentage) : 0), 0);

  const projected = othersTotal + newWeight;

  // Tolerance for DECIMAL(5,2) float noise
  if (projected > 100.009) {
    const remaining = Math.max(0, Math.round((100 - othersTotal) * 100) / 100);
    const scope = parentMilestoneId ? 'this milestone' : 'this project';
    throw new ValidationError(
      `Cannot set weight to ${newWeight}% — ${scope} would total ${Math.round(projected * 100) / 100}%. ` +
      `Only ${remaining}% remains. Reduce another milestone's weight first.`
    );
  }
}

function canManage(user, project) {
  if (MANAGERS.includes(user.role)) return true;
  if (String(project.managerId) === String(user._id ?? user.id)) return true;
  return false;
}

async function assertProjectVisible(projectId, user) {
  if (['admin', 'md', 'director', 'hr_admin', 'final_approver'].includes(user.role)) return;
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId', 'accountManagerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  const uid = String(user._id ?? user.id);
  const visible =
    String(project.managerId)        === uid ||
    String(project.ownerId)          === uid ||
    String(project.accountManagerId) === uid ||
    (project.members || []).some(m => String(m.userId) === uid);
  if (!visible) throw new ForbiddenError('Access denied to this project');
}

// ── GET milestones — returns nested tree ─────────────────────────────────────
// Returns: [defaultMilestone, ...] each with subMilestones array
const getMilestones = async (projectId, user) => {
  await assertProjectVisible(projectId, user);

  // Fetch all milestones for this project
  const all = await Milestone.findAll({
    where: { projectId },
    include: [
      { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'] },
      {
        model: Task, as: 'tasks',
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] }],
      },
    ],
    order: [['order', 'ASC'], ['createdAt', 'ASC']],
  });

  // Build nested tree: top-level first (parentMilestoneId IS NULL), then children
  const topLevel = all.filter(m => !m.parentMilestoneId);
  const children = all.filter(m => !!m.parentMilestoneId);

  const tree = topLevel.map(m => {
    const plain = m.toJSON();
    plain.subMilestones = children
      .filter(c => String(c.parentMilestoneId) === String(m.id))
      .map(c => c.toJSON())
      .sort((a, b) => a.order - b.order || new Date(a.createdAt) - new Date(b.createdAt));
    return plain;
  });

  return tree;
};

// ── CREATE default milestone (from template, auto-created on project creation) ─
const createDefaultMilestones = async (projectId, projectType) => {
  const txn = await sequelize.transaction();
  try {
    const templates = await PmMilestoneTemplate.findAll({
      where: { projectType, isActive: true },
      order: [['sortOrder', 'ASC']],
    });

    if (templates.length === 0) {
      // Fallback: single "Development" default milestone
      await Milestone.create({
        id: randomUUID(), projectId,
        name: 'Development', isDefault: true,
        weightPercentage: 100, minPct: 0, maxPct: 100,
        status: 'not_started', order: 1,
      }, { transaction: txn });
      await txn.commit();
      return;
    }

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      // Create the parent (phase) milestone from the template.
      // Sub-milestones are NOT auto-created — PM adds them manually under each phase.
      await Milestone.create({
        id: randomUUID(), projectId,
        name: t.name, isDefault: true,
        minPct: t.minPct, maxPct: t.maxPct,
        weightPercentage: null, // PM fills this later
        status: 'not_started', order: t.sortOrder || i + 1,
        parentMilestoneId: null,
      }, { transaction: txn });
    }

    await txn.commit();
  } catch (err) {
    await txn.rollback();
    throw err;
  }
};

// ── CREATE top-level milestone (manager adds new default milestone) ────────────
const createMilestone = async (projectId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Only project manager or admin can create milestones');

  // Guard: a new top-level milestone must fit inside the project's 100% budget
  if (data.weightPercentage != null) {
    await assertWeightWithinBudget(projectId, null, null, Number(data.weightPercentage));
  }

  const maxOrder = await Milestone.max('order', { where: { projectId, parentMilestoneId: null } }) || 0;
  return Milestone.create({
    ...data,
    projectId,
    parentMilestoneId: null,
    isDefault: data.isDefault ?? true,
    order: data.order ?? maxOrder + 1,
  });
};

// ── CREATE sub-milestone (PM adds under a default milestone) ──────────────────
const createSubMilestone = async (projectId, parentMilestoneId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Only project manager or admin can add sub-milestones');

  const parent = await Milestone.findOne({ where: { id: parentMilestoneId, projectId } });
  if (!parent) throw new NotFoundError('Parent milestone');

  // Guard: sub-milestones share their parent's 100% budget
  if (data.weightPercentage != null) {
    await assertWeightWithinBudget(projectId, parentMilestoneId, null, Number(data.weightPercentage));
  }

  const maxOrder = await Milestone.max('order', { where: { projectId, parentMilestoneId } }) || 0;
  return Milestone.create({
    name:              data.name,
    description:       data.description,
    weightPercentage:  data.weightPercentage,
    accountableUserId: data.accountableUserId,
    plannedStartDate:  data.plannedStartDate,
    plannedEndDate:    data.plannedEndDate,
    type:              data.type,
    projectId,
    parentMilestoneId,
    isDefault: false,
    order: maxOrder + 1,
  });
};

// ── UPDATE milestone ──────────────────────────────────────────────────────────
const updateMilestone = async (projectId, milestoneId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');

  const isAccountable = String(milestone.accountableUserId) === String(user._id ?? user.id);
  const isStatusOrProgressOnly = Object.keys(data).every(k =>
    ['status', 'completionPercentage'].includes(k)
  );

  if (!canManage(user, project)) {
    if (!isAccountable || !isStatusOrProgressOnly) {
      throw new ForbiddenError('Not authorized to update this milestone');
    }
  }

  // ── HARD GUARD: total weight across a project's top-level milestones ≤ 100% ──
  // Enforced here (not just in the UI) because the bulk-import path and any direct
  // API call bypass the frontend entirely.
  if (data.weightPercentage !== undefined && data.weightPercentage !== null) {
    await assertWeightWithinBudget(
      projectId,
      milestone.parentMilestoneId,   // null → project budget; set → parent's budget
      milestoneId,                   // exclude self from the running total
      Number(data.weightPercentage),
    );
  }

  // Validate weightPercentage against the template range — advisory only
  let weightWarning = null;
  if (data.weightPercentage !== undefined && milestone.isDefault &&
      milestone.minPct !== null && milestone.maxPct !== null) {
    const w = Number(data.weightPercentage);
    if (w < Number(milestone.minPct) || w > Number(milestone.maxPct)) {
      weightWarning = `Weight ${w}% is outside the recommended range (${milestone.minPct}%–${milestone.maxPct}%)`;
    }
  }

  const previousStatus = milestone.status;
  Object.assign(milestone, data);
  await milestone.save();

  // Email alert on milestone completion
  const isNowCompleted = data.status?.toLowerCase() === 'completed';
  const wasPreviouslyCompleted = previousStatus?.toLowerCase() === 'completed';
  if (isNowCompleted && !wasPreviouslyCompleted) {
    try {
      const PmSettings = require('../../models/pm/PmSettings');
      const alertSettings = await PmSettings.findByPk(1);
      if (alertSettings?.emailAlertOnMilestoneComplete) {
        const { sendEmail } = require('../../utils/emailService');
        const ccList = alertSettings.reportCcEmails || [];
        if (ccList.length > 0) {
          // Non-fatal send — sendEmail already handles errors internally
          await sendEmail(
            ccList,
            `[PM] Milestone Completed: ${milestone.name}`,
            `<p>Milestone <strong>${milestone.name}</strong> has been marked as completed.</p>
             <p>Project ID: ${milestone.projectId}</p>`,
          );
        }
      }
    } catch (e) {
      console.error('[PM Alert] Milestone complete alert failed:', e.message);
    }
  }

  return { ...milestone.toJSON(), weightWarning };
};

// ── DELETE milestone ──────────────────────────────────────────────────────────
const deleteMilestone = async (projectId, milestoneId, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');
  await milestone.destroy();
};

const updateMilestoneStatus   = (pid, mid, status, user)   => updateMilestone(pid, mid, { status }, user);
const updateMilestoneProgress = (pid, mid, pct, user)      => updateMilestone(pid, mid, { completionPercentage: pct }, user);

// ── UPDATE planned dates ──────────────────────────────────────────────────────
async function updateMilestonePlannedDates(projectId, milestoneId, data, user) {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized to update milestone dates');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone not found');

  const { plannedStartDate, plannedEndDate, reason } = data;

  // Business rule: planned dates are write-once. Reject any attempt to overwrite an existing value.
  if (plannedStartDate !== undefined && milestone.plannedStartDate) {
    throw new ValidationError('Planned start date is already set and cannot be changed');
  }
  if (plannedEndDate !== undefined && milestone.plannedEndDate) {
    throw new ValidationError('Planned end date is already set and cannot be changed');
  }

  const dateFields = { plannedStartDate, plannedEndDate };
  // Filter out undefined AND null — only update fields that are explicitly provided with a real value
  const filtered = Object.fromEntries(Object.entries(dateFields).filter(([, v]) => v !== undefined && v !== null));

  if (Object.keys(filtered).length === 0) return milestone.toJSON();

  // Log changes for each date field that changed
  for (const [field, newVal] of Object.entries(filtered)) {
    if (milestone[field] !== newVal) {
      await logDateChange(milestoneId, user._id || user.id, field, milestone[field], newVal, reason);
    }
  }

  await milestone.update(filtered);

  // Deadline alert: if plannedEndDate set and < 7 days away and completion < 80%
  let alert = null;
  const end = milestone.plannedEndDate || plannedEndDate;
  if (end) {
    const daysLeft = Math.ceil((new Date(end) - new Date()) / 86400000);
    if (daysLeft <= 7 && daysLeft >= 0 && milestone.completionPercentage < 80) {
      alert = 'deadline_near';
    }
  }

  return { ...milestone.toJSON(), alert };
}

// ── UPDATE actual dates ───────────────────────────────────────────────────────
async function updateMilestoneActualDates(projectId, milestoneId, data, user) {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized to update milestone dates');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone not found');

  const { actualStartDate, actualEndDate, reason } = data;

  // Service-layer date ordering guard — enforced here so any call path (not just
  // the controller) is protected against inverted date ranges.
  if (actualStartDate && actualEndDate && new Date(actualStartDate) > new Date(actualEndDate)) {
    throw new ValidationError('actualStartDate must be on or before actualEndDate');
  }

  // Dependency check: cannot close parent if sub-milestones are open
  // Fetch subs manually (avoids relying on an undefined Sequelize self-association)
  if (actualEndDate) {
    const subMilestones = await Milestone.findAll({
      where: { projectId, parentMilestoneId: milestoneId },
      attributes: ['id', 'status', 'actualEndDate'],
    });
    const blocking = subMilestones.filter(
      sm => sm.actualEndDate === null && sm.status !== 'cancelled'
    );
    if (blocking.length > 0) {
      throw new ValidationError(`Cannot set actual end date: ${blocking.length} sub-milestone(s) are not yet completed`);
    }
  }

  const dateFields = { actualStartDate, actualEndDate };
  const filtered = Object.fromEntries(Object.entries(dateFields).filter(([, v]) => v !== undefined));

  for (const [field, newVal] of Object.entries(filtered)) {
    if (milestone[field] !== newVal) {
      await logDateChange(milestoneId, user._id || user.id, field, milestone[field], newVal, reason);
    }
  }

  await milestone.update(filtered);
  return milestone.toJSON();
}

module.exports = {
  getMilestones, createDefaultMilestones,
  createMilestone, createSubMilestone,
  updateMilestone, deleteMilestone,
  updateMilestoneStatus, updateMilestoneProgress,
  updateMilestonePlannedDates, updateMilestoneActualDates,
};
