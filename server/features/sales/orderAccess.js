const createOrderAccess = () => {
  const canAccessOrder = (authUser, order) => {
    if (!authUser || !order) return false;
    if (authUser.role === 'admin') return true;
    const ownerId = Number(order.user_id || order.customer_id || 0);
    return ownerId > 0 && Number(authUser.id) === ownerId;
  };

  return { canAccessOrder };
};

module.exports = { createOrderAccess };
