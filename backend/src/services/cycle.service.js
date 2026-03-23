const AppraisalCycle = require('../models/AppraisalCycle');
const { NotFoundError } = require('../utils/errors');
const { getQuarterFromMonth } = require('../utils/quarterHelper');
const { createAuditLog } = require('../middleware/auditLogger');

const getCycles = async (query = {}) => {
  const filter = {};
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.quarter) filter.quarter = query.quarter;
  if (query.status) filter.status = query.status;

  return AppraisalCycle.find(filter)
    .populate('createdBy', 'name')
    .sort({ financialYear: -1, month: -1 });
};

const createCycle = async (data, createdBy) => {
  // Auto-derive quarter from month
  data.quarter = getQuarterFromMonth(data.month);
  data.createdBy = createdBy;

  const cycle = await AppraisalCycle.create(data);

  await createAuditLog({
    entityType: 'appraisal_cycle',
    entityId: cycle._id,
    action: 'created',
    changedBy: createdBy,
    newValue: { financialYear: cycle.financialYear, month: cycle.month, quarter: cycle.quarter },
  });

  return cycle;
};

const updateCycle = async (id, data, updatedBy) => {
  const cycle = await AppraisalCycle.findById(id);
  if (!cycle) throw new NotFoundError('Appraisal Cycle');

  const oldValue = { status: cycle.status };
  Object.assign(cycle, data);
  await cycle.save();

  await createAuditLog({
    entityType: 'appraisal_cycle',
    entityId: cycle._id,
    action: 'updated',
    changedBy: updatedBy,
    oldValue,
    newValue: data,
  });

  return cycle;
};

module.exports = { getCycles, createCycle, updateCycle };
