const useAdminUserActions = ({
  usersApi,
  setUsers,
  showNotification,
  setEditingUser,
  setIsCreatingUser,
  setShowUserForm,
}) => {
  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;

    try {
      await usersApi.delete(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
      showNotification('Customer deleted successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to delete customer', 'error');
    }
  };

  const handleEditUser = (user) => {
    if (!user || !user.email_verified || !user.phone_verified) {
      showNotification('User type can be changed only when both email and phone are verified.', 'error');
      return;
    }
    setEditingUser(user);
  };

  const handleUserSave = async () => {
    try {
      const updatedUsers = await usersApi.getAll();
      setUsers(updatedUsers);
      showNotification('User updated successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setIsCreatingUser(true);
    setShowUserForm(true);
  };

  const handleCreateUser = async () => {
    try {
      const updatedUsers = await usersApi.getAll();
      setUsers(updatedUsers);
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
