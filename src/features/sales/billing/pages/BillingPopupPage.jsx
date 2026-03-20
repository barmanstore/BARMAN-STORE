import { useEffect } from 'react';
import BillingTab from '../BillingTab';
import { hasCapability } from '../../../../shared/auth/capabilities';
import BackofficePopupShell from '../../../../shared/components/backoffice/BackofficePopupShell';
import PopupWorkspaceNotice from '../../../../shared/components/backoffice/PopupWorkspaceNotice';
import useBackofficePopupLifecycle from '../../../../shared/hooks/useBackofficePopupLifecycle';
import { getBackofficePopupDraftKey } from '../../../../shared/utils/backofficePopup';

function BillingPopupWorkspace() {
  useBackofficePopupLifecycle('billing');

  useEffect(() => {
    document.title = 'Billing Workspace';
  }, []);

  return (
    <BackofficePopupShell
      title="Billing Workspace"
      subtitle="Dedicated browser window for billing with draft restore."
      adminHref="/admin?tab=billing"
    >
      <BillingTab
        popupMode
        draftStorageKey={getBackofficePopupDraftKey('billing')}
      />
    </BackofficePopupShell>
  );
}

function BillingPopupPage({ user }) {
  if (!user || !hasCapability(user, 'view_backoffice')) {
    return (
      <BackofficePopupShell
        title="Billing Workspace"
        subtitle="Backoffice access is required for popup billing."
        adminHref="/login"
      >
        <PopupWorkspaceNotice
          title="Access required"
          message="Sign in with a backoffice-enabled account to open Billing in a separate browser window."
        />
      </BackofficePopupShell>
    );
  }

  return <BillingPopupWorkspace />;
}

export default BillingPopupPage;
