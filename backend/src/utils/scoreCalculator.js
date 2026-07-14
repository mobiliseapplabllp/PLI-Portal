/**
 * scoreCalculator.js
 * Score calculation utilities for monthly and quarterly KPI scoring.
 *
 * Three scoring systems coexist:
 *  LEGACY:      monthlyScore = Σ(finalScore × weightage/100)  [old numeric flow]
 *  NEW (sum):   monthlyScore = Σ(finalApproverAchievedWeightage)  [status-based flow]
 *  NEW (ratio): quarterlyScore = Σ(actuals) / Σ(3 × wt) × 100  [multiplier-based flow]
 */

// ── MULTIPLIER-BASED: configurable per FY+Quarter ─────────────────────────────

/**
 * Convert KPI status to its weighted multiplier using admin config.
 * Null status = 0 contribution (not treated as Meets).
 * Falls back to defaults (1.0 / -0.5 / 1.5) if no config provided.
 * @param {string|null} status
 * @param {object|null} config - ScoringConfig record or null
 * @returns {number}
 */
const statusToMultiplier = (status, config = null) => {
  if (!status) return 0;
  const meets   = parseFloat(config?.meetsMultiplier   ?? 1.0);
  const below   = parseFloat(config?.belowMultiplier   ?? -0.5);
  const exceeds = parseFloat(config?.exceedsMultiplier ?? 1.5);
  if (status === 'Exceeds') return exceeds;
  if (status === 'Below')   return below;
  return meets;
};

/**
 * Calculate actual weightage contribution for one KPI item in one month.
 * actualWeightage = monthlyWeightage × multiplier
 * @param {number} monthlyWeightage
 * @param {string|null} status
 * @param {object|null} config
 * @returns {number}
 */
const calculateActualWeightage = (monthlyWeightage, status, config = null) => {
  // Return full-precision value — caller rounds after summing to avoid accumulated error
  return parseFloat(monthlyWeightage || 0) * statusToMultiplier(status, config);
};

/**
 * Calculate quarterly score from system-computed actuals (read-only reference score).
 * Score = Σ(calculatedQuarterlyActual) / Σ(3 × monthlyWeightage) × 100
 * @param {Array} items - QuarterlyApprovalItem records
 * @returns {number|null}
 */
const calculateQuarterlyScoreFromActuals = (items) => {
  if (!items || items.length === 0) return null;
  const sumActual = items.reduce((s, i) => s + (parseFloat(i.calculatedQuarterlyActual) || 0), 0);
  const sumWt     = items.reduce((s, i) => s + (parseFloat(i.monthlyWeightage) || 0) * 3, 0);
  if (sumWt === 0) return null;
  return Math.round((sumActual / sumWt) * 100 * 100) / 100;
};

/**
 * Calculate quarterly score from FA's final entered values (used for PLI payout).
 * Score = Σ(quarterlyAchievedWeightage) / Σ(3 × monthlyWeightage) × 100
 * @param {Array} items - QuarterlyApprovalItem records
 * @returns {number|null}
 */
const calculateQuarterlyScoreFromFAValues = (items) => {
  if (!items || items.length === 0) return null;
  const sumFA = items.reduce((s, i) => s + (parseFloat(i.quarterlyAchievedWeightage) || 0), 0);
  const sumWt = items.reduce((s, i) => s + (parseFloat(i.monthlyWeightage) || 0) * 3, 0);
  if (sumWt === 0) return null;
  return Math.round((sumFA / sumWt) * 100 * 100) / 100;
};

// ── STATUS → NUMERIC (kept for backward compat) ───────────────────────────────

/**
 * Convert a KPI submission status string to a numeric value.
 * Kept for backward compatibility — new code uses statusToMultiplier.
 * @param {string|null} status
 * @returns {number} +1, 0, or -1
 */
const statusToNumeric = (status) => {
  if (status === 'Exceeds') return 1;
  if (status === 'Below') return -1;
  return 0;
};

// ── MONTHLY SCORE FROM ACHIEVED WEIGHTAGE ─────────────────────────────────────

/**
 * Calculate monthly weighted score from Final Approver's credited weightages.
 * monthlyScore = Σ(item.finalApproverAchievedWeightage)
 * @param {Array} kpiItems
 * @returns {number|null}
 */
const calculateMonthlyScoreFromAchievedWeightage = (kpiItems) => {
  if (!kpiItems || kpiItems.length === 0) return null;
  const total = kpiItems.reduce((sum, item) => {
    const aw = parseFloat(item.finalApproverAchievedWeightage);
    return sum + (isNaN(aw) ? 0 : aw);
  }, 0);
  return Math.round(total * 100) / 100;
};

// ── QUARTERLY SCORE FROM APPROVAL ITEMS (legacy sum) ─────────────────────────

/**
 * Calculate quarterly score as raw sum of achieved weightages (legacy).
 * Kept for backward compatibility.
 * @param {Array} approvalItems
 * @returns {number|null}
 */
const calculateQuarterlyScoreFromApprovalItems = (approvalItems) => {
  if (!approvalItems || approvalItems.length === 0) return null;
  const total = approvalItems.reduce((sum, item) => {
    const aw = parseFloat(item.quarterlyAchievedWeightage);
    return sum + (isNaN(aw) ? 0 : aw);
  }, 0);
  return Math.round(total * 100) / 100;
};

// ── LEGACY: old numeric-score flow ────────────────────────────────────────────

/**
 * Calculate monthly weighted score from finalized KPI items (legacy numeric flow).
 * @param {Array} kpiItems
 * @returns {number}
 */
const calculateMonthlyScore = (kpiItems) => {
  if (!kpiItems || kpiItems.length === 0) return 0;
  let totalWeightage = 0;
  let weightedSum = 0;
  for (const item of kpiItems) {
    if (item.finalScore != null && item.weightage) {
      weightedSum += item.finalScore * (item.weightage / 100);
      totalWeightage += item.weightage;
    }
  }
  if (totalWeightage > 0 && totalWeightage !== 100) {
    return (weightedSum / totalWeightage) * 100;
  }
  return Math.round(weightedSum * 100) / 100;
};

/**
 * Calculate quarterly score as average of monthly scores (legacy flow).
 * @param {Array<number|null>} monthlyScores
 * @returns {number|null}
 */
const calculateQuarterlyScore = (monthlyScores) => {
  const validScores = monthlyScores.filter((s) => s != null);
  if (validScores.length === 0) return null;
  const sum = validScores.reduce((acc, s) => acc + s, 0);
  return Math.round((sum / validScores.length) * 100) / 100;
};

/**
 * Match quarterly score against PLI rule slabs.
 * @param {number} score
 * @param {Array} slabs
 * @returns {object|null}
 */
const matchPliSlab = (score, slabs) => {
  if (score == null || !slabs || slabs.length === 0) return null;
  for (const slab of slabs) {
    if (score >= slab.minScore && score <= slab.maxScore) {
      return {
        payoutPercentage: slab.payoutPercentage,
        label: slab.label,
        minScore: slab.minScore,
        maxScore: slab.maxScore,
      };
    }
  }
  return null;
};

module.exports = {
  statusToMultiplier,
  calculateActualWeightage,
  calculateQuarterlyScoreFromActuals,
  calculateQuarterlyScoreFromFAValues,
  statusToNumeric,
  calculateMonthlyScoreFromAchievedWeightage,
  calculateQuarterlyScoreFromApprovalItems,
  calculateMonthlyScore,
  calculateQuarterlyScore,
  matchPliSlab,
};
