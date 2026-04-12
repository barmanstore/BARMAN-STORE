const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CASHBOOK_WINDOW_DAYS_DEFAULT = 31;
const CASHBOOK_WINDOW_DAYS_MIN = 1;
const CASHBOOK_WINDOW_DAYS_MAX = 31;
const MANUAL_ENTRY_TYPES = new Set(['manual_in', 'manual_out', 'expense', 'adjustment', 'task']);
const AUTOMATIC_ENTRY_TYPES = new Set(['sale', 'purchase_payment']);
const ALL_ENTRY_TYPES = new Set([...MANUAL_ENTRY_TYPES, ...AUTOMATIC_ENTRY_TYPES]);

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pad2 = (value) => String(value).padStart(2, '0');

const parseDateKey = (value) => {
  const raw = String(value || '').trim();
  return DATE_KEY_PATTERN.test(raw) ? raw : '';
};

const shiftDateKey = (dateKey, offsetDays) => {
  const normalized = parseDateKey(dateKey);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + Number(offsetDays || 0));
  if (Number.isNaN(nextDate.getTime())) return '';
  return `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(nextDate.getDate())}`;
};

const listDateKeys = (startDateKey, endDateKey) => {
  const normalizedStart = parseDateKey(startDateKey);
  const normalizedEnd = parseDateKey(endDateKey);
  if (!normalizedStart || !normalizedEnd || normalizedStart > normalizedEnd) return [];

  const keys = [];
  let cursor = normalizedStart;
  while (cursor <= normalizedEnd) {
    keys.push(cursor);
    cursor = shiftDateKey(cursor, 1);
    if (!cursor) break;
  }
  return keys;
};

const normalizeWindowDays = (value) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return CASHBOOK_WINDOW_DAYS_DEFAULT;
  return Math.max(CASHBOOK_WINDOW_DAYS_MIN, Math.min(CASHBOOK_WINDOW_DAYS_MAX, parsed));
};

const normalizeCashbookType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  return ALL_ENTRY_TYPES.has(raw) ? raw : '';
};

const normalizeManualEntryType = (value) => {
  const type = normalizeCashbookType(value);
  return MANUAL_ENTRY_TYPES.has(type) ? type : '';
};

const normalizeAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidTimeToken = (value) => /^\d{2}:\d{2}(:\d{2})?$/.test(String(value || '').trim());

const normalizeTimeToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!isValidTimeToken(raw)) return '';
  return raw.length === 5 ? `${raw}:00` : raw.slice(0, 8);
};

const formatTimeLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length >= 5) return raw.slice(0, 5);
  return raw;
};

const formatDateLabel = (dateKey, todayKey) => {
  const normalized = parseDateKey(dateKey);
  if (!normalized) return '-';
  if (normalized === todayKey) return 'Today';
  const yesterdayKey = shiftDateKey(todayKey, -1);
  if (normalized === yesterdayKey) return 'Yesterday';
  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
};

const getEntryDirection = (signedAmount) => {
  if (signedAmount > 0) return 'in';
  if (signedAmount < 0) return 'out';
  return 'neutral';
};

const getEntryLabel = (type) => {
  switch (normalizeCashbookType(type)) {
    case 'sale':
      return 'Sale';
    case 'purchase_payment':
      return 'Purchase Payment';
    case 'expense':
    case 'manual_out':
      return 'Expense';
    case 'manual_in':
      return 'Income';
    case 'adjustment':
      return 'Adjustment';
    case 'task':
      return 'Task';
    default:
      return 'Entry';
  }
};

const getEntryBadgeLabel = (type, signedAmount) => {
  if (normalizeCashbookType(type) === 'task') return 'TASK';
  return signedAmount >= 0 ? 'IN' : 'OUT';
};

const getEntrySignedAmount = ({ type, amount, adjustmentDirection = '' } = {}) => {
  const normalizedType = normalizeCashbookType(type);
  const absoluteAmount = Math.abs(asNumber(amount, 0));

  switch (normalizedType) {
    case 'sale':
      return absoluteAmount;
    case 'purchase_payment':
    case 'expense':
    case 'manual_out':
      return -absoluteAmount;
    case 'manual_in':
      return absoluteAmount;
    case 'adjustment':
      if (adjustmentDirection === 'reduce') return -absoluteAmount;
      if (adjustmentDirection === 'add') return absoluteAmount;
      return asNumber(amount, 0);
    case 'task':
      return 0;
    default:
      return null;
  }
};

const normalizeCreditHistoryType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'payment' || raw === 'given' || raw === 'reversal' || raw === 'issue_correction') return raw;
  return raw;
};

const getCreditHistoryEntryLabel = (entry = {}) => {
  const type = normalizeCreditHistoryType(entry.type);
  const sourceType = String(entry.source_type || '').trim().toLowerCase();

  if (type === 'payment') return 'Credit Payment';
  if (type === 'given') return sourceType === 'bill' ? 'Credit Sale' : 'Manual Sale';
  if (type === 'reversal') return 'Credit Reversal';
  if (sourceType === 'issue_correction') return 'Credit Correction';
  return 'Credit';
};

const getCreditHistoryEntrySignedAmount = (entry = {}) => {
  const type = normalizeCreditHistoryType(entry.type);
  const amount = Math.abs(asNumber(entry.amount, 0));
  if (type === 'payment') return amount;
  return 0;
};

