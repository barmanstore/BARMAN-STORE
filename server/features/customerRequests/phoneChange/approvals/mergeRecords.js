const createPhoneMergeRecords = (deps = {}) => {
  const { dbRunAsync } = deps;

  const movePhoneLinkedIdentityRecords = async ({ fromUserId, toUserId }) => {
    const sourceId = Number(fromUserId || 0);
    const targetId = Number(toUserId || 0);
    if (!sourceId || !targetId || sourceId === targetId) return;
    await dbRunAsync('UPDATE credit_history SET user_id = ? WHERE user_id = ?', [
      targetId,
      sourceId,
    ]);
    await dbRunAsync('UPDATE credit_entry_issues SET user_id = ? WHERE user_id = ?', [
      targetId,
      sourceId,
    ]);
    await dbRunAsync('UPDATE bills SET customer_id = ? WHERE customer_id = ?', [
      targetId,
      sourceId,
    ]);
    await dbRunAsync('UPDATE orders SET user_id = ? WHERE user_id = ?', [targetId, sourceId]);
    await dbRunAsync('UPDATE product_recommendations SET user_id = ? WHERE user_id = ?', [
      targetId,
      sourceId,
    ]);
  };

  return { movePhoneLinkedIdentityRecords };
};

module.exports = { createPhoneMergeRecords };
