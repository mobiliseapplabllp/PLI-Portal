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

/**
 * Sub-milestone weights are ALWAYS an equal split of their parent's 100%:
 * 5 subs → 20.00 each. DECIMAL(5,2) cannot hold 100/3 exactly, so every sub
 * gets the 2-decimal floor and the last one takes the remainder
 * (33.33 / 33.33 / 33.34) — the group always totals exactly 100.00.
 *
 * Shown to users as a share of the PROJECT too: parent 10% × 20% = 2%.
 */
function equalSplit(n) {
  if (n <= 0) return [];
  const base = Math.floor(10000 / n) / 100;
  const last = Math.round((100 - base * (n - 1)) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? last : base));
}

async function rebalanceSubWeights(parentMilestoneId, transaction) {
  const subs = await Milestone.findAll({
    where: { parentMilestoneId },
    order: [['order', 'ASC'], ['createdAt', 'ASC']],
    transaction,
  });
  const weights = equalSplit(subs.length);
  for (let i = 0; i < subs.length; i++) {
    if (Number(subs[i].weightPercentage) !== weights[i]) {
      await subs[i].update({ weightPercentage: weights[i] }, { transaction });
    }
  }
}

/**
 * A parent with sub-milestones takes its progress from them:
 *   parent % = Σ(sub progress × sub share of parent) ÷ 100
 * Worked example: 5 subs at 20% each, one at 50% → 50 × 20 ÷ 100 = 10% complete.
 * A parent with no subs keeps its manually entered progress. Status is untouched.
 */
function rolledUpProgress(subs) {
  const earned = subs.reduce(
    (sum, s) => sum + (Number(s.completionPercentage) || 0) * (Number(s.weightPercentage) || 0) / 100,
    0,
  );
  return Math.max(0, Math.min(100, Math.round(earned)));
}

