const findExistingBatch = async ({ dbGetAsync, clientRequestId, senderId, parseJsonText } = {}) => {
  if (!clientRequestId || !senderId) return null;
  const existingBatch = await dbGetAsync(
    `SELECT id, sent_count, recipient_names, recipient_count
     FROM notification_send_batches
     WHERE client_request_id = ? AND sender_user_id = ?
     LIMIT 1`,
    [clientRequestId, senderId]
  );
  if (!existingBatch) return null;
  return {
    id: Number(existingBatch.id || 0) || null,
    sent_count: Number(existingBatch.sent_count || 0),
    recipient_names: parseJsonText(existingBatch.recipient_names, []) || [],
    recipient_count: Number(existingBatch.recipient_count || 0),
  };
};

const createSendBatch = async ({
  dbRunAsync,
  clientRequestId,
  senderId,
  message,
  recipientIds,
  recipientNames,
  safeSerializeJson,
} = {}) => {
  if (!clientRequestId) return null;
  const inserted = await dbRunAsync(
    `INSERT INTO notification_send_batches
     (client_request_id, sender_user_id, message, recipient_user_ids, recipient_names, recipient_count, sent_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clientRequestId,
      senderId,
      message,
      safeSerializeJson(recipientIds),
      safeSerializeJson(recipientNames),
      recipientIds.length,
      0,
      'processing',
    ]
  );
  return Number(inserted.lastInsertRowid || 0) || null;
};

const finalizeSendBatch = async ({ dbRunAsync, batchId, sentCount } = {}) => {
  if (!batchId) return;
  await dbRunAsync(
    `UPDATE notification_send_batches
     SET status = ?, sent_count = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ['sent', sentCount, batchId]
  );
};

module.exports = { findExistingBatch, createSendBatch, finalizeSendBatch };
