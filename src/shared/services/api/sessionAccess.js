let sessionAccess = {
  getUser: () => null,
  clearUser: null,
};

export const registerSessionAccess = ({ getUser, clearUser } = {}) => {
  sessionAccess = {
    getUser: typeof getUser === 'function' ? getUser : () => null,
    clearUser: typeof clearUser === 'function' ? clearUser : null,
  };
};

export const getSessionUser = () => sessionAccess.getUser?.() ?? null;

export const clearSession = () => {
  if (typeof sessionAccess.clearUser === 'function') {
    sessionAccess.clearUser();
  }
};
