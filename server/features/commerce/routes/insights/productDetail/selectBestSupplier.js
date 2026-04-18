const selectBestSupplier = ({ distributors }) => {
  const available = distributors.filter((entry) => entry.is_available !== false);
  if (!available.length) return null;
  const costCandidates = available
    .map((entry) => Number(entry.avg_cost ?? entry.last_known_unit_cost_incl_tax ?? 0))
    .filter((value) => value > 0);
  const minCost = costCandidates.length ? Math.min(...costCandidates) : null;
  const leadCandidates = available
    .map((entry) => Number(entry.lead_time_days || 0))
    .filter((value) => value > 0);
  const minLead = leadCandidates.length ? Math.min(...leadCandidates) : null;
  let best = null;
  let bestScore = -1;
  for (const entry of available) {
    const costBasis =
      Number(entry.avg_cost ?? entry.last_known_unit_cost_incl_tax ?? 0) || minCost || 0;
    const costScore = minCost && costBasis ? minCost / costBasis : 0.6;
    const leadBasis = Number(entry.lead_time_days || 0) || minLead || 0;
    const leadScore = minLead && leadBasis ? minLead / leadBasis : 0.4;
    const availabilityScore = entry.is_available === false ? 0 : 1;
    const score = 0.6 * costScore + 0.25 * leadScore + 0.15 * availabilityScore;
    if (score > bestScore) {
      bestScore = score;
      best = { ...entry, score };
    }
  }
  return best;
};

module.exports = { selectBestSupplier };
