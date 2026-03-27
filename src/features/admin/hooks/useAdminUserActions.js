import { hasCapability } from '../../../shared/auth/capabilities';

const useAdminUserActions = ({
  currentUser,
  usersApi,
  setUsers,
  loadUsersPage,
  usersPage,
  usersSearchQuery,
  showNotification,
  setEditingUser,
  setIsCreatingUser,
  setShowUserForm,
}) => {
  const handleDeleteUser = async (id) => {
    if (!hasCapability(currentUser, 'manage_users')) {
      showNotification('You do not have permission to delete users.', 'error');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this customer?')) return;

    try {
      await usersApi.delete(id);
      if (typeof loadUsersPage === 'function') {
        await loadUsersPage({ page: usersPage, query: usersSearchQuery, silent: false });
      } else {
        setUsers((prev) => prev.filter((user) => user.id !== id));
      }
      showNotification('Customer deleted successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to delete customer', 'error');
    }
  };

  const handleEditUser = (user) => {
    if (!hasCapability(currentUser, 'manage_users')) {
      showNotification('You do not have permission to edit users.', 'error');
      return;
    }
    if (!user) {
      return;
    }
    setEditingUser(user);
    setIsCreatingUser(false);
    setShowUserForm(true);
  };

  const handleUserSave = async () => {
    try {
      if (typeof loadUsersPage === 'function') {
        await loadUsersPage({ page: usersPage, query: usersSearchQuery, silent: false });
      } else {
        const updatedUsers = await usersApi.getAll();
        setUsers(updatedUsers);
      }
      showNotification('User updated successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  const handleAddUser = () => {
    if (!hasCapability(currentUser, 'manage_users')) {
      showNotification('You do not have permission to create users.', 'error');
      return;
    }
    setEditingUser(null);
    setIsCreatingUser(true);
    setShowUserForm(true);
  };

  const handleCreateUser = async () => {
    try {
      if (typeof loadUsersPage === 'function') {
        await loadUsersPage({ page: 1, query: '', silent: false });
      } else {
        const updatedUsers = await usersApi.getAll();
        setUsers(updatedUsers);
      }
      showNotification('User created successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  return {
    handleDeleteUser,
    handleEditUser,
    handleUserSave,
    handleAddUser,
    handleCreateUser,
  };
};

export default useAdminUserActions;