async function rollupParentProgress(parentMilestoneId, transaction) {
  const parent = await Milestone.findByPk(parentMilestoneId, { transaction });
  if (!parent) return null;
  const subs = await Milestone.findAll({
    where: { parentMilestoneId },
    attributes: ['id', 'completionPercentage', 'weightPercentage'],
    transaction,
  });
  if (subs.length === 0) return parent;
  const pct = rolledUpProgress(subs);
  if (Number(parent.completionPercentage) !== pct) {
    await parent.update({ completionPercentage: pct }, { transaction });
  }
  return parent;
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

  // Sub weight is never taken from the request — it is an equal split of the
  // parent, recalculated for every sibling. The parent's progress follows.
  const t = await sequelize.transaction();
  try {
    const maxOrder = await Milestone.max('order', { where: { projectId, parentMilestoneId }, transaction: t }) || 0;
    const sub = await Milestone.create({
      name:              data.name,
      description:       data.description,
      accountableUserId: data.accountableUserId,
      plannedStartDate:  data.plannedStartDate,
      plannedEndDate:    data.plannedEndDate,
      type:              data.type,
      projectId,
      parentMilestoneId,
      isDefault: false,
      order: maxOrder + 1,
    }, { transaction: t });
    await rebalanceSubWeights(parentMilestoneId, t);
    const updatedParent = await rollupParentProgress(parentMilestoneId, t);
    await t.commit();
    await sub.reload();
    return { ...sub.toJSON(), parentMilestone: pickParent(updatedParent) };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

/** The parent fields the UI refreshes after a sub changes. */
function pickParent(p) {
  return p ? { id: p.id, completionPercentage: p.completionPercentage, weightPercentage: p.weightPercentage } : null;
}

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

  const isSub = !!milestone.parentMilestoneId;

  // Sub weight is an automatic equal split — it cannot be typed. A value equal to
  // the stored one is ignored so an edit form that echoes it back still saves.
  if (isSub && data.weightPercentage !== undefined && data.weightPercentage !== null) {
    if (Number(data.weightPercentage) !== Number(milestone.weightPercentage)) {
      throw new ValidationError('Sub-milestone weight is calculated automatically (an equal share of its milestone)');
    }
    delete data.weightPercentage;
  }

  // A milestone with sub-milestones takes its progress from them.
  if (!isSub && data.completionPercentage !== undefined && data.completionPercentage !== null) {
    const subCount = await Milestone.count({ where: { parentMilestoneId: milestoneId } });
    if (subCount > 0) {
      if (Number(data.completionPercentage) !== Number(milestone.completionPercentage)) {
        throw new ValidationError('Progress is calculated from its sub-milestones — update those instead');
      }
      delete data.completionPercentage;
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
  const progressChanged = data.completionPercentage !== undefined &&
    Number(data.completionPercentage) !== Number(milestone.completionPercentage);

  let updatedParent = null;
  const t = await sequelize.transaction();
  try {
    Object.assign(milestone, data);
    await milestone.save({ transaction: t });
    if (isSub && progressChanged) {
      updatedParent = await rollupParentProgress(milestone.parentMilestoneId, t);
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

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

  return { ...milestone.toJSON(), weightWarning, parentMilestone: pickParent(updatedParent) };
};

// ── DELETE milestone ──────────────────────────────────────────────────────────
const deleteMilestone = async (projectId, milestoneId, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');

  const parentId = milestone.parentMilestoneId;
  const t = await sequelize.transaction();
  try {
    await milestone.destroy({ transaction: t });
    // Removing a sub re-splits its siblings and recomputes the parent. With no
    // subs left the parent keeps its last value and becomes manual again.
    if (parentId) {
      await rebalanceSubWeights(parentId, t);
      await rollupParentProgress(parentId, t);
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

const updateMilestoneStatus   = (pid, mid, status, user)   => updateMilestone(pid, mid, { status }, user);
const updateMilestoneProgress = (pid, mid, pct, user)      => updateMilestone(pid, mid, { completionPercentage: pct }, user);

// ── UPDATE planned dates ──────────────────────────────────────────────────────
// ── Planned-date lock control (admin only) ───────────────────────────────────
// Two-step re-baseline: an admin unlocks a milestone (with a reason), then a
// manager resets the planned dates. The unlock is consumed by that one write.

async function unlockPlannedDates(projectId, milestoneId, reason, user) {
  if (user.role !== 'admin') throw new ForbiddenError('Only an admin can unlock planned dates');
  if (!reason || !String(reason).trim()) throw new ValidationError('A reason is required to unlock planned dates');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone not found');

  if (milestone.plannedDatesUnlockedAt) {
    // Already unlocked — idempotent, nothing to do
    return milestone.toJSON();
  }

  const uid = String(user._id ?? user.id);
  await milestone.update({ plannedDatesUnlockedAt: new Date(), plannedDatesUnlockedBy: uid });

  // Audit: who authorised the change and why. The manager's actual edit is
  // logged separately by updateMilestonePlannedDates, so the trail shows both.
  await logDateChange(milestoneId, uid, 'plannedDatesUnlock', null, null, reason);

  return milestone.toJSON();
}

async function lockPlannedDates(projectId, milestoneId, user) {
  if (user.role !== 'admin') throw new ForbiddenError('Only an admin can lock planned dates');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone not found');

  if (!milestone.plannedDatesUnlockedAt) return milestone.toJSON();   // already locked

  const uid = String(user._id ?? user.id);
  await milestone.update({ plannedDatesUnlockedAt: null, plannedDatesUnlockedBy: null });
  await logDateChange(milestoneId, uid, 'plannedDatesLock', null, null, 'Re-locked by admin without a change');

  return milestone.toJSON();
}

async function updateMilestonePlannedDates(projectId, milestoneId, data, user) {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized to update milestone dates');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone not found');

  const { plannedStartDate, plannedEndDate, reason } = data;

  // Planned dates are the baseline and lock once set. Changing a set date
  // requires an admin to have UNLOCKED this milestone first (see
  // unlockPlannedDates). The unlock is consumed by this one write — the
  // dates re-lock automatically below. Old values go to pm_milestone_date_logs.
  const alreadySet =
    (plannedStartDate !== undefined && milestone.plannedStartDate) ||
    (plannedEndDate   !== undefined && milestone.plannedEndDate);
  const unlocked = !!milestone.plannedDatesUnlockedAt;

  if (alreadySet && !unlocked) {
    throw new ValidationError('Planned dates are locked. Ask an admin to unlock this milestone before changing them.');
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

  // Consume the unlock: the baseline re-locks after this single change.
  if (alreadySet && unlocked) {
    filtered.plannedDatesUnlockedAt = null;
    filtered.plannedDatesUnlockedBy = null;
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
  unlockPlannedDates, lockPlannedDates,
  // weight split + progress roll-up (also used by migration 049 and tests)
  equalSplit, rolledUpProgress, rebalanceSubWeights, rollupParentProgress,
};
