const ROLE_CAPABILITIES = Object.freeze({
  admin: Object.freeze([
    'view_backoffice',
    'manage_users',
    'delete_bills',
    'edit_products',
    'manage_purchase_orders',
  ]),
  staff: Object.freeze([
    'view_backoffice',
    'edit_products',
    'manage_purchase_orders',
  ]),
  viewer: Object.freeze([
    'view_backoffice',
  ]),
  customer: Object.freeze([]),
});

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const getRoleCapabilities = (role) => ROLE_CAPABILITIES[normalizeRole(role)] || ROLE_CAPABILITIES.customer;

const userHasCapability = (user, capability) => {
  const token = String(capability || '').trim();
  if (!token) return false;
  return getRoleCapabilities(user?.role).includes(token);
};

module.exports = {
  ROLE_CAPABILITIES,
  normalizeRole,
  getRoleCapabilities,
  userHasCapability,
};
