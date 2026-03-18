const ROLE_CAPABILITIES = {
  admin: ['view_backoffice', 'manage_users', 'delete_bills', 'edit_products', 'manage_purchase_orders'],
  staff: ['view_backoffice', 'edit_products', 'manage_purchase_orders'],
  viewer: ['view_backoffice'],
  customer: [],
};

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const hasCapability = (user, capability) => {
  const role = normalizeRole(user?.role);
  const capabilities = ROLE_CAPABILITIES[role] || [];
  return capabilities.includes(String(capability || '').trim());
};

export { ROLE_CAPABILITIES, hasCapability, normalizeRole };
