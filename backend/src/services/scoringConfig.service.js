const ScoringConfig = require('../models/ScoringConfig');
const User = require('../models/User');
const QuarterlyApproval = require('../models/QuarterlyApproval');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../config/constants');

/**
 * List all scoring configs, optionally filtered by financialYear/quarter.
 */
const getConfigs = async (query = {}) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.quarter) where.quarter = query.quarter;

  return ScoringConfig.findAll({
    where,
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [['financialYear', 'DESC'], ['quarter', 'ASC']],
  });
};

/**
 * Fetch the active scoring config for a specific FY+Quarter.
 * Returns null if not found — callers must fall back to defaults.
 */
const getActiveConfig = async (financialYear, quarter) => {
  return ScoringConfig.findOne({
    where: { financialYear, quarter, isActive: true },
  });
};

/**
 * Create a new scoring config for a FY+Quarter.
 * Blocks duplicate periods.
 * Notifies all final approvers.
 */
const createConfig = async (data, userId) => {
  const existing = await ScoringConfig.findOne({
    where: { financialYear: data.financialYear, quarter: data.quarter },
  });
  if (existing) {
    throw new ConflictError(
      `A scoring config already exists for ${data.financialYear} ${data.quarter}. Edit the existing one.`
    );
  }

  const config = await ScoringConfig.create({
    financialYear: data.financialYear,
    quarter: data.quarter,
    meetsMultiplier:   data.meetsMultiplier   ?? 1.0,
    belowMultiplier:   data.belowMultiplier   ?? -0.5,
    exceedsMultiplier: data.exceedsMultiplier ?? 1.5,
    isActive: data.isActive !== false,
    createdById: userId,
  });

  await createAuditLog({
    entityType: 'scoring_config',
    entityId: config.id,
    action: 'created',
    changedBy: userId,
    newValue: {
      financialYear: config.financialYear,
      quarter: config.quarter,
      meetsMultiplier: config.meetsMultiplier,
      belowMultiplier: config.belowMultiplier,
      exceedsMultiplier: config.exceedsMultiplier,
    },
  });

  await _notifyFinalApprovers(userId, config.financialYear, config.quarter, 'created');

  return ScoringConfig.findByPk(config.id, {
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
  });
};

/**
 * Update multipliers or isActive for an existing config.
 * Blocked if any quarterly approval has been submitted for that FY+Quarter.
 */
const updateConfig = async (id, data, userId) => {
  const config = await ScoringConfig.findByPk(id);
  if (!config) throw new NotFoundError('Scoring Config');

  // Lock check — cannot change multipliers after submissions exist
  const submissionExists = await QuarterlyApproval.findOne({
    where: {
      financialYear: config.financialYear,
      quarter: config.quarter,
      status: 'approved',
    },
  });
  if (submissionExists) {
    throw new ConflictError(
      `Config locked: quarterly approvals already submitted for ${config.financialYear} ${config.quarter}. Multipliers cannot be changed retroactively.`
    );
  }

  const oldValue = {
    meetsMultiplier:   config.meetsMultiplier,
    belowMultiplier:   config.belowMultiplier,
    exceedsMultiplier: config.exceedsMultiplier,
    isActive:          config.isActive,
  };

  if (data.meetsMultiplier   !== undefined) config.meetsMultiplier   = data.meetsMultiplier;
  if (data.belowMultiplier   !== undefined) config.belowMultiplier   = data.belowMultiplier;
  if (data.exceedsMultiplier !== undefined) config.exceedsMultiplier = data.exceedsMultiplier;
  if (data.isActive          !== undefined) config.isActive          = data.isActive;

  await config.save();

  await createAuditLog({
    entityType: 'scoring_config',
    entityId: config.id,
    action: 'updated',
    changedBy: userId,
    oldValue,
    newValue: {
      meetsMultiplier:   config.meetsMultiplier,
      belowMultiplier:   config.belowMultiplier,
      exceedsMultiplier: config.exceedsMultiplier,
      isActive:          config.isActive,
    },
  });

  await _notifyFinalApprovers(userId, config.financialYear, config.quarter, 'updated');

  return ScoringConfig.findByPk(config.id, {
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
  });
};

/**
 * Notify all active final approvers that scoring config has changed.
 * Fires async — does not block the main response.
 */
const _notifyFinalApprovers = async (actorId, financialYear, quarter, action) => {
  try {
    const finalApprovers = await User.findAll({
      where: { role: 'final_approver', isActive: true },
      attributes: ['id'],
    });

    await Promise.allSettled(
      finalApprovers
        .filter((fa) => fa.id !== actorId)
        .map((fa) =>
          notificationService.create({
            recipient: fa.id,
            type: NOTIFICATION_TYPES.SCORING_CONFIG_UPDATED,
            title: 'Scoring rules updated',
            message: `Admin ${action} KPI scoring multipliers for ${financialYear} ${quarter}. Please reload your workbench if it is open.`,
          })
        )
    );
  } catch (err) {
    console.error('[ScoringConfig] Notify FA error:', err.message);
  }
};

module.exports = { getConfigs, getActiveConfig, createConfig, updateConfig };
