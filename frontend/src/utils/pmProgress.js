/**
 * Overall project progress from its milestones — one formula for every screen.
 *
 * Weighted (when any top-level milestone has a weight):
 *   Σ(milestone weight × milestone completion) ÷ Σ(milestone weight)
 * A milestone's completion is itself rolled up from its sub-milestones on the
 * server, so a 2%-of-project sub at 50% moves the project by exactly 1%.
 *
 * Fallback (no weights set yet): share of top-level milestones marked completed —
 * the previous behaviour, so projects whose PM has not set weights are unchanged.
 *
 * @param {Array<{parentMilestoneId?, weightPercentage?, completionPercentage?, status?}>} milestones
 * @returns {number} 0–100, integer
 */
export function projectProgress(milestones = []) {
  const top = milestones.filter((m) => !m.parentMilestoneId);
  if (top.length === 0) return 0;

  const weighted = top.filter((m) => m.weightPercentage != null && Number(m.weightPercentage) > 0);
  const totalWeight = weighted.reduce((s, m) => s + Number(m.weightPercentage), 0);
  if (totalWeight > 0) {
    const earned = weighted.reduce(
      (s, m) => s + Number(m.weightPercentage) * (Number(m.completionPercentage) || 0),
      0,
    );
    return Math.max(0, Math.min(100, Math.round(earned / totalWeight)));
  }

  const done = top.filter((m) => m.status === 'completed').length;
  return Math.round((done / top.length) * 100);
}
