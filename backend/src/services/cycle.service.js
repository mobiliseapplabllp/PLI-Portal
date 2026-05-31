const AppraisalCycle = require('../models/AppraisalCycle');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { NotFoundError } = require('../utils/errors');
const { getQuarterFromMonth, getMonthName } = require('../utils/quarterHelper');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendCycleOpenedEmail } = require('../utils/emailService');
const { NOTIFICATION_TYPES } = require('../config/constants');

const getCycles = async (query = {}) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.quarter) where.quarter = query.quarter;
  if (query.status) where.status = query.status;

  return AppraisalCycle.findAll({
    where,
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [
      ['financialYear', 'DESC'],
      ['month', 'DESC'],
    ],
  });
};

const createCycle = async (data, createdBy) => {
  const payload = { ...data };
  payload.quarter = getQuarterFromMonth(data.month);
  payload.createdById = createdBy;

  const cycle = await AppraisalCycle.create(payload);

  await createAuditLog({
    entityType: 'appraisal_cycle',
    entityId: cycle.id,
    action: 'created',
    changedBy: createdBy,
    newValue: { financialYear: cycle.financialYear, month: cycle.month, quarter: cycle.quarter },
  });

  return cycle;
};

const updateCycle = async (id, data, updatedBy) => {
  const cycle = await AppraisalCycle.findByPk(id);
  if (!cycle) throw new NotFoundError('Appraisal Cycle');

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

  const employees = await User.findAll({
    where: { role: 'employee', isActive: true },
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

module.exports = { getCycles, createCycle, updateCycle };
