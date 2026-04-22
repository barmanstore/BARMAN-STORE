const createPurchaseAnalyticsUtils = () => {
  const computeAverageDays = (values = []) => {
    const list = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];
    if (!list.length) return null;
    const total = list.reduce((sum, value) => sum + value, 0);
    return Math.max(0, Math.round(total / list.length));
  };

  const computeAverageGapDays = (timestamps = []) => {
    const dates = (Array.isArray(timestamps) ? timestamps : [])
      .map((value) => new Date(value))
      .filter((date) => Number.isFinite(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length < 2) return null;
    let total = 0;
    for (let i = 1; i < dates.length; i += 1) {
      total += (dates[i].getTime() - dates[i - 1].getTime()) / 86400000;
    }
    return Math.round(total / (dates.length - 1));
  };

  const computeStdDev = (values = []) => {
    const nums = (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (nums.length < 2) return 0;
    const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
    const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (nums.length - 1);
    return Math.sqrt(variance);
  };

  const deriveStockoutRisk = (avgDaysBetween, stockLevel) => {
    const avgDays = Number(avgDaysBetween);
    const stock = Number(stockLevel);
    if (!Number.isFinite(stock)) return 'unknown';
    const hasCadence = Number.isFinite(avgDays) && avgDays > 0;
    const rapidCadence = hasCadence && avgDays <= 14;
    const moderateCadence = hasCadence && avgDays <= 30;
    if (stock <= 0) return moderateCadence || rapidCadence ? 'high' : 'medium';
    if (stock <= 5 && rapidCadence) return 'high';
    if (stock <= 10 && moderateCadence) return 'medium';
    return 'low';
  };

  const pickEarliestDateKey = (values = []) => {
    const list = (Array.isArray(values) ? values : []).filter(Boolean).sort();
    return list[0] || null;
  };

  const pickLatestDateKey = (values = []) => {
    const list = (Array.isArray(values) ? values : []).filter(Boolean).sort();
    return list.length ? list[list.length - 1] : null;
  };

  return {
    computeAverageDays,
    computeAverageGapDays,
    computeStdDev,
    deriveStockoutRisk,
    pickEarliestDateKey,
    pickLatestDateKey,
  };
};

module.exports = { createPurchaseAnalyticsUtils };
