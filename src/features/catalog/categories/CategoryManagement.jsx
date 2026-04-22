import CategoryManagementView from './CategoryManagementView';
import useCategoryManagementController from './hooks/useCategoryManagementController';

function CategoryManagement({ onClose, inline = false }) {
  const viewProps = useCategoryManagementController({ onClose });
  return <CategoryManagementView {...viewProps} inline={inline} />;
}

export default CategoryManagement;
