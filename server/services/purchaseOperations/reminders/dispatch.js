const createPurchaseOperationsReminderDispatch = (deps) => {
  const {
    dbGetAsync,
    dbRunAsync,
    normalizeTransactionDate,
    notifyAdmins,
  } = deps;

  const saveDistributorPurchaseReminderAsync = async ({
    distributorId,
    purchaseOrderId = null,
    reminderType,
    scheduledFor,
    status = 'pending',
    title = null,
    message = null,
    whatsappUrl = null,
    createdBy = null,
  } = {}) => {
    if (!distributorId || !reminderType || !scheduledFor) return null;
    const scheduledDate = normalizeTransactionDate(scheduledFor);
    if (!scheduledDate) return null;
    const existing = await dbGetAsync(
      `SELECT * FROM distributor_purchase_reminders
       WHERE distributor_id = ?
         AND COALESCE(purchase_order_id, 0) = COALESCE(?, 0)
         AND reminder_type = ?
         AND scheduled_for = ?`,
      [distributorId, purchaseOrderId || null, reminderType, scheduledDate]
    );
    if (existing) return existing;
    const result = await dbRunAsync(
      `INSERT INTO distributor_purchase_reminders
       (distributor_id, purchase_order_id, reminder_type, scheduled_for, status, title, message, whatsapp_url, created_by, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'prepared' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        distributorId,
        purchaseOrderId || null,
        reminderType,
        scheduledDate,
        status,
        title || null,
        message || null,
        whatsappUrl || null,
        createdBy || null,
        status,
      ]
    );
    return dbGetAsync(`SELECT * FROM distributor_purchase_reminders WHERE id = ?`, [result.lastInsertRowid]);
  };

  const emitPurchaseOperationNotificationsAsync = async ({
    todayKey,
    reminders = [],
    payables = [],
    createdBy = null,
  } = {}) => {
    const normalizedTodayKey = normalizeTransactionDate(todayKey || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    let reminderNotifications = 0;
    let paymentNotifications = 0;

    for (const reminder of Array.isArray(reminders) ? reminders : []) {
      await saveDistributorPurchaseReminderAsync({
        distributorId: reminder.distributor_id,
        purchaseOrderId: null,
        reminderType: 'order_day_warning',
        scheduledFor: reminder.reminder_for,
        status: 'pending',
        title: `Order reminder for ${reminder.distributor_name}`,
        message: reminder.message,
        createdBy,
      });
      const createdId = await notifyAdmins({
        title: `Order reminder tomorrow: ${reminder.distributor_name}`,
        message: `${reminder.distributor_name} is scheduled for order/visit on ${reminder.reminder_for}. ${reminder.has_open_draft ? 'Open draft exists.' : 'No open draft yet.'}`,
        level: 'warning',
        entityType: 'purchase_distributor',
        entityId: reminder.distributor_id,
        metadata: reminder,
        createdBy,
        clientRequestIdPrefix: `purchase:order-reminder:${reminder.distributor_id}:${reminder.reminder_for}`,
      });
      reminderNotifications += Number(createdId || 0) > 0 ? 1 : 0;
    }

    for (const payable of (Array.isArray(payables) ? payables : []).filter((entry) => entry.payment_due_date <= normalizedTodayKey)) {
      const reminderType = payable.payment_due_date < normalizedTodayKey ? 'payment_overdue' : 'payment_due_today';
      await saveDistributorPurchaseReminderAsync({
        distributorId: payable.distributor_id,
        purchaseOrderId: payable.order_id,
        reminderType,
        scheduledFor: normalizedTodayKey,
        status: 'pending',
        title: `${payable.distributor_name} payment ${payable.payment_due_date < normalizedTodayKey ? 'overdue' : 'due today'}`,
        message: `${payable.po_number} has ${payable.balance_due} pending against ${payable.distributor_name}`,
        createdBy,
      });
      const createdId = await notifyAdmins({
        title: payable.payment_due_date < normalizedTodayKey
          ? `Overdue distributor payment: ${payable.distributor_name}`
          : `Distributor payment due today: ${payable.distributor_name}`,
        message: `${payable.po_number} has ${payable.balance_due} pending. Due date: ${payable.payment_due_date}.`,
        level: payable.payment_due_date < normalizedTodayKey ? 'error' : 'warning',
        entityType: 'purchase_order',
        entityId: payable.order_id,
        metadata: payable,
        createdBy,
        clientRequestIdPrefix: payable.payment_due_date < normalizedTodayKey
          ? `purchase:payment-overdue:${payable.order_id}:${normalizedTodayKey}`
          : `purchase:payment-due:${payable.order_id}:${normalizedTodayKey}`,
      });
      paymentNotifications += Number(createdId || 0) > 0 ? 1 : 0;
    }

    return {
      reminder_notifications: reminderNotifications,
      payment_notifications: paymentNotifications,
    };
  };

  return {
    saveDistributorPurchaseReminderAsync,
    emitPurchaseOperationNotificationsAsync,
  };
};

module.exports = { createPurchaseOperationsReminderDispatch };
