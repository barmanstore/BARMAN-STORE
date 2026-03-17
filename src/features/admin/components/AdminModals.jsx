import CategoryManagement from '../../catalog/categories/CategoryManagement';
import ProductForm from '../../catalog/products/ProductForm';
import UserEditModal from '../../../shared/components/UserEditModal';
import AdminApproveModal from './AdminApproveModal';
import AdminExportModal from './AdminExportModal';

const AdminModals = ({
  showProductForm,
  editingProduct,
  setShowProductForm,
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
  showCategoryManagement,
  setShowCategoryManagement,
  editingUser,
  setEditingUser,
  setShowUserForm,
  setIsCreatingUser,
  handleUserSave,
  showUserForm,
  isCreatingUser,
  handleCreateUser,
}) => (
  <>
    {showProductForm && (
      <ProductForm
        product={editingProduct}
        onClose={() => {
          setShowProductForm(false);
          setEditingProduct(null);
        }}
        onSave={handleProductSave}
      />
    )}
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
    {showCategoryManagement && (
      <CategoryManagement
        onClose={() => setShowCategoryManagement(false)}
      />
    )}
    {editingUser && (
      <UserEditModal
        user={editingUser}
        onClose={() => {
          setEditingUser(null);
          setShowUserForm(false);
          setIsCreatingUser(false);
        }}
        onSave={handleUserSave}
      />
    )}
    {showUserForm && isCreatingUser && (
      <UserEditModal
        isCreate={true}
        onClose={() => {
          setShowUserForm(false);
          setIsCreatingUser(false);
        }}
        onSave={handleCreateUser}
      />
    )}
  </>
);

export default AdminModals;
