export const sortPurchaseAnalyticsEntries = (entries = [], mode = 'balance_desc') => {
  const list = Array.isArray(entries) ? [...entries] : [];
  const asNumber = (value) => Number(value || 0);
  const asText = (value) =>
    String(value || '')
      .trim()
      .toLowerCase();
  const asDate = (value) => String(value || '').trim();
  return list.sort((a, b) => {
    if (mode === 'name_asc') {
      return asText(a.distributor_name).localeCompare(asText(b.distributor_name));
    }
    if (mode === 'date_asc') {
      return (
        asDate(a.schedule_date || a.payment_due_date || a.next_payment_due_date).localeCompare(
          asDate(b.schedule_date || b.payment_due_date || b.next_payment_due_date)
        ) || asText(a.distributor_name).localeCompare(asText(b.distributor_name))
      );
    }
    if (mode === 'overdue_desc') {
      return (
        asNumber(b.overdue_amount || b.overdue_days) -
          asNumber(a.overdue_amount || a.overdue_days) ||
        asNumber(b.due_today_amount || b.balance_due) -
          asNumber(a.due_today_amount || a.balance_due)
      );
    }
    if (mode === 'ledger_desc') {
      return (
        asNumber(b.ledger_balance) - asNumber(a.ledger_balance) ||
        asNumber(b.po_balance_due || b.balance_due) - asNumber(a.po_balance_due || a.balance_due)
      );
    }
    return (
      asNumber(b.po_balance_due || b.balance_due || b.outstanding_amount) -
        asNumber(a.po_balance_due || a.balance_due || a.outstanding_amount) ||
      asText(a.distributor_name).localeCompare(asText(b.distributor_name))
    );
  });
};
