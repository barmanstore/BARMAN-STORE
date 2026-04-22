import { Link } from 'react-router-dom';
import AdminShell from './AdminShell';
import AdminTabContent from './AdminTabContent';
import AdminModals from './AdminModals';
import { useAdminCoreContext } from '../context/AdminPageContext';
import { hasCapability } from '../../../shared/auth/capabilities';

const AdminPageLayout = () => {
  const { user, loading } = useAdminCoreContext();

  if (!user || !hasCapability(user, 'view_backoffice')) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <h1>Access Denied</h1>
          <p>You must be an admin to access this page.</p>
          <Link to="/login" className="admin-btn">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-content">
          <div className="admin-loading-state">
            <h2>Loading admin dashboard...</h2>
            <p>Fetching orders, products, users and summary stats.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminShell>
        <AdminTabContent />
      </AdminShell>
      <AdminModals />
    </>
  );
};

export default AdminPageLayout;
