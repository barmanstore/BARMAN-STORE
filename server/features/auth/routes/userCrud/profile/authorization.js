const resolveProfileTarget = ({ req, targetUserId } = {}) => {
  const isAdmin = req.authUser?.role === 'admin';
  const isSelf = Number(req.authUser?.id || 0) === Number(targetUserId || 0);
  return { isAdmin, isSelf };
};

const ensureProfileAccess = ({ isAdmin, isSelf } = {}) => {
  if (!isAdmin && !isSelf) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
};

module.exports = { resolveProfileTarget, ensureProfileAccess };
