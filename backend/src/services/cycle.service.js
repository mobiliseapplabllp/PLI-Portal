const AppraisalCycle = require('../models/AppraisalCycle');
const User = require('../models/User');
const { NotFoundError } = require('../utils/errors');
const { getQuarterFromMonth } = require('../utils/quarterHelper');
const { createAuditLog } = require('../middleware/auditLogger');

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

  const oldValue = { status: cycle.status };
  Object.assign(cycle, data);
  await cycle.save();

  await createAuditLog({
    entityType: 'appraisal_cycle',
    entityId: cycle.id,
    action: 'updated',
    changedBy: updatedBy,
    oldValue,
    newValue: data,
  });

  return cycle;
};

module.exports = { getCycles, createCycle, updateCycle };
