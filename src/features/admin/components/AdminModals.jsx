import ProductForm from '../../catalog/products/components/form/ProductForm';
import UserEditModal from '../../../shared/components/UserEditModal';
import AdminApproveModal from './AdminApproveModal';
import AdminExportModal from './AdminExportModal';
import { useAdminModalContext } from '../context/AdminPageContext';

const AdminModals = () => {
  const {
    showProductForm,
    productFormMode,
    editingProduct,
    setShowProductForm,
    setProductFormMode,
    setEditingProduct,
    handleProductSave,
    showApproveModal,
    modalOrder,
    modalItems,
    modalLoading,
    confirmApprove,
    setShowApproveModal,
    proceedBillingOrderId,
    handleProceedToBilling,
    showExportDialog,
    setShowExportDialog,
    exportFormat,
    setExportFormat,
    importBusy,
    handleExportProducts,
    editingUser,
    setEditingUser,
    setShowUserForm,
    setIsCreatingUser,
    handleUserSave,
    showUserForm,
    isCreatingUser,
    handleCreateUser,
  } = useAdminModalContext();

  return (
    <>
      {showProductForm ? (
        <ProductForm
          product={editingProduct}
          mode={productFormMode}
          onClose={() => {
            setShowProductForm(false);
            setEditingProduct(null);
            setProductFormMode('full');
          }}
          onSave={handleProductSave}
        />
      ) : null}
      <AdminApproveModal
        showApproveModal={showApproveModal}
        modalOrder={modalOrder}
        modalItems={modalItems}
        modalLoading={modalLoading}
        onClose={() => setShowApproveModal(false)}
        confirmApprove={confirmApprove}
        proceedBillingOrderId={proceedBillingOrderId}
        handleProceedToBilling={handleProceedToBilling}
      />
      <AdminExportModal
        showExportDialog={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        importBusy={importBusy}
        handleExportProducts={handleExportProducts}
      />
      {editingUser ? (
        <UserEditModal
          user={editingUser}
          onClose={() => {
            setEditingUser(null);
            setShowUserForm(false);
            setIsCreatingUser(false);
          }}
          onSave={handleUserSave}
        />
      ) : null}
      {showUserForm && isCreatingUser ? (
        <UserEditModal
          isCreate={true}
          onClose={() => {
            setShowUserForm(false);
            setIsCreatingUser(false);
          }}
          onSave={handleCreateUser}
        />
      ) : null}
    </>
  );
};

export default AdminModals;
