const createDateKeyUtils = ({ PURCHASE_WEEKDAYS = [] } = {}) => {
  const normalizeWeekdayLabel = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const exactMatch = PURCHASE_WEEKDAYS.find((day) => day.toLowerCase() === raw);
    if (exactMatch) return exactMatch;
    const prefixMatch = PURCHASE_WEEKDAYS.find((day) => day.toLowerCase().startsWith(raw.slice(0, 3)));
    return prefixMatch || '';
  };

  const addDaysToDateKey = (dateValue, days = 0) => {
    const baseDate = new Date(`${String(dateValue || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return null;
    baseDate.setDate(baseDate.getDate() + Number(days || 0));
    return baseDate.toISOString().slice(0, 10);
  };

  const getWeekdayFromDateKey = (dateValue) => {
    const baseDate = new Date(`${String(dateValue || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return '';
    return PURCHASE_WEEKDAYS[baseDate.getDay()] || '';
  };

  const getDaysBetweenDateKeys = (fromDate, toDate) => {
    const from = new Date(`${String(fromDate || '').slice(0, 10)}T00:00:00`);
    const to = new Date(`${String(toDate || '').slice(0, 10)}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  };

  const buildDateSeries = (startDate, endDate) => {
    const series = [];
    if (!startDate || !endDate) return series;
    let cursor = startDate;
    let guard = 0;
    while (cursor && cursor <= endDate && guard < 4000) {
      series.push(cursor);
      cursor = addDaysToDateKey(cursor, 1);
      guard += 1;
    }
    return series;
  };

  const normalizeTransactionDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}[t\s]/i.test(raw)) return raw.slice(0, 10);

    let normalizedInput = raw;
    if (/^[a-z]{3}\s+[a-z]{3}\s+\d{1,2}$/i.test(raw)) {
      normalizedInput = `${raw} ${new Date().getFullYear()}`;
    }

    const parsedAt = Date.parse(normalizedInput);
    if (!Number.isFinite(parsedAt)) return null;
    const parsedDate = new Date(parsedAt);
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    normalizeWeekdayLabel,
    addDaysToDateKey,
    getWeekdayFromDateKey,
    getDaysBetweenDateKeys,
    buildDateSeries,
    normalizeTransactionDate,
  };
};

module.exports = { createDateKeyUtils };
