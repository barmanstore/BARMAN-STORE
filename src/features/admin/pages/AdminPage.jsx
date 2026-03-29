import AdminPageLayout from '../components/AdminPageLayout';
import { AdminPageProvider } from '../context/AdminPageContext';
import useAdminPageController from '../hooks/useAdminPageController';
import { useSession } from '../../../providers/SessionProvider';
import './AdminPage.css';
import './AdminStandard.css';

function AdminPage() {
  const { user } = useSession();
  const controller = useAdminPageController({ user });

  return (
    <AdminPageProvider value={controller}>
      <AdminPageLayout />
    </AdminPageProvider>
  );
}

export default AdminPage;
