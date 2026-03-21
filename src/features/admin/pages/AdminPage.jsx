import AdminPageLayout from '../components/AdminPageLayout';
import { AdminPageProvider } from '../context/AdminPageContext';
import useAdminPageController from '../hooks/useAdminPageController';
import './AdminPage.css';
import './AdminStandard.css';

function AdminPage({ user }) {
  const controller = useAdminPageController({ user });

  return (
    <AdminPageProvider value={controller}>
      <AdminPageLayout />
    </AdminPageProvider>
  );
}

export default AdminPage;
