/**
 * Calculate monthly weighted score from finalized KPI items
 * monthlyScore = Σ (item.finalScore × item.weightage / 100)
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

  // If total weightage is not 100, normalize
  if (totalWeightage > 0 && totalWeightage !== 100) {
    return (weightedSum / totalWeightage) * 100;
  }

  return Math.round(weightedSum * 100) / 100;
};

/**
 * Calculate quarterly score from monthly weighted scores
 * quarterlyScore = average of finalized monthly scores
 */
const calculateQuarterlyScore = (monthlyScores) => {
  const validScores = monthlyScores.filter((s) => s != null);
  if (validScores.length === 0) return null;

  const sum = validScores.reduce((acc, s) => acc + s, 0);
  return Math.round((sum / validScores.length) * 100) / 100;
};

/**
 * Match quarterly score against PLI rule slabs
 * Returns the matching slab or null
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

  return null; // No matching slab
};

module.exports = { calculateMonthlyScore, calculateQuarterlyScore, matchPliSlab };
