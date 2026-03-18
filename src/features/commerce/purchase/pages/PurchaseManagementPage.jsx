import usePurchaseManagementController from '../hooks/usePurchaseManagementController';
import PurchaseManagementPageLayout from '../components/PurchaseManagementPageLayout';
import './PurchaseManagementPage.css';

function PurchaseManagementPage({ user }) {
  const pageProps = usePurchaseManagementController({ user });
  return <PurchaseManagementPageLayout {...pageProps} />;
}

export default PurchaseManagementPage;
