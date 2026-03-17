const validateMessagePayload = ({
  message,
  recipientUserIds,
} = {}) => {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) return { error: 'Message is required' };
  if (normalizedMessage.length > 1000) return { error: 'Message is too long (max 1000 characters)' };

  const recipientIds = Array.from(new Set(
    (Array.isArray(recipientUserIds) ? recipientUserIds : [])
      .map((value) => Number(value || 0))
      .filter((value) => value > 0)
  ));
  if (!recipientIds.length) {
    return { error: 'Select at least one customer' };
  }
  if (recipientIds.length > 100) {
    return { error: 'Too many recipients (max 100)' };
  }

  return {
    message: normalizedMessage,
    recipientIds,
  };
};

const resolveSenderName = (authUser) => String(authUser?.name || '').trim() || 'Admin';

module.exports = { validateMessagePayload, resolveSenderName };
