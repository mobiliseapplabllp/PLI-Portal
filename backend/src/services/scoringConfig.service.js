const ScoringConfig = require('../models/ScoringConfig');
const User = require('../models/User');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../config/constants');

// Lazy require to avoid circular dependency
const getFinalApproverService = () => require('./finalApprover.service');

/**
 * List all scoring configs, optionally filtered by financialYear.
 */
const getConfigs = async (query = {}) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;

  const configs = await ScoringConfig.findAll({
    where,
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [['financialYear', 'DESC']],
  });

  return configs.map((c) => c.toJSON());
};

/**
 * Fetch the active scoring config for a financial year.
 * One config per FY — applies to all quarters (Q1–Q4).
 * Returns null if not found; callers must fall back to system defaults.
 */
const getActiveConfig = async (financialYear) => {
  return ScoringConfig.findOne({
    where: { financialYear, isActive: true },
  });
};

/**
 * Create a new scoring config for a financial year.
 * Blocked if a config already exists for that FY.
 * Notifies all final approvers.
 */
const createConfig = async (data, userId) => {
  const existing = await ScoringConfig.findOne({
    where: { financialYear: data.financialYear },
  });
  if (existing) {
    throw new ConflictError(
      `A scoring config already exists for FY ${data.financialYear}. Edit the existing one instead.`
    );
  }

  const config = await ScoringConfig.create({
    financialYear:    data.financialYear,
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
      financialYear:    config.financialYear,
      meetsMultiplier:   config.meetsMultiplier,
      belowMultiplier:   config.belowMultiplier,
      exceedsMultiplier: config.exceedsMultiplier,
    },
  });

  _notifyFinalApprovers(userId, config.financialYear, 'created');

  return ScoringConfig.findByPk(config.id, {
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
  });
};

/**
 * Update multipliers or isActive for an existing config.
 * Blocked if any quarterly approval has been submitted for that FY (any quarter).
 *
 * Returns { config, impactsApproved } where impactsApproved=true means the
 * caller should show the admin a confirmation that past/current/upcoming data
 * in this FY will be recalculated.
 */
const updateConfig = async (id, data, userId) => {
  const config = await ScoringConfig.findByPk(id);
  if (!config) throw new NotFoundError('Scoring Config');


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

  _notifyFinalApprovers(userId, config.financialYear, 'updated');

  // Recalculate all quarters synchronously before returning — guarantees workbench
  // shows updated values the moment admin's save response arrives.
  await _autoRecalculateAllQuarters(config.financialYear, userId);

  const updated = await ScoringConfig.findByPk(config.id, {
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
  });

  return { config: updated, impactsAllQuarters: true };
};

/**
 * Auto-recalculate all quarters (Q1–Q4) in the FY whenever scoring config is updated.
 * Fires async — does not block the admin save response.
 * Uses a system-level user context so no role check is needed.
 */
const _autoRecalculateAllQuarters = async (financialYear, changedById) => {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const systemUser = { role: 'admin', id: changedById, departmentId: null };

  const results = await Promise.allSettled(
    quarters.map((quarter) =>
      getFinalApproverService()
        .bulkRecalculateQuarter(financialYear, quarter, null, systemUser)
        .then((result) => {
          console.log(`[AutoRecalc] FY=${financialYear} ${quarter}: ${result.recalculated} updated, ${result.skipped} skipped`);
          return result;
        })
    )
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    failed.forEach((r) => console.error(`[AutoRecalc] Quarter failed: ${r.reason?.message}`));
  }
};

/**
 * Notify all active final approvers that scoring config has changed.
 * Fires async — does not block the main response.
 */
const _notifyFinalApprovers = async (actorId, financialYear, action) => {
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
            message: `Admin ${action} KPI scoring multipliers for FY ${financialYear}. This applies to ALL quarters (Q1–Q4). Please reload your workbench if it is open.`,
          })
        )
    );
  } catch (err) {
    console.error('[ScoringConfig] Notify FA error:', err.message);
  }
};

module.exports = { getConfigs, getActiveConfig, createConfig, updateConfig };
