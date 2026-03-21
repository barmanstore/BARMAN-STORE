import { useEffect } from 'react';
import { hasCapability } from '../../../../shared/auth/capabilities';
import BackofficePopupShell from '../../../../shared/components/backoffice/BackofficePopupShell';
import PopupWorkspaceNotice from '../../../../shared/components/backoffice/PopupWorkspaceNotice';
import useBackofficePopupLifecycle from '../../../../shared/hooks/useBackofficePopupLifecycle';
import { getBackofficePopupDraftKey } from '../../../../shared/utils/backofficePopup';
import { getAdminTabHref } from '../../../admin/config/adminSidebarConfig';
import PurchaseManagementPage from './PurchaseManagementPage';

function PurchasePopupWorkspace({ user }) {
  useBackofficePopupLifecycle('purchase');

  useEffect(() => {
    document.title = 'Purchase Order Workspace';
  }, []);

  return (
    <BackofficePopupShell
      title="Purchase Order Workspace"
      subtitle="Dedicated browser window for purchase entry with draft restore."
      adminHref={getAdminTabHref('purchases')}
    >
      <PurchaseManagementPage
        user={user}
        popupMode
        showSectionTabs={false}
        autoOpenOrderForm
        initialActiveSubTab="orders"
        draftStorageKey={getBackofficePopupDraftKey('purchase')}
      />
    </BackofficePopupShell>
  );
}

function PurchasePopupPage({ user }) {
  if (!user || !hasCapability(user, 'view_backoffice')) {
    return (
      <BackofficePopupShell
        title="Purchase Order Workspace"
        subtitle="Backoffice access is required for popup purchase entry."
        adminHref="/login"
      >
        <PopupWorkspaceNotice
          title="Access required"
          message="Sign in with a backoffice-enabled account to open purchase entry in a separate browser window."
        />
      </BackofficePopupShell>
    );
  }

  return <PurchasePopupWorkspace user={user} />;
}

export default PurchasePopupPage;
