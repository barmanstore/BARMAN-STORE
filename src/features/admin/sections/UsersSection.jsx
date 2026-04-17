import { Link } from 'react-router-dom';
import { CreditCard, Edit, Plus, Trash2 } from 'lucide-react';
import AdminPageHeader from '../components/AdminPageHeader';
import { formatJoinedDate, getInitials } from '../utils/adminHelpers';
import { formatCurrency } from '../../../shared/utils/formatters';

const formatCreditLimitLabel = (value) => (Number(value || 0) > 0 ? formatCurrency(value) : 'Unrestricted');
const formatVerificationLabel = (isVerified) => (isVerified ? 'Verified' : 'Pending verification');

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
  handleCompactRowKeyToggle,
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
              actions={(
                <button className="admin-btn primary" onClick={handleAddUser}>
                  <Plus size={20} /> Add Customer
                </button>
              )}
            />
            <div className="users-toolbar">
              <input
                id="users-search-input"
                name="users_search_query"
                type="text"
                className="users-search-input"
                placeholder="Search users by name, email, phone, id..."
                value={usersSearchQuery}
                onChange={(e) => setUsersSearchQuery(e.target.value)}
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
            {usersLoading ? (
              <p className="admin-list-loading">Loading users...</p>
            ) : null}
            <div className="users-group">
              <h2>Admins ({filteredUsers.admins.length})</h2>
              <div className="users-compact-list">
                {filteredUsers.admins.length === 0 ? (
                  <p className="users-empty">No admins found.</p>
                ) : filteredUsers.admins.map((u) => {
                  const isExpanded = Boolean(expandedUsersMap[u.id]);
                  return (
                    <article className={`user-compact-card${isExpanded ? ' expanded' : ''}`} key={u.id}>
                      <div
                        className="user-compact-summary"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleUserCompactRow(u.id)}
                        onKeyDown={(event) => handleCompactRowKeyToggle(event, u.id)}
                      >
                        <div className="user-compact-name-wrap">
                          {u.profile_image && !userAvatarErrors[u.id] ? (
                            <img
                              src={resolveMediaUrl(u.profile_image)}
                              alt={u.name || 'User'}
                              className="admin-user-avatar"
                              onError={() => setUserAvatarErrors((prev) => ({ ...prev, [u.id]: true }))}
                            />
                          ) : (
                            <span className="admin-user-avatar-fallback">{getInitials(u.name)}</span>
                          )}
                          <span className="user-compact-name">{truncateUserName(u.name || '-', 15)}</span>
                        </div>
                        <span className="admin-badge">Admin</span>
                      </div>
                      {isExpanded && (
                        <div className="user-compact-details">
                          <p><strong>Email:</strong> {u.email || '-'}</p>
                          <p><strong>Phone:</strong> {u.phone || '-'}</p>
                          <p><strong>Joined:</strong> {formatJoinedDate(u.created_at)}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="users-group">
              <h2>Customers ({filteredUsers.customers.length})</h2>
              <div className="users-compact-list">
                {filteredUsers.customers.length === 0 ? (
                  <p className="users-empty">No customers found.</p>
                ) : filteredUsers.customers.map((u) => {
                  const isExpanded = Boolean(expandedUsersMap[u.id]);
                  return (
                    <article className={`user-compact-card${isExpanded ? ' expanded' : ''}`} key={u.id}>
                      <div
                        className="user-compact-summary"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleUserCompactRow(u.id)}
                        onKeyDown={(event) => handleCompactRowKeyToggle(event, u.id)}
                      >
                        <div className="user-compact-name-wrap">
                          {u.profile_image && !userAvatarErrors[u.id] ? (
                            <img
                              src={resolveMediaUrl(u.profile_image)}
                              alt={u.name || 'User'}
                              className="admin-user-avatar"
                              onError={() => setUserAvatarErrors((prev) => ({ ...prev, [u.id]: true }))}
                            />
                          ) : (
                            <span className="admin-user-avatar-fallback">{getInitials(u.name)}</span>
                          )}
                          <span className="user-compact-name">{truncateUserName(u.name || '-', 15)}</span>
                        </div>
                        <Link
                          to={`/admin/users/${u.id}/credit?returnTab=users`}
                          className="action-btn credit user-compact-credit-btn"
                          title="Credit Khata"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <CreditCard size={15} />
                          <span>Credit Khata</span>
                        </Link>
                      </div>
                      {isExpanded && (
                        <div className="user-compact-details">
                          <p><strong>Email:</strong> {u.email || '-'}</p>
                          <p><strong>Phone:</strong> {u.phone || '-'}</p>
                          <p><strong>Email status:</strong> {formatVerificationLabel(u.email_verified)}</p>
                          <p><strong>Phone status:</strong> {formatVerificationLabel(u.phone_verified)}</p>
                          <p><strong>Joined:</strong> {formatJoinedDate(u.created_at)}</p>
                          <p><strong>Credit Limit:</strong> {formatCreditLimitLabel(u.credit_limit)}</p>
                          <div className="user-compact-actions">
                            <button
                              className="action-btn edit"
                              onClick={() => handleEditUser(u)}
                              title="Edit customer"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDeleteUser(u.id)}
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
  );
}

export default UsersSection;