const getCreditHistoryEntryBadgeLabel = (entry = {}, signedAmount = 0) => {
  const type = normalizeCreditHistoryType(entry.type);
  if (type === 'payment') return signedAmount >= 0 ? 'CREDIT IN' : 'CREDIT OUT';
  if (type === 'given') return 'CREDIT';
  if (type === 'reversal') return 'REVERSAL';
  return 'CREDIT';
};

const buildCreditHistoryEntryNote = (entry = {}) => {
  const parts = [];
  const sourceType = String(entry.source_type || '').trim().toLowerCase();
  const sourceLabel = String(entry.source_label || entry.reference || '').trim();
  const customerName = String(entry.customer_name || '').trim();
  const description = String(entry.description || '').trim();

  if (sourceType === 'bill' && sourceLabel) {
    parts.push(`Bill #${sourceLabel}`);
  } else if (sourceLabel) {
    parts.push(sourceLabel);
  }

  if (customerName) parts.push(customerName);
  if (description && description !== sourceLabel) parts.push(description);

  return parts.join(' • ');
};

const compareCashbookEntries = (left, right) => {
  const leftDate = String(left?.date || '');
  const rightDate = String(right?.date || '');
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

  const leftTime = String(left?.time || '00:00:00');
  const rightTime = String(right?.time || '00:00:00');
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

  const leftCreatedAt = String(left?.created_at || '');
  const rightCreatedAt = String(right?.created_at || '');
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt.localeCompare(rightCreatedAt);

  return asNumber(left?.id, 0) - asNumber(right?.id, 0);
};

const buildEntryNote = (entry) => {
  if (!entry) return '';
  const type = normalizeCashbookType(entry.type);

  if (type === 'sale') {
    const parts = [];
    if (entry.bill_number) parts.push(`Bill #${entry.bill_number}`);
    if (entry.customer_name) parts.push(entry.customer_name);
    if (entry.payment_method) parts.push(String(entry.payment_method).trim().toUpperCase());
    return parts.join(' • ');
  }

  if (type === 'purchase_payment') {
    const parts = [];
    if (entry.po_number) parts.push(`PO #${entry.po_number}`);
    if (entry.distributor_name) parts.push(entry.distributor_name);
    if (entry.payment_mode) parts.push(String(entry.payment_mode).trim().toUpperCase());
    return parts.join(' • ');
  }

  return String(entry.note || '').trim();
};

const serializeCashbookEntry = (entry) => {
  if (!entry) return null;
  const type = normalizeCashbookType(entry.type);
  const signedAmount = getEntrySignedAmount({
    type,
    amount: entry.amount,
    adjustmentDirection: entry.adjustment_direction || '',
  });
  const absoluteAmount = type === 'task' ? 0 : Math.abs(asNumber(entry.amount, 0));
  const note = buildEntryNote(entry);
  const date = parseDateKey(entry.date || entry.entry_date || '');

  return {
    id: String(entry.id || '').trim() || null,
    source_id: Number(entry.source_id || entry.id || 0) || null,
    source_type: String(entry.source_type || (AUTOMATIC_ENTRY_TYPES.has(type) ? type : 'manual')).trim() || 'manual',
    date,
    time: formatTimeLabel(entry.time || entry.entry_time || ''),
    type,
    label: getEntryLabel(type),
    amount: absoluteAmount,
    signed_amount: Number.isFinite(signedAmount) ? signedAmount : 0,
    badge_label: getEntryBadgeLabel(type, Number.isFinite(signedAmount) ? signedAmount : 0),
    direction: getEntryDirection(Number.isFinite(signedAmount) ? signedAmount : 0),
    note,
    is_auto: AUTOMATIC_ENTRY_TYPES.has(type),
    origin_label: AUTOMATIC_ENTRY_TYPES.has(type) ? 'Auto' : 'Manual',
    created_by: Number(entry.created_by || 0) || null,
    created_by_name: String(entry.created_by_name || '').trim(),
    created_at: entry.created_at || null,
    updated_at: entry.updated_at || null,
    bill_number: String(entry.bill_number || '').trim(),
    customer_name: String(entry.customer_name || '').trim(),
    distributor_name: String(entry.distributor_name || '').trim(),
    payment_method: String(entry.payment_method || '').trim(),
    payment_mode: String(entry.payment_mode || '').trim(),
    reference: String(entry.reference || '').trim(),
    po_number: String(entry.po_number || '').trim(),
    running_balance: null,
  };
};

