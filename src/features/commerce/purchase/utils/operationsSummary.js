const DEFAULT_OPERATION_CARDS = {
  outstanding_amount: 0,
  payable_today_amount: 0,
  overdue_amount: 0,
  predicted_payment_today_amount: 0,
  predicted_payment_next_count: 0,
  predicted_delivery_next_count: 0,
  next_payment_due_date: null,
  next_delivery_date: null,
  paid_today_amount: 0,
  reminder_count: 0,
  waiting_bill_count: 0,
  waiting_delivery_count: 0,
  close_ready_count: 0,
  today_distributor_count: 0,
  tomorrow_distributor_count: 0,
  weekly_distributor_count: 0,
};

const DEFAULT_ACTION_ROLLUPS = {
  range: { start_date: null, end_date: null },
  actions: [],
  totals: {},
  by_day: [],
  by_weekday: [],
};

const createDefaultOperationsSummary = () => ({
  cards: { ...DEFAULT_OPERATION_CARDS },
  today_distributors: [],
  tomorrow_distributors: [],
  weekly_distributors: [],
  predicted_payments_today: [],
  predicted_payments_next: [],
  predicted_deliveries_next: [],
  reminders: [],
  payables: [],
  workflow: [],
  distributor_insights: [],
  action_rollups: {
    range: { ...DEFAULT_ACTION_ROLLUPS.range },
    actions: [],
    totals: {},
    by_day: [],
    by_weekday: [],
  },
});

export default createDefaultOperationsSummary;
