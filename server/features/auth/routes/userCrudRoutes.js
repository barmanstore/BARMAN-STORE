const { registerUserAdminListRoutes } = require('./userCrud/userAdminList');
const { registerUserRoleRoutes } = require('./userCrud/userRoleActions');
const { registerUserProfileRoutes } = require('./userCrud/userProfileUpdates');

const registerUserCrudRoutes = (deps) => {
  registerUserAdminListRoutes(deps);
  registerUserRoleRoutes(deps);
  registerUserProfileRoutes(deps);
};

module.exports = { registerUserCrudRoutes };