const serializeOpeningBalance = (row) => {
  if (!row) return null;
  return {
    date: parseDateKey(row.balance_date),
    opening_balance: asNumber(row.opening_balance, 0),
    note: String(row.note || '').trim(),
    created_by: Number(row.created_by || 0) || null,
    created_by_name: String(row.created_by_name || '').trim(),
    updated_by: Number(row.updated_by || 0) || null,
    updated_by_name: String(row.updated_by_name || '').trim(),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
};

const loadCashbookSnapshot = async (dbGetAsync, dbAllAsync, { windowDays = CASHBOOK_WINDOW_DAYS_DEFAULT, endDateKey = '' } = {}) => {
  const clockRow = await dbGetAsync('SELECT CURRENT_DATE::text AS today_date');
  const todayDateKey = parseDateKey(endDateKey) || parseDateKey(clockRow?.today_date) || '';
  if (!todayDateKey) {
    return {
      range: {
        start_date: '',
        end_date: '',
        window_days: normalizeWindowDays(windowDays),
      },
      today_summary: null,
      groups: [],
    };
  }

  const normalizedDays = normalizeWindowDays(windowDays);
  const startDateKey = shiftDateKey(todayDateKey, -(normalizedDays - 1));

  const latestOpeningRow = await dbGetAsync(
    `SELECT
       ob.balance_date,
       ob.opening_balance,
       ob.note,
       ob.created_by,
       ob.updated_by,
       ob.created_at,
       ob.updated_at,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
     FROM cashbook_opening_balances ob
     LEFT JOIN users creator ON creator.id = ob.created_by
     LEFT JOIN users updater ON updater.id = ob.updated_by
     WHERE ob.balance_date <= DATE(?)
     ORDER BY ob.balance_date DESC
     LIMIT 1`,
    [startDateKey]
  );

  const baseOpeningDate = parseDateKey(latestOpeningRow?.balance_date);
  const baseOpeningBalance = asNumber(latestOpeningRow?.opening_balance, 0);
  const lowerBoundForPriorRows = baseOpeningDate && baseOpeningDate < startDateKey ? baseOpeningDate : '';

  const salesPriorQuery = lowerBoundForPriorRows
    ? {
        sql: `SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0) AS net
              FROM bills
              WHERE LOWER(COALESCE(bill_type, 'sales')) = 'sales'
                AND COALESCE(paid_amount, 0) > 0
                AND DATE(created_at) >= DATE(?)
                AND DATE(created_at) < DATE(?)`,
        params: [lowerBoundForPriorRows, startDateKey],
      }
    : {
        sql: `SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0) AS net
              FROM bills
              WHERE LOWER(COALESCE(bill_type, 'sales')) = 'sales'
                AND COALESCE(paid_amount, 0) > 0
                AND DATE(created_at) < DATE(?)`,
        params: [startDateKey],
      };

  const purchasePriorQuery = lowerBoundForPriorRows
    ? {
        sql: `SELECT COALESCE(SUM(COALESCE(amount, 0)), 0) AS net
              FROM purchase_order_payments
              WHERE COALESCE(amount, 0) > 0
                AND COALESCE(transaction_date, DATE(created_at)) >= DATE(?)
                AND COALESCE(transaction_date, DATE(created_at)) < DATE(?)`,
        params: [lowerBoundForPriorRows, startDateKey],
      }
    : {
        sql: `SELECT COALESCE(SUM(COALESCE(amount, 0)), 0) AS net
              FROM purchase_order_payments
              WHERE COALESCE(amount, 0) > 0
                AND COALESCE(transaction_date, DATE(created_at)) < DATE(?)`,
        params: [startDateKey],
      };

  const manualPriorQuery = lowerBoundForPriorRows
    ? {
        sql: `SELECT COALESCE(SUM(
                CASE
                  WHEN LOWER(COALESCE(type, '')) = 'task' THEN 0
                  WHEN LOWER(COALESCE(type, '')) IN ('manual_out', 'expense') THEN -ABS(COALESCE(amount, 0))
                  WHEN LOWER(COALESCE(type, '')) = 'adjustment' THEN COALESCE(amount, 0)
                  ELSE ABS(COALESCE(amount, 0))
                END
              ), 0) AS net
              FROM cashbook_entries
              WHERE entry_date >= DATE(?)
                AND entry_date < DATE(?)`,
        params: [lowerBoundForPriorRows, startDateKey],
      }
    : {
        sql: `SELECT COALESCE(SUM(
                CASE
                  WHEN LOWER(COALESCE(type, '')) = 'task' THEN 0
                  WHEN LOWER(COALESCE(type, '')) IN ('manual_out', 'expense') THEN -ABS(COALESCE(amount, 0))
                  WHEN LOWER(COALESCE(type, '')) = 'adjustment' THEN COALESCE(amount, 0)
                  ELSE ABS(COALESCE(amount, 0))
                END
              ), 0) AS net
              FROM cashbook_entries
              WHERE entry_date < DATE(?)`,
        params: [startDateKey],
      };

  const creditPriorQuery = lowerBoundForPriorRows
    ? {
        sql: `SELECT COALESCE(SUM(
                CASE
                  WHEN LOWER(COALESCE(type, '')) = 'payment' THEN ABS(COALESCE(amount, 0))
                  ELSE 0
                END
              ), 0) AS net
              FROM credit_history
              WHERE COALESCE(transaction_date, DATE(transaction_ts)) >= DATE(?)
                AND COALESCE(transaction_date, DATE(transaction_ts)) < DATE(?)`,
        params: [lowerBoundForPriorRows, startDateKey],
      }
    : {
        sql: `SELECT COALESCE(SUM(
                CASE
                  WHEN LOWER(COALESCE(type, '')) = 'payment' THEN ABS(COALESCE(amount, 0))
                  ELSE 0
                END
              ), 0) AS net
              FROM credit_history
              WHERE COALESCE(transaction_date, DATE(transaction_ts)) < DATE(?)`,
        params: [startDateKey],
      };

  const [salesPriorRow, purchasePriorRow, manualPriorRow, creditPriorRow] = await Promise.all([
    dbGetAsync(salesPriorQuery.sql, salesPriorQuery.params),
    dbGetAsync(purchasePriorQuery.sql, purchasePriorQuery.params),
    dbGetAsync(manualPriorQuery.sql, manualPriorQuery.params),
    dbGetAsync(creditPriorQuery.sql, creditPriorQuery.params),
  ]);

  const startingBalance = baseOpeningBalance
    + asNumber(salesPriorRow?.net, 0)
    - asNumber(purchasePriorRow?.net, 0)
    + asNumber(manualPriorRow?.net, 0)
    + asNumber(creditPriorRow?.net, 0);

  const [salesRows, purchaseRows, manualRows, creditRows, openingRows] = await Promise.all([
    dbAllAsync(
      `SELECT
         b.id,
         DATE(b.created_at)::text AS entry_date,
         TO_CHAR(b.created_at, 'HH24:MI:SS') AS entry_time,
         b.bill_number,
         b.customer_name,
         b.payment_method,
         b.notes,
         COALESCE(b.paid_amount, 0) AS amount,
         b.created_by,
         creator.name AS created_by_name,
         b.created_at
       FROM bills b
       LEFT JOIN users creator ON creator.id = b.created_by
       WHERE LOWER(COALESCE(b.bill_type, 'sales')) = 'sales'
         AND COALESCE(b.paid_amount, 0) > 0
         AND DATE(b.created_at) >= DATE(?)
         AND DATE(b.created_at) <= DATE(?)
       ORDER BY DATE(b.created_at) ASC, b.created_at ASC, b.id ASC`,
      [startDateKey, todayDateKey]
    ),
    dbAllAsync(
      `SELECT
         p.id,
         COALESCE(p.transaction_date, DATE(p.created_at))::text AS entry_date,
         TO_CHAR(p.created_at, 'HH24:MI:SS') AS entry_time,
         p.purchase_order_id,
         p.distributor_id,
         po.po_number,
         d.name AS distributor_name,
         p.payment_mode,
         p.reference,
         p.notes,
         COALESCE(p.amount, 0) AS amount,
         p.created_by,
         creator.name AS created_by_name,
         p.created_at
       FROM purchase_order_payments p
       LEFT JOIN purchase_orders po ON po.id = p.purchase_order_id
       LEFT JOIN distributors d ON d.id = p.distributor_id
       LEFT JOIN users creator ON creator.id = p.created_by
       WHERE COALESCE(p.amount, 0) > 0
         AND COALESCE(p.transaction_date, DATE(p.created_at)) >= DATE(?)
         AND COALESCE(p.transaction_date, DATE(p.created_at)) <= DATE(?)
       ORDER BY COALESCE(p.transaction_date, DATE(p.created_at)) ASC, p.created_at ASC, p.id ASC`,
      [startDateKey, todayDateKey]
    ),
    dbAllAsync(
      `SELECT
         ce.id,
         ce.entry_date::text AS entry_date,
         TO_CHAR(ce.entry_time, 'HH24:MI:SS') AS entry_time,
         ce.type,
         ce.amount,
         ce.note,
         ce.source_id,
         ce.source_type,
         ce.created_by,
         creator.name AS created_by_name,
         ce.created_at,
         ce.updated_at
       FROM cashbook_entries ce
       LEFT JOIN users creator ON creator.id = ce.created_by
       WHERE ce.entry_date >= DATE(?)
         AND ce.entry_date <= DATE(?)
       ORDER BY ce.entry_date ASC, ce.entry_time ASC, ce.created_at ASC, ce.id ASC`,
      [startDateKey, todayDateKey]
    ),
    dbAllAsync(
      `SELECT
         ch.id,
         COALESCE(ch.transaction_date, DATE(ch.transaction_ts))::text AS entry_date,
         TO_CHAR(ch.transaction_ts, 'HH24:MI:SS') AS entry_time,
         ch.type,
         ch.amount,
         ch.description,
         ch.reference,
         ch.source_type,
         ch.source_id,
         ch.source_label,
         ch.reversed_entry_id,
         ch.created_by,
         creator.name AS created_by_name,
         ch.transaction_ts AS created_at,
         ch.transaction_ts,
         u.name AS customer_name
       FROM credit_history ch
       LEFT JOIN users creator ON creator.id = ch.created_by
       LEFT JOIN users u ON u.id = ch.user_id
       WHERE COALESCE(ch.transaction_date, DATE(ch.transaction_ts)) >= DATE(?)
         AND COALESCE(ch.transaction_date, DATE(ch.transaction_ts)) <= DATE(?)
       ORDER BY COALESCE(ch.transaction_date, DATE(ch.transaction_ts)) ASC, ch.transaction_ts ASC, ch.created_at ASC, ch.id ASC`,
      [startDateKey, todayDateKey]
    ),
    dbAllAsync(
      `SELECT
         ob.balance_date::text AS balance_date,
         ob.opening_balance,
         ob.note,
         ob.created_by,
         ob.updated_by,
         ob.created_at,
         ob.updated_at,
         creator.name AS created_by_name,
         updater.name AS updated_by_name
       FROM cashbook_opening_balances ob
       LEFT JOIN users creator ON creator.id = ob.created_by
       LEFT JOIN users updater ON updater.id = ob.updated_by
       WHERE ob.balance_date >= DATE(?)
         AND ob.balance_date <= DATE(?)
       ORDER BY ob.balance_date ASC`,
      [startDateKey, todayDateKey]
    ),
  ]);

  const entriesByDate = new Map(listDateKeys(startDateKey, todayDateKey).map((dateKey) => [dateKey, []]));
  const openingByDate = new Map();

  openingRows.forEach((row) => {
    const balanceDate = parseDateKey(row?.balance_date);
    if (!balanceDate) return;
    openingByDate.set(balanceDate, serializeOpeningBalance(row));
  });

  const pushRow = (row, type, extra = {}) => {
    const normalizedType = normalizeCashbookType(type);
    const date = parseDateKey(row?.entry_date || row?.date || row?.balance_date);
    if (!date || !entriesByDate.has(date)) return;

    const amount = normalizeAmount(row?.amount);
    const signedAmount = Number.isFinite(extra.signedAmountOverride)
      ? Number(extra.signedAmountOverride)
      : getEntrySignedAmount({
          type: normalizedType,
          amount,
          adjustmentDirection: extra.adjustment_direction || row?.adjustment_direction || '',
        });
    const entryAmount = Number.isFinite(extra.amountOverride)
      ? Math.abs(Number(extra.amountOverride))
      : (normalizedType === 'task' ? 0 : Math.abs(asNumber(amount, 0)));
    const direction = extra.directionOverride || getEntryDirection(Number.isFinite(signedAmount) ? signedAmount : 0);
    const label = extra.labelOverride || getEntryLabel(normalizedType);
    const badgeLabel = extra.badgeLabelOverride || getEntryBadgeLabel(normalizedType, Number.isFinite(signedAmount) ? signedAmount : 0);

    entriesByDate.get(date).push({
      id: `${extra.idPrefix || normalizedType}-${row.id}`,
      source_id: Number(row.source_id || row.id || 0) || null,
      source_type: extra.sourceType || normalizedType || 'manual',
      date,
      time: formatTimeLabel(row.entry_time || row.time || ''),
      type: normalizedType,
      label,
      amount: entryAmount,
      signed_amount: Number.isFinite(signedAmount) ? signedAmount : 0,
      badge_label: badgeLabel,
      direction,
      note: extra.noteBuilder ? extra.noteBuilder(row) : String(row.note || '').trim(),
      is_auto: extra.isAuto || false,
      is_credit_history: Boolean(extra.isCreditHistory),
      origin_label: extra.originLabel || (extra.isAuto ? 'Auto' : 'Manual'),
      created_by: Number(row.created_by || 0) || null,
      created_by_name: String(row.created_by_name || '').trim(),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      bill_number: String(row.bill_number || '').trim(),
      customer_name: String(row.customer_name || '').trim(),
      distributor_name: String(row.distributor_name || '').trim(),
      payment_method: String(row.payment_method || '').trim(),
      payment_mode: String(row.payment_mode || '').trim(),
      reference: String(row.reference || '').trim(),
      po_number: String(row.po_number || '').trim(),
      running_balance: null,
    });
  };

  salesRows.forEach((row) => {
    pushRow(row, 'sale', {
      isAuto: true,
      sourceType: 'sale',
      idPrefix: 'sale',
      noteBuilder: (value) => {
        const parts = [];
        if (value.bill_number) parts.push(`Bill #${value.bill_number}`);
        if (value.customer_name) parts.push(value.customer_name);
        if (value.payment_method) parts.push(String(value.payment_method).trim().toUpperCase());
        return parts.join(' • ');
      },
    });
  });

  purchaseRows.forEach((row) => {
    pushRow(row, 'purchase_payment', {
      isAuto: true,
      sourceType: 'purchase_payment',
      idPrefix: 'purchase-payment',
      noteBuilder: (value) => {
        const parts = [];
        if (value.po_number) parts.push(`PO #${value.po_number}`);
        if (value.distributor_name) parts.push(value.distributor_name);
        if (value.payment_mode) parts.push(String(value.payment_mode).trim().toUpperCase());
        return parts.join(' • ');
      },
    });
  });

  manualRows.forEach((row) => {
    const normalizedType = normalizeManualEntryType(row.type);
    if (!normalizedType) return;
    pushRow(row, normalizedType, {
      sourceType: 'manual',
      idPrefix: 'cashbook',
    });
  });

  creditRows.forEach((row) => {
    const normalizedType = normalizeCreditHistoryType(row.type);
    if (!normalizedType) return;
    const signedAmount = getCreditHistoryEntrySignedAmount(row);
    const amount = Math.abs(asNumber(row.amount, 0));
    pushRow(row, normalizedType, {
      sourceType: 'credit_history',
      idPrefix: 'credit-history',
      isCreditHistory: true,
      originLabel: 'Credit',
      labelOverride: getCreditHistoryEntryLabel(row),
      badgeLabelOverride: getCreditHistoryEntryBadgeLabel(row, signedAmount),
      directionOverride: signedAmount > 0 ? 'in' : 'neutral',
      signedAmountOverride: signedAmount,
      amountOverride: amount,
      noteBuilder: buildCreditHistoryEntryNote,
    });
  });

  const dateKeysAsc = listDateKeys(startDateKey, todayDateKey);
  const groupsAsc = [];

  dateKeysAsc.forEach((dateKey) => {
    const openingRow = openingByDate.get(dateKey) || null;
    const dayEntries = (entriesByDate.get(dateKey) || []).slice().sort(compareCashbookEntries);

    let openingBalance = dateKey === startDateKey ? startingBalance : 0;
    let hasSavedOpeningBalance = false;
    let openingUpdatedAt = null;

    if (openingRow) {
      openingBalance = asNumber(openingRow.opening_balance, 0);
      hasSavedOpeningBalance = true;
      openingUpdatedAt = openingRow.updated_at || openingRow.created_at || null;
    } else if (dateKey !== startDateKey && groupsAsc.length > 0) {
      openingBalance = asNumber(groupsAsc[groupsAsc.length - 1]?.closing_balance, startingBalance);
    } else if (dateKey !== startDateKey) {
      openingBalance = startingBalance;
    }

    let runningBalance = openingBalance;
    let inTotal = 0;
    let outTotal = 0;

    const normalizedEntries = dayEntries.map((entry) => {
      const signedAmount = Number(entry.signed_amount || 0);
      if (signedAmount > 0) {
        inTotal += signedAmount;
      } else if (signedAmount < 0) {
        outTotal += Math.abs(signedAmount);
      }

      runningBalance += signedAmount;

      return {
        ...entry,
        running_balance: runningBalance,
      };
    });

    const closingBalance = openingBalance + inTotal - outTotal;

    groupsAsc.push({
      date: dateKey,
      label: formatDateLabel(dateKey, todayDateKey),
      opening_balance: openingBalance,
      has_saved_opening_balance: hasSavedOpeningBalance,
      opening_balance_updated_at: openingUpdatedAt,
      in_total: inTotal,
      out_total: outTotal,
      closing_balance: closingBalance,
      entry_count: normalizedEntries.length,
      auto_count: normalizedEntries.filter((entry) => entry.is_auto).length,
      manual_count: normalizedEntries.filter((entry) => !entry.is_auto && entry.type !== 'task').length,
      task_count: normalizedEntries.filter((entry) => entry.type === 'task').length,
      entries: normalizedEntries,
    });
  });

  const groupsDesc = groupsAsc.slice().reverse();
  const todaySummary = groupsAsc.find((group) => group.date === todayDateKey) || groupsAsc[groupsAsc.length - 1] || null;

  return {
    range: {
      start_date: startDateKey,
      end_date: todayDateKey,
      window_days: normalizedDays,
    },
    today_summary: todaySummary ? {
      date: todaySummary.date,
      label: todaySummary.label,
      opening_balance: todaySummary.opening_balance,
      in_total: todaySummary.in_total,
      out_total: todaySummary.out_total,
      closing_balance: todaySummary.closing_balance,
      entry_count: todaySummary.entry_count,
      auto_count: todaySummary.auto_count,
      manual_count: todaySummary.manual_count,
      task_count: todaySummary.task_count,
      has_saved_opening_balance: todaySummary.has_saved_opening_balance,
      opening_balance_updated_at: todaySummary.opening_balance_updated_at,
      entries: todaySummary.entries,
    } : null,
    groups: groupsDesc,
  };
};

const sanitizeNote = (sanitizeShortText, value, max = 500) =>
  String(sanitizeShortText(value || '', max) || '').trim() || null;

const normalizeDateKeyInput = (value) => parseDateKey(value) || '';

const normalizeEntryTypeInput = (value) => normalizeManualEntryType(value) || '';

const normalizeAdjustmentDirection = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'add' || raw === 'reduce') return raw;
  return '';
};

