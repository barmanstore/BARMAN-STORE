import usePurchaseManagementController from '../hooks/usePurchaseManagementController';
import PurchaseManagementPageLayout from '../components/PurchaseManagementPageLayout';
import './PurchaseManagementPage.css';

function PurchaseManagementPage({
  user,
  shortcutOpenOrderRequest = 0,
  onShortcutOpenOrderHandled = null,
  popupMode = false,
  showSectionTabs = true,
  autoOpenOrderForm = false,
  initialActiveSubTab = 'dashboard',
  draftStorageKey = '',
}) {
  const pageProps = usePurchaseManagementController({
    user,
    shortcutOpenOrderRequest,
    onShortcutOpenOrderHandled,
    popupMode,
    showSectionTabs,
    autoOpenOrderForm,
    initialActiveSubTab,
    draftStorageKey,
  });
  return <PurchaseManagementPageLayout {...pageProps} />;
}

export default PurchaseManagementPage;
