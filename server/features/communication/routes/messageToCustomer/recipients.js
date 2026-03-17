const fetchMessageRecipients = async ({ dbAllAsync, recipientIds } = {}) => {
  const placeholders = recipientIds.map(() => '?').join(', ');
  const recipients = await dbAllAsync(
    `SELECT id, name
     FROM users
     WHERE role = 'customer'
       AND id IN (${placeholders})
     ORDER BY name ASC`,
    recipientIds
  );
  return recipients || [];
};

const mapRecipientNames = (recipients = []) => recipients
  .map((row) => String(row?.name || '').trim())
  .filter(Boolean);

module.exports = { fetchMessageRecipients, mapRecipientNames };
