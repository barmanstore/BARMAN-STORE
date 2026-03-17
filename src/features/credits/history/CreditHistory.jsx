import MobileAccountLayout from '../../../components/mobile/MobileAccountLayout';
import CreditHistoryView from './CreditHistoryView';
import useCreditHistoryController from './hooks/useCreditHistoryController.jsx';

function CreditHistory({ user }) {
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
