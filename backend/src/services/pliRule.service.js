const PliRule = require('../models/PliRule');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const getRules = async (query = {}) => {
  const filter = {};
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.quarter) filter.quarter = query.quarter;

  return PliRule.find(filter)
    .populate('createdBy', 'name')
    .sort({ financialYear: -1 });
};

const createRule = async (data, userId) => {
  // Validate slabs don't overlap
  validateSlabs(data.slabs);

  data.createdBy = userId;
  const rule = await PliRule.create(data);

  await createAuditLog({
    entityType: 'pli_rule',
    entityId: rule._id,
    action: 'created',
    changedBy: userId,
    newValue: { financialYear: data.financialYear, quarter: data.quarter },
  });

  return rule;
};

const updateRule = async (id, data, userId) => {
  const rule = await PliRule.findById(id);
  if (!rule) throw new NotFoundError('PLI Rule');

  if (data.slabs) validateSlabs(data.slabs);

  const oldValue = { slabs: rule.slabs, isActive: rule.isActive };
  Object.assign(rule, data);
  await rule.save();

  await createAuditLog({
    entityType: 'pli_rule',
    entityId: rule._id,
    action: 'updated',
    changedBy: userId,
    oldValue,
    newValue: data,
  });

  return rule;
};

function validateSlabs(slabs) {
  // Sort by minScore
  const sorted = [...slabs].sort((a, b) => a.minScore - b.minScore);

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].maxScore >= sorted[i + 1].minScore) {
      throw new ValidationError(
        `Slab overlap detected: [${sorted[i].minScore}-${sorted[i].maxScore}] overlaps with [${sorted[i + 1].minScore}-${sorted[i + 1].maxScore}]`
      );
    }
  }
}

module.exports = { getRules, createRule, updateRule };
