import { createContext, useContext, useMemo } from 'react';

const AdminCoreContext = createContext(null);
const AdminShellContext = createContext(null);
const AdminWorkspaceContext = createContext(null);
const AdminModalContext = createContext(null);

export const AdminPageProvider = ({ value, children }) => {
  const coreValue = useMemo(() => ({
    user: value.user,
    loading: value.loading,
  }), [
    value.loading,
    value.user,
  ]);

  const shellValue = useMemo(() => ({
    notification: value.notification,
    closeNotification: value.closeNotification,
    isMobileSidebarOpen: value.isMobileSidebarOpen,
    setIsMobileSidebarOpen: value.setIsMobileSidebarOpen,
    desktopPanelCollapsed: value.desktopPanelCollapsed,
    setDesktopPanelCollapsed: value.setDesktopPanelCollapsed,
    SIDEBAR_SECTIONS: value.SIDEBAR_SECTIONS,
    desktopActiveGroup: value.desktopActiveGroup,
    handleDesktopGroupSelect: value.handleDesktopGroupSelect,
    desktopCurrentSection: value.desktopCurrentSection,
    activeTab: value.activeTab,
    handleTabChange: value.handleTabChange,
    mobileSidebarSections: value.mobileSidebarSections,
    expandedGroups: value.expandedGroups,
    toggleSidebarGroup: value.toggleSidebarGroup,
  }), [
    value.SIDEBAR_SECTIONS,
    value.activeTab,
    value.closeNotification,
    value.desktopActiveGroup,
    value.desktopCurrentSection,
    value.desktopPanelCollapsed,
    value.expandedGroups,
    value.handleDesktopGroupSelect,
    value.handleTabChange,
    value.isMobileSidebarOpen,
    value.mobileSidebarSections,
    value.notification,
    value.setDesktopPanelCollapsed,
    value.setIsMobileSidebarOpen,
    value.toggleSidebarGroup,
  ]);

  const modalValue = useMemo(() => ({
    showProductForm: value.showProductForm,
    productFormMode: value.productFormMode,
    editingProduct: value.editingProduct,
    setShowProductForm: value.setShowProductForm,
    setProductFormMode: value.setProductFormMode,
    setEditingProduct: value.setEditingProduct,
    handleProductSave: value.handleProductSave,
    showApproveModal: value.showApproveModal,
    modalOrder: value.modalOrder,
    modalItems: value.modalItems,
    modalLoading: value.modalLoading,
    confirmApprove: value.confirmApprove,
    setShowApproveModal: value.setShowApproveModal,
    proceedBillingOrderId: value.proceedBillingOrderId,
    handleProceedToBilling: value.handleProceedToBilling,
    showExportDialog: value.showExportDialog,
    setShowExportDialog: value.setShowExportDialog,
    exportFormat: value.exportFormat,
    setExportFormat: value.setExportFormat,
    importBusy: value.importBusy,
    handleExportProducts: value.handleExportProducts,
    editingUser: value.editingUser,
    setEditingUser: value.setEditingUser,
    setShowUserForm: value.setShowUserForm,
    setIsCreatingUser: value.setIsCreatingUser,
    handleUserSave: value.handleUserSave,
    showUserForm: value.showUserForm,
    isCreatingUser: value.isCreatingUser,
    handleCreateUser: value.handleCreateUser,
  }), [
    value.confirmApprove,
    value.editingProduct,
    value.editingUser,
    value.exportFormat,
    value.handleCreateUser,
    value.handleExportProducts,
    value.handleProceedToBilling,
    value.handleProductSave,
    value.handleUserSave,
    value.importBusy,
    value.isCreatingUser,
    value.modalItems,
    value.modalLoading,
    value.modalOrder,
    value.productFormMode,
    value.proceedBillingOrderId,
    value.setEditingProduct,
    value.setEditingUser,
    value.setExportFormat,
    value.setIsCreatingUser,
    value.setShowApproveModal,
    value.setShowExportDialog,
    value.setShowProductForm,
    value.setProductFormMode,
    value.setShowUserForm,
    value.showApproveModal,
    value.showExportDialog,
    value.showProductForm,
    value.showUserForm,
  ]);

  return (
    <AdminCoreContext.Provider value={coreValue}>
      <AdminShellContext.Provider value={shellValue}>
        <AdminWorkspaceContext.Provider value={value}>
          <AdminModalContext.Provider value={modalValue}>
            {children}
          </AdminModalContext.Provider>
        </AdminWorkspaceContext.Provider>
      </AdminShellContext.Provider>
    </AdminCoreContext.Provider>
  );
};

const useRequiredContext = (context, label) => {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${label} must be used within an AdminPageProvider`);
  }
  return value;
};

export const useAdminCoreContext = () => useRequiredContext(AdminCoreContext, 'useAdminCoreContext');
export const useAdminShellContext = () => useRequiredContext(AdminShellContext, 'useAdminShellContext');
export const useAdminWorkspaceContext = () => useRequiredContext(AdminWorkspaceContext, 'useAdminWorkspaceContext');
export const useAdminModalContext = () => useRequiredContext(AdminModalContext, 'useAdminModalContext');
export const useAdminPageContext = useAdminWorkspaceContext;

export {
  AdminCoreContext,
  AdminShellContext,
  AdminWorkspaceContext,
  AdminModalContext,
};

export default AdminWorkspaceContext;
