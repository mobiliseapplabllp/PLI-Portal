const { Op } = require('sequelize');
const AppraisalCycle = require('../models/AppraisalCycle');
const User = require('../models/User');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { getQuarterFromMonth, getMonthName } = require('../utils/quarterHelper');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendCycleOpenedEmail } = require('../utils/emailService');
const { NOTIFICATION_TYPES } = require('../config/constants');

const getCycles = async (query = {}) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.quarter) where.quarter = query.quarter;
  if (query.status) where.status = query.status;
  if (query.departmentId) where.departmentId = query.departmentId;

  return AppraisalCycle.findAll({
    where,
    include: [
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
    ],
    order: [
      ['financialYear', 'DESC'],
      ['month', 'DESC'],
    ],
  });
};

/**
 * Resolve the cycle that applies to a given department for a (financialYear,
 * month) — the department-specific row if one exists, else the global
 * (departmentId=NULL) fallback row. This is the ONLY place deadline lookups
 * should go through, so every caller gets department-aware behavior for free.
 * @param {string} financialYear
 * @param {number} month
 * @param {string|null} departmentId — null is valid (resolves straight to global)
 */
const resolveCycleForDepartment = async (financialYear, month, departmentId = null) => {
  if (departmentId) {
    const specific = await AppraisalCycle.findOne({ where: { financialYear, month, departmentId } });
    if (specific) return specific;
  }
  return AppraisalCycle.findOne({ where: { financialYear, month, departmentId: null } });
};

const createCycle = async (data, createdBy) => {
  const payload = { ...data };
  payload.departmentId = data.departmentId || null;
  payload.quarter = getQuarterFromMonth(data.month);
  payload.createdById = createdBy;

  const existing = await AppraisalCycle.findOne({
    where: { financialYear: payload.financialYear, month: payload.month, departmentId: payload.departmentId },
  });
  if (existing) {
    throw new ConflictError(
      payload.departmentId
        ? `A cycle already exists for this department in ${payload.financialYear} month ${payload.month}. Edit the existing one instead.`
        : `A global cycle already exists for ${payload.financialYear} month ${payload.month}. Edit the existing one instead.`
    );
  }

  const cycle = await AppraisalCycle.create(payload);

  await createAuditLog({
    entityType: 'appraisal_cycle',
    entityId: cycle.id,
    action: 'created',
    changedBy: createdBy,
    newValue: { financialYear: cycle.financialYear, month: cycle.month, quarter: cycle.quarter, departmentId: cycle.departmentId },
  });

  return cycle;
};

const updateCycle = async (id, data, updatedBy) => {
  const cycle = await AppraisalCycle.findByPk(id);
  if (!cycle) throw new NotFoundError('Appraisal Cycle');

  // Moving a cycle to a different department (or to/from global) must not collide
  // with another cycle already sitting on that (financialYear, month, departmentId).
  if ('departmentId' in data) {
    const nextDeptId = data.departmentId || null;
    if (nextDeptId !== cycle.departmentId) {
      const conflict = await AppraisalCycle.findOne({
        where: { financialYear: cycle.financialYear, month: cycle.month, departmentId: nextDeptId, id: { [Op.ne]: cycle.id } },
      });
      if (conflict) {
        throw new ConflictError(
          nextDeptId
            ? `A cycle already exists for this department in ${cycle.financialYear} month ${cycle.month}. Edit that one instead.`
            : `A global cycle already exists for ${cycle.financialYear} month ${cycle.month}. Edit that one instead.`
        );
      }
    }
    data.departmentId = nextDeptId;
  }

  const oldStatus = cycle.status;
  Object.assign(cycle, data);
  await cycle.save();

  await createAuditLog({
    entityType: 'appraisal_cycle',
    entityId: cycle.id,
    action: 'updated',
    changedBy: updatedBy,
    oldValue: { status: oldStatus },
    newValue: data,
  });

  // Auto-notify all employees when a cycle is opened
  if (data.status === 'open' && oldStatus !== 'open') {
    notifyAllEmployeesOnCycleOpen(cycle).catch((err) =>
      console.error('[CycleOpen] Notification error:', err.message)
    );
  }

  return cycle;
};

async function notifyAllEmployeesOnCycleOpen(cycle) {
  const month = getMonthName(cycle.month);
  const year = cycle.financialYear;
  const deadlineText = cycle.commitmentDeadline
    ? new Date(cycle.commitmentDeadline).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null;

  // Department-specific cycle → only that department's employees. Global
  // cycle → every employee EXCEPT those whose department has its own open
  // cycle for this same (financialYear, month) — they're notified separately
  // when THAT cycle opens, with their own department's deadline.
  const empWhere = { role: 'employee', isActive: true };
  if (cycle.departmentId) {
    empWhere.departmentId = cycle.departmentId;
  } else {
    const overrideDeptIds = (await AppraisalCycle.findAll({
      where: { financialYear: cycle.financialYear, month: cycle.month, departmentId: { [Op.ne]: null } },
      attributes: ['departmentId'],
    })).map((c) => c.departmentId);
    if (overrideDeptIds.length) empWhere.departmentId = { [Op.or]: [{ [Op.notIn]: overrideDeptIds }, { [Op.is]: null }] };
  }

  const employees = await User.findAll({
    where: empWhere,
    attributes: ['id', 'name', 'email'],
  });

  for (const emp of employees) {
    await Promise.allSettled([
      Notification.create({
        recipientId: emp.id,
        type: NOTIFICATION_TYPES.CYCLE_DEADLINE,
        title: `KPI Appraisal Cycle Open — ${month} ${year}`,
        message: `The KPI appraisal cycle for ${month} ${year} is now open. Please submit your commitments${deadlineText ? ` by ${deadlineText}` : ''}. If you have already submitted, please ignore this notification.`,
        referenceType: 'appraisal_cycle',
        referenceId: cycle.id,
      }),
      sendCycleOpenedEmail(emp.email, emp.name, month, year, deadlineText),
    ]);
  }
  console.log(`[CycleOpen] Notified ${employees.length} employees for ${month} ${year}`);
}

module.exports = { getCycles, createCycle, updateCycle, resolveCycleForDepartment };
