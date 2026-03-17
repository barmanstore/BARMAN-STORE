import usePurchaseManagementController from './hooks/usePurchaseManagementController';
import PurchaseManagementView from './components/PurchaseManagementView';
import './PurchaseManagement.css';

function PurchaseManagement({ user }) {
  const viewProps = usePurchaseManagementController({ user });
  return <PurchaseManagementView {...viewProps} />;
}

export default PurchaseManagement;
