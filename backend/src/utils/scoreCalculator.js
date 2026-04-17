/**
 * scoreCalculator.js
 * Score calculation utilities for monthly and quarterly KPI scoring.
 *
 * Two scoring systems coexist:
 *  LEGACY: monthlyScore = Σ(finalScore × weightage/100)  [old numeric flow]
 *  NEW:    monthlyScore = Σ(finalApproverAchievedWeightage)  [status-based flow]
 *          quarterlyScore = Σ(quarterlyAchievedWeightage)   [from QuarterlyApproval]
 */

// ── NEW: Status → numeric mapping ─────────────────────────────────────────────

/**
 * Convert a KPI submission status string to a numeric value.
 * Used for quarterly auto-calculation: Exceeds=+1, Meets=0, Below=-1
 * @param {string|null} status
 * @returns {number} +1, 0, or -1
 */
const statusToNumeric = (status) => {
  if (status === 'Exceeds') return 1;
  if (status === 'Below') return -1;
  return 0; // 'Meets' or null/undefined
};

// ── NEW: Monthly score from achieved weightage (status-based flow) ─────────────

/**
 * Calculate monthly weighted score from Final Approver's credited weightages.
 * monthlyScore = Σ(item.finalApproverAchievedWeightage)
 * @param {Array} kpiItems - array of KpiItem instances
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

// ── NEW: Quarterly score from QuarterlyApprovalItems ──────────────────────────

/**
 * Calculate quarterly score from approval items.
 * quarterlyScore = Σ(item.quarterlyAchievedWeightage)
 * @param {Array} approvalItems - array of QuarterlyApprovalItem instances
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

// ── LEGACY: kept for backward compat with old numeric-score flow ───────────────

/**
 * Calculate monthly weighted score from finalized KPI items (legacy numeric flow).
 * monthlyScore = Σ(item.finalScore × item.weightage / 100)
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

  // Normalize if total weightage is not 100
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
  statusToNumeric,
  calculateMonthlyScoreFromAchievedWeightage,
  calculateQuarterlyScoreFromApprovalItems,
  calculateMonthlyScore,
  calculateQuarterlyScore,
  matchPliSlab,
};
