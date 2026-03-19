import usePurchaseManagementController from '../hooks/usePurchaseManagementController';
import PurchaseManagementPageLayout from '../components/PurchaseManagementPageLayout';
import './PurchaseManagementPage.css';

function PurchaseManagementPage({
  user,
  shortcutOpenOrderRequest = 0,
  onShortcutOpenOrderHandled = null,
}) {
  const pageProps = usePurchaseManagementController({
    user,
    shortcutOpenOrderRequest,
    onShortcutOpenOrderHandled,
  });
  return <PurchaseManagementPageLayout {...pageProps} />;
}

export default PurchaseManagementPage;
