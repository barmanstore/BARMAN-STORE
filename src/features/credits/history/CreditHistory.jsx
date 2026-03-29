import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
import { useSession } from '../../../providers/SessionProvider';
import CreditHistoryView from './CreditHistoryView';
import useCreditHistoryController from './hooks/useCreditHistoryController.jsx';

function CreditHistory() {
  const { user } = useSession();
  const { loading, viewProps } = useCreditHistoryController({ user });

  if (loading) {
    return (
      <MobileAccountLayout>
        <div className="credit-history-page">
          <div className="loading">Loading...</div>
        </div>
      </MobileAccountLayout>
    );
  }

  return <CreditHistoryView {...viewProps} />;
}

export default CreditHistory;

