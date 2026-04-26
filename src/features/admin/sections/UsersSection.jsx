import { Link } from 'react-router-dom';
import { ChevronDown, CreditCard, Edit, Plus, Shield, Trash2, User } from 'lucide-react';
import AdminPageHeader from '../components/AdminPageHeader';
import { formatJoinedDate, getInitials } from '../utils/adminHelpers';
import { formatCurrency } from '../../../shared/utils/formatters';
import { SearchFilter } from '../../../shared/components/filters';

const formatCreditLimitLabel = (value) =>
  Number(value || 0) > 0 ? formatCurrency(value) : 'Unrestricted';
const formatVerificationLabel = (isVerified) => (isVerified ? 'Verified' : 'Pending verification');
const formatRoleLabel = (role) =>
  String(role || '').trim().toLowerCase() === 'admin' ? 'Admin' : 'Customer';

function UserCompactCard({
  user,
  isExpanded,
  onToggle,
  resolveMediaUrl,
  userAvatarErrors,
  setUserAvatarErrors,
  truncateUserName,
  handleEditUser,
  handleDeleteUser,
}) {
  const isAdminUser = String(user?.role || '').trim().toLowerCase() === 'admin';
  const detailsId = `user-compact-details-${user.id}`;
  const roleLabel = formatRoleLabel(user?.role);
  const RoleIcon = isAdminUser ? Shield : User;
  const creditBalanceLabel = formatCurrency(user?.credit_balance || 0);

  return (
    <article
      className={`user-compact-card${isExpanded ? ' expanded' : ''} ${
        isAdminUser ? 'admin' : 'customer'
      }`}
    >
      <div className="user-compact-summary">
        <button
          type="button"
          className="user-compact-summary-main"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={onToggle}
        >
          <span className="user-compact-identity">
            {user.profile_image && !userAvatarErrors[user.id] ? (
              <img
                src={resolveMediaUrl(user.profile_image)}
                alt={user.name || 'User'}
                className="admin-user-avatar"
                onError={() => setUserAvatarErrors((prev) => ({ ...prev, [user.id]: true }))}
              />
            ) : (
              <span className="admin-user-avatar-fallback">{getInitials(user.name)}</span>
            )}
            <span className="user-compact-copy">
              <span className="user-compact-name-row">
                <span className="user-compact-name">{truncateUserName(user.name || '-', 20)}</span>
                <span
                  className={`user-compact-role-badge ${isAdminUser ? 'admin' : 'customer'}`}
                  title={roleLabel}
                  aria-label={roleLabel}
                >
                  <RoleIcon size={12} aria-hidden="true" />
                </span>
              </span>
              <span className="user-compact-subline">
                Joined {formatJoinedDate(user.created_at)}
              </span>
            </span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className="user-compact-chevron" />
        </button>

        <div className="user-compact-summary-actions">
          {!isAdminUser ? (
            <>
              <Link
                to={`/admin/users/${user.id}/credit?returnTab=users`}
                className="action-btn credit user-compact-credit-btn"
                title="Credit Khata"
                aria-label="Open Credit Khata"
              >
                <CreditCard size={14} />
              </Link>
              <span
                className={`user-credit-balance ${
                  user.credit_balance > 0
                    ? 'outstanding'
                    : user.credit_balance < 0
                      ? 'negative'
                      : 'settled'
                }`}
                title={`Credit balance ${creditBalanceLabel}`}
              >
                {creditBalanceLabel}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <div className="user-compact-details" id={detailsId}>
          <div className="user-compact-details-grid">
            <div className="user-compact-detail">
              <span>Email</span>
              <strong>{user.email || '-'}</strong>
            </div>
            <div className="user-compact-detail">
              <span>Phone</span>
              <strong>{user.phone || '-'}</strong>
            </div>
            {!isAdminUser ? (
              <div className="user-compact-detail">
                <span>Credit Limit</span>
                <strong>{formatCreditLimitLabel(user.credit_limit)}</strong>
              </div>
            ) : null}
          </div>
          <div className="user-compact-status-row">
            <span
              className={`user-compact-status-pill ${
                user.email_verified ? 'verified' : 'pending'
              }`}
            >
              Email {formatVerificationLabel(user.email_verified)}
            </span>
            <span
              className={`user-compact-status-pill ${
                user.phone_verified ? 'verified' : 'pending'
              }`}
            >
              Phone {formatVerificationLabel(user.phone_verified)}
            </span>
          </div>
          {!isAdminUser ? (
            <div className="user-compact-actions">
              <button
                className="action-btn edit"
                onClick={() => handleEditUser(user)}
                title="Edit customer"
              >
                <Edit size={16} />
              </button>
              <button
                className="action-btn delete"
                onClick={() => handleDeleteUser(user.id)}
                title="Delete user"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function UsersSection({
  handleAddUser,
  usersSearchQuery,
  setUsersSearchQuery,
  filteredUsersCount,
  users,
  filteredUsers,
  usersPage,
  setUsersPage,
  usersTotal,
  usersLoading,
  expandedUsersMap,
  toggleUserCompactRow,
  resolveMediaUrl,
  userAvatarErrors,
  setUserAvatarErrors,
  truncateUserName,
  handleEditUser,
  handleDeleteUser,
}) {
  const totalPages = Math.max(1, Math.ceil(Number(usersTotal || 0) / 25));

  return (
    <div className="users-management">
      <AdminPageHeader
        className="section-header"
        title="Users Management"
        actions={
          <button className="admin-btn primary" onClick={handleAddUser}>
            <Plus size={20} /> Add Customer
          </button>
        }
      />
      <div className="users-toolbar">
        <SearchFilter
          id="users-search-filter"
          className="users-search-filter"
          placeholder="Search users by name, email, phone, id..."
          value={usersSearchQuery}
          onChange={setUsersSearchQuery}
          onSubmit={setUsersSearchQuery}
          width="min(560px, 100%)"
          ariaLabel="Search users by name, email, phone, id"
          ariaAutocomplete="none"
          submitAriaLabel="Search users"
        />
        <span className="users-search-count">
          Showing {filteredUsersCount} of {usersTotal || users.length} users
        </span>
      </div>
      <div className="admin-pagination">
        <span className="admin-pagination-label">
          Page {usersPage} of {totalPages}
        </span>
        <div className="admin-pagination-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={() => setUsersPage(Math.max(1, usersPage - 1))}
            disabled={usersPage <= 1 || usersLoading}
          >
            Previous
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setUsersPage(Math.min(totalPages, usersPage + 1))}
            disabled={usersPage >= totalPages || usersLoading}
          >
            Next
          </button>
        </div>
      </div>
      {usersLoading ? <p className="admin-list-loading">Loading users...</p> : null}
      <div className="users-group">
        <h2>Admins ({filteredUsers.admins.length})</h2>
        <div className="users-compact-list">
          {filteredUsers.admins.length === 0 ? (
            <p className="users-empty">No admins found.</p>
          ) : (
            filteredUsers.admins.map((u) => {
              const isExpanded = Boolean(expandedUsersMap[u.id]);
              return (
                <UserCompactCard
                  key={u.id}
                  user={u}
                  isExpanded={isExpanded}
                  onToggle={() => toggleUserCompactRow(u.id)}
                  resolveMediaUrl={resolveMediaUrl}
                  userAvatarErrors={userAvatarErrors}
                  setUserAvatarErrors={setUserAvatarErrors}
                  truncateUserName={truncateUserName}
                  handleEditUser={handleEditUser}
                  handleDeleteUser={handleDeleteUser}
                />
              );
            })
          )}
        </div>
      </div>
      <div className="users-group">
        <h2>Customers ({filteredUsers.customers.length})</h2>
        <div className="users-compact-list">
          {filteredUsers.customers.length === 0 ? (
            <p className="users-empty">No customers found.</p>
          ) : (
            filteredUsers.customers.map((u) => {
              const isExpanded = Boolean(expandedUsersMap[u.id]);
              return (
                <UserCompactCard
                  key={u.id}
                  user={u}
                  isExpanded={isExpanded}
                  onToggle={() => toggleUserCompactRow(u.id)}
                  resolveMediaUrl={resolveMediaUrl}
                  userAvatarErrors={userAvatarErrors}
                  setUserAvatarErrors={setUserAvatarErrors}
                  truncateUserName={truncateUserName}
                  handleEditUser={handleEditUser}
                  handleDeleteUser={handleDeleteUser}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default UsersSection;
