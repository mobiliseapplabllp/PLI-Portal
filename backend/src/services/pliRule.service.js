const sequelize = require('../config/database');
const PliRule = require('../models/PliRule');
const PliSlab = require('../models/PliSlab');
const User = require('../models/User');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const getRules = async (query = {}) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.quarter) where.quarter = query.quarter;

  return PliRule.findAll({
    where,
    include: [
      { model: PliSlab, as: 'slabs', separate: true, order: [['minScore', 'ASC']] },
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
    ],
    order: [['financialYear', 'DESC']],
  });
};

const createRule = async (data, userId) => {
  validateSlabs(data.slabs);

  const t = await sequelize.transaction();
  try {
    const rule = await PliRule.create(
      {
        financialYear: data.financialYear,
        quarter: data.quarter,
        remarks: data.remarks,
        isActive: data.isActive !== false,
        createdById: userId,
      },
      { transaction: t }
    );
    await PliSlab.bulkCreate(
      data.slabs.map((s) => ({
        pliRuleId: rule.id,
        minScore: s.minScore,
        maxScore: s.maxScore,
        payoutPercentage: s.payoutPercentage,
        label: s.label,
      })),
      { transaction: t }
    );
    await t.commit();
    const full = await PliRule.findByPk(rule.id, {
      include: [
        { model: PliSlab, as: 'slabs', separate: true, order: [['minScore', 'ASC']] },
        { model: User, as: 'createdBy', attributes: ['id', 'name'] },
      ],
    });

    await createAuditLog({
      entityType: 'pli_rule',
      entityId: rule.id,
      action: 'created',
      changedBy: userId,
      newValue: { financialYear: data.financialYear, quarter: data.quarter },
    });

    return full;
  } catch (e) {
    await t.rollback();
    throw e;
  }
};

const updateRule = async (id, data, userId) => {
  const rule = await PliRule.findByPk(id, { include: [{ model: PliSlab, as: 'slabs' }] });
  if (!rule) throw new NotFoundError('PLI Rule');

  if (data.slabs) validateSlabs(data.slabs);

  const t = await sequelize.transaction();
  try {
    const oldValue = { slabs: rule.slabs?.map((s) => s.get({ plain: true })), isActive: rule.isActive };
    const patch = { ...data };
    delete patch.slabs;
    Object.assign(rule, patch);
    await rule.save({ transaction: t });

    if (data.slabs) {
      await PliSlab.destroy({ where: { pliRuleId: id }, transaction: t });
      await PliSlab.bulkCreate(
        data.slabs.map((s) => ({
          pliRuleId: id,
          minScore: s.minScore,
          maxScore: s.maxScore,
          payoutPercentage: s.payoutPercentage,
          label: s.label,
        })),
        { transaction: t }
      );
    }
    await t.commit();

    const full = await PliRule.findByPk(id, {
      include: [
        { model: PliSlab, as: 'slabs', separate: true, order: [['minScore', 'ASC']] },
        { model: User, as: 'createdBy', attributes: ['id', 'name'] },
      ],
    });

    await createAuditLog({
      entityType: 'pli_rule',
      entityId: rule.id,
      action: 'updated',
      changedBy: userId,
      oldValue,
      newValue: data,
    });

    return full;
  } catch (e) {
    await t.rollback();
    throw e;
  }
};

function validateSlabs(slabs) {
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
