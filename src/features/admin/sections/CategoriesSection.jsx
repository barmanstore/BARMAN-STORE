import CategoryManagement from '../../catalog/categories/CategoryManagement';
import AdminPageHeader from '../components/AdminPageHeader';

function CategoriesSection() {
  return (
    <div className="categories-management">
      <AdminPageHeader
        className="section-header"
        title="Categories Management"
        subtitle="Manage the category tree, edit metadata, and reassign products without leaving the tab."
      />
      <CategoryManagement inline={true} />
    </div>
  );
}

export default CategoriesSection;
