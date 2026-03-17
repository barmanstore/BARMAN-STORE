const buildRecipientRequestId = ({ clientRequestId, recipientId, crypto } = {}) => {
  if (!clientRequestId || !recipientId) return null;
  return `notif:${crypto.createHash('sha1').update(`${clientRequestId}:${recipientId}`).digest('hex').slice(0, 32)}`;
};

const buildSenderRequestId = ({ clientRequestId, crypto } = {}) => {
  if (!clientRequestId) return null;
  return `notif:${crypto.createHash('sha1').update(`${clientRequestId}:sender`).digest('hex').slice(0, 32)}`;
};

const sendCustomerNotifications = async ({
  recipients,
  senderId,
  senderName,
  message,
  clientRequestId,
  createAppNotification,
  crypto,
} = {}) => {
  for (const recipient of recipients) {
    const recipientId = Number(recipient?.id || 0);
    if (!recipientId) continue;
    await createAppNotification({
      userId: recipientId,
      title: `Message from ${senderName}`,
      message,
      level: 'info',
      entityType: 'conversation',
      metadata: {
        kind: 'chat_message',
        direction: 'admin_to_customer',
        from_user_id: senderId,
        from_user_name: senderName,
        route: '/profile',
      },
      createdBy: senderId,
      clientRequestId: buildRecipientRequestId({ clientRequestId, recipientId, crypto }),
    });
  }
};

const sendSenderReceipt = async ({
  senderId,
  senderName,
  message,
  recipientCount,
  clientRequestId,
  createAppNotification,
  crypto,
} = {}) => {
  await createAppNotification({
    userId: senderId,
    title: 'Message sent',
    message: `Message sent to ${recipientCount} customer${recipientCount === 1 ? '' : 's'}.`,
    level: 'success',
    entityType: 'conversation',
    metadata: {
      kind: 'chat_message',
      direction: 'outbound',
      route: '/admin?tab=users',
    },
    createdBy: senderId,
    clientRequestId: buildSenderRequestId({ clientRequestId, crypto }),
  });
};

module.exports = { sendCustomerNotifications, sendSenderReceipt };
