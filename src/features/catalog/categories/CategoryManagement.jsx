import CategoryManagementView from './CategoryManagementView';
import useCategoryManagementController from './hooks/useCategoryManagementController';

function CategoryManagement({ onClose }) {
  const viewProps = useCategoryManagementController({ onClose });
  return <CategoryManagementView {...viewProps} />;
}

export default CategoryManagement;
