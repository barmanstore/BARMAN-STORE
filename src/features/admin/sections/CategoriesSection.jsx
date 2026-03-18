import { Plus } from 'lucide-react';
import AdminPageHeader from '../components/AdminPageHeader';

function CategoriesSection({
  setShowCategoryManagement
}) {
  return (

          <div className="categories-management">
            <AdminPageHeader
              className="section-header"
              title="Categories Management"
              actions={(
                <button className="admin-btn primary" onClick={() => setShowCategoryManagement(true)}>
                  <Plus size={20} /> Manage Categories
                </button>
              )}
            />
            <div className="categories-info">
              <p>Click "Manage Categories" to create, edit, or delete product categories.</p>
            </div>
          </div>
  );
}

export default CategoriesSection;