const parseAmountInput = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveOptionalTime = (value) => normalizeTimeToken(value) || '';

const resolveIdempotency = (req, resolveClientRequestId) => {
  const { value, error } = resolveClientRequestId(req);
  if (error) return { error };
  return { value: value || null };
};

const readExistingEntryForIdempotency = async (dbGetAsync, clientRequestId) => {
  if (!clientRequestId) return null;
  return dbGetAsync(
    `SELECT
       ce.id,
       ce.entry_date::text AS entry_date,
       TO_CHAR(ce.entry_time, 'HH24:MI:SS') AS entry_time,
       ce.type,
       ce.amount,
       ce.note,
       ce.source_id,
       ce.source_type,
       ce.created_by,
       creator.name AS created_by_name,
       ce.created_at,
       ce.updated_at
     FROM cashbook_entries ce
     LEFT JOIN users creator ON creator.id = ce.created_by
     WHERE ce.client_request_id = ? LIMIT 1`,
    [clientRequestId]
  );
};

const readOpeningBalanceRow = async (dbGetAsync, dateKey) => dbGetAsync(
  `SELECT
     ob.balance_date::text AS balance_date,
     ob.opening_balance,
     ob.note,
     ob.created_by,
     ob.updated_by,
     ob.created_at,
     ob.updated_at,
     creator.name AS created_by_name,
     updater.name AS updated_by_name
   FROM cashbook_opening_balances ob
   LEFT JOIN users creator ON creator.id = ob.created_by
   LEFT JOIN users updater ON updater.id = ob.updated_by
   WHERE ob.balance_date = DATE(?)`,
  [dateKey]
);

const registerCashbookRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireCapability,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    sanitizeShortText,
    resolveClientRequestId,
    isUniqueViolationError,
  } = deps;

  app.get('/api/admin/cashbook', requireCapability('view_backoffice', 'Backoffice access required'), async (req, res) => {
    try {
      const windowDays = normalizeWindowDays(req.query?.window_days || req.query?.windowDays);
      const endDateKey = parseDateKey(req.query?.date || req.query?.end_date || req.query?.endDate || '');
      const snapshot = await loadCashbookSnapshot(dbGetAsync, dbAllAsync, {
        windowDays,
        endDateKey,
      });
      return res.json(snapshot);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load cashbook snapshot' });
    }
  });

  app.put('/api/admin/cashbook/opening-balance', requireAdmin, async (req, res) => {
    try {
      const dateKey = normalizeDateKeyInput(req.body?.date || req.body?.balance_date || req.body?.day);
      if (!dateKey) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }

      const openingBalance = parseAmountInput(req.body?.opening_balance ?? req.body?.openingBalance);
      if (openingBalance === null) {
        return res.status(400).json({ error: 'opening_balance must be a valid number' });
      }

      const note = sanitizeNote(sanitizeShortText, req.body?.note || req.body?.notes, 500);
      const actorId = Number(req.authUser?.id || req.user?.id || 0) || null;

      await dbRunAsync(
        `INSERT INTO cashbook_opening_balances (balance_date, opening_balance, note, created_by, updated_by)
         VALUES (DATE(?), ?, ?, ?, ?)
         ON CONFLICT (balance_date) DO UPDATE SET
           opening_balance = EXCLUDED.opening_balance,
           note = EXCLUDED.note,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [dateKey, openingBalance, note, actorId, actorId]
      );

      const savedRow = await readOpeningBalanceRow(dbGetAsync, dateKey).catch(() => null);
      let snapshot = null;
      try {
        snapshot = await loadCashbookSnapshot(dbGetAsync, dbAllAsync, { endDateKey: dateKey });
      } catch {
        snapshot = null;
      }

      return res.json({
        success: true,
        opening_balance: serializeOpeningBalance(savedRow) || {
          date: dateKey,
          opening_balance: openingBalance,
          note,
          created_by: actorId,
          created_by_name: '',
          updated_by: actorId,
          updated_by_name: '',
          created_at: null,
          updated_at: null,
        },
        snapshot,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update opening balance' });
    }
  });

  app.post('/api/admin/cashbook/entries', requireAdmin, async (req, res) => {
    try {
      const type = normalizeEntryTypeInput(req.body?.type);
      if (!type) {
        return res.status(400).json({ error: 'type must be a valid manual cashbook entry' });
      }

      const { value: clientRequestId, error: requestIdError } = resolveIdempotency(req, resolveClientRequestId);
      if (requestIdError) {
        return res.status(400).json({ error: requestIdError });
      }

      if (clientRequestId) {
        const existing = await readExistingEntryForIdempotency(dbGetAsync, clientRequestId);
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            entry: serializeCashbookEntry(existing),
          });
        }
      }

      const entryDate = normalizeDateKeyInput(req.body?.date || req.body?.entry_date);
      if (!entryDate) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }

      const entryTime = resolveOptionalTime(req.body?.time || req.body?.entry_time);
      const note = sanitizeNote(sanitizeShortText, req.body?.note || req.body?.notes, 500);
      const actorId = Number(req.authUser?.id || req.user?.id || 0) || null;

      const amountValue = parseAmountInput(req.body?.amount);
      const adjustmentDirection = normalizeAdjustmentDirection(req.body?.adjustment_direction || req.body?.adjustmentDirection);

      if (type === 'task') {
        if (!note) {
          return res.status(400).json({ error: 'task requires a note' });
        }
      } else if (amountValue === null || !Number.isFinite(amountValue)) {
        return res.status(400).json({ error: 'amount must be a valid number' });
      } else if (Math.abs(amountValue) === 0) {
        return res.status(400).json({ error: 'amount must be greater than 0' });
      }

      let amount = 0;
      if (type !== 'task') {
        const rawAmount = Math.abs(Number(amountValue || 0));
        if (type === 'adjustment') {
          if (!adjustmentDirection) {
            return res.status(400).json({ error: 'adjustment_direction must be add or reduce' });
          }
          amount = adjustmentDirection === 'reduce' ? -rawAmount : rawAmount;
        } else if (type === 'manual_out' || type === 'expense') {
          amount = -rawAmount;
        } else {
          amount = rawAmount;
        }
      }

      try {
        const hasEntryTime = Boolean(entryTime);
        const insertSql = hasEntryTime
          ? `INSERT INTO cashbook_entries (
               entry_date,
               entry_time,
               type,
               amount,
               note,
               source_type,
               created_by,
               client_request_id
             ) VALUES (DATE(?), ?::time, ?, ?, ?, 'manual', ?, ?)`
          : `INSERT INTO cashbook_entries (
               entry_date,
               type,
               amount,
               note,
               source_type,
               created_by,
               client_request_id
             ) VALUES (DATE(?), ?, ?, ?, 'manual', ?, ?)`;
        const insertParams = hasEntryTime
          ? [entryDate, entryTime, type, amount, note, actorId, clientRequestId]
          : [entryDate, type, amount, note, actorId, clientRequestId];

        const result = await dbRunAsync(insertSql, insertParams);

        const row = await dbGetAsync(
          `SELECT
             ce.id,
             ce.entry_date::text AS entry_date,
             TO_CHAR(ce.entry_time, 'HH24:MI:SS') AS entry_time,
             ce.type,
             ce.amount,
             ce.note,
             ce.source_id,
             ce.source_type,
             ce.created_by,
             creator.name AS created_by_name,
             ce.created_at,
             ce.updated_at
           FROM cashbook_entries ce
           LEFT JOIN users creator ON creator.id = ce.created_by
           WHERE ce.id = ?`,
          [result?.lastInsertRowid]
        );

        const snapshot = await loadCashbookSnapshot(dbGetAsync, dbAllAsync, { endDateKey: entryDate });

        return res.status(201).json({
          success: true,
          entry: serializeCashbookEntry(row),
          snapshot,
        });
      } catch (error) {
        if (clientRequestId && isUniqueViolationError?.(error)) {
          const existing = await readExistingEntryForIdempotency(dbGetAsync, clientRequestId);
          if (existing) {
            return res.status(200).json({
              success: true,
              deduplicated: true,
              entry: serializeCashbookEntry(existing),
            });
          }
        }
        throw error;
      }
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to save cashbook entry' });
    }
  });

  app.delete('/api/admin/cashbook/entries/:id', requireAdmin, async (req, res) => {
    try {
      const entryId = Number(req.params?.id || 0);
      if (!Number.isFinite(entryId) || entryId <= 0) {
        return res.status(400).json({ error: 'entry id must be valid' });
      }

      const existing = await dbGetAsync(
        `SELECT
           ce.id,
           ce.entry_date::text AS entry_date,
           ce.type,
           ce.amount,
           ce.note,
           ce.source_type,
           ce.created_by,
           creator.name AS created_by_name,
           ce.created_at,
           ce.updated_at
         FROM cashbook_entries ce
         LEFT JOIN users creator ON creator.id = ce.created_by
         WHERE ce.id = ?`,
        [entryId]
      );

      if (!existing) {
        return res.status(404).json({ error: 'cashbook entry not found' });
      }

      const normalizedType = normalizeManualEntryType(existing.type);
      if (!normalizedType) {
        return res.status(400).json({ error: 'only manual cashbook entries can be deleted' });
      }

      await dbRunAsync('DELETE FROM cashbook_entries WHERE id = ?', [entryId]);
      const snapshot = await loadCashbookSnapshot(dbGetAsync, dbAllAsync);

      return res.json({
        success: true,
        deleted_entry: serializeCashbookEntry(existing),
        snapshot,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to delete cashbook entry' });
    }
  });

  app.put('/api/admin/cashbook/entries/:id', requireAdmin, async (req, res) => {
    try {
      const entryId = Number(req.params?.id || 0);
      if (!Number.isFinite(entryId) || entryId <= 0) {
        return res.status(400).json({ error: 'entry id must be valid' });
      }

      const existing = await dbGetAsync(
        `SELECT
           ce.id,
           ce.entry_date::text AS entry_date,
           TO_CHAR(ce.entry_time, 'HH24:MI:SS') AS entry_time,
           ce.type,
           ce.amount,
           ce.note,
           ce.source_type,
           ce.created_by,
           creator.name AS created_by_name,
           ce.created_at,
           ce.updated_at
         FROM cashbook_entries ce
         LEFT JOIN users creator ON creator.id = ce.created_by
         WHERE ce.id = ?`,
        [entryId]
      );

      if (!existing) {
        return res.status(404).json({ error: 'cashbook entry not found' });
      }

      const type = normalizeEntryTypeInput(req.body?.type);
      if (!type) {
        return res.status(400).json({ error: 'type must be a valid manual cashbook entry' });
      }

      const entryDate = normalizeDateKeyInput(req.body?.date || req.body?.entry_date || existing.entry_date);
      if (!entryDate) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }

      const entryTime = resolveOptionalTime(req.body?.time || req.body?.entry_time || existing.entry_time || '');
      const note = sanitizeNote(sanitizeShortText, req.body?.note || req.body?.notes, 500);
      const actorId = Number(req.authUser?.id || req.user?.id || 0) || null;
      const amountValue = parseAmountInput(req.body?.amount);
      const adjustmentDirection = normalizeAdjustmentDirection(req.body?.adjustment_direction || req.body?.adjustmentDirection);

      if (type === 'task') {
        if (!note) {
          return res.status(400).json({ error: 'task requires a note' });
        }
      } else if (amountValue === null || !Number.isFinite(amountValue)) {
        return res.status(400).json({ error: 'amount must be a valid number' });
      } else if (Math.abs(amountValue) === 0) {
        return res.status(400).json({ error: 'amount must be greater than 0' });
      }

      let amount = 0;
      if (type !== 'task') {
        const rawAmount = Math.abs(Number(amountValue || 0));
        if (type === 'adjustment') {
          if (!adjustmentDirection) {
            return res.status(400).json({ error: 'adjustment_direction must be add or reduce' });
          }
          amount = adjustmentDirection === 'reduce' ? -rawAmount : rawAmount;
        } else if (type === 'manual_out' || type === 'expense') {
          amount = -rawAmount;
        } else {
          amount = rawAmount;
        }
      }

      const updateSql = entryTime
        ? `UPDATE cashbook_entries
             SET entry_date = DATE(?),
                 entry_time = ?::time,
                 type = ?,
                 amount = ?,
                 note = ?,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        : `UPDATE cashbook_entries
             SET entry_date = DATE(?),
                 entry_time = NULL,
                 type = ?,
                 amount = ?,
                 note = ?,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`;
      const updateParams = entryTime
        ? [entryDate, entryTime, type, amount, note, actorId, entryId]
        : [entryDate, type, amount, note, actorId, entryId];

      await dbRunAsync(updateSql, updateParams);

      const row = await dbGetAsync(
        `SELECT
           ce.id,
           ce.entry_date::text AS entry_date,
           TO_CHAR(ce.entry_time, 'HH24:MI:SS') AS entry_time,
           ce.type,
           ce.amount,
           ce.note,
           ce.source_id,
           ce.source_type,
           ce.created_by,
           creator.name AS created_by_name,
           ce.created_at,
           ce.updated_at
         FROM cashbook_entries ce
         LEFT JOIN users creator ON creator.id = ce.created_by
         WHERE ce.id = ?`,
        [entryId]
      );

      const snapshot = await loadCashbookSnapshot(dbGetAsync, dbAllAsync, { endDateKey: entryDate });

      return res.json({
        success: true,
        entry: serializeCashbookEntry(row),
        snapshot,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update cashbook entry' });
    }
  });
};

module.exports = { registerCashbookRoutes };
