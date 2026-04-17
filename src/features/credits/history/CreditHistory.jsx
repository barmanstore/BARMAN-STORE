import { Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
import { useSession } from '../../../providers/SessionProvider';
import useCreditHistoryController from './hooks/useCreditHistoryController.jsx';
import CreditAddTransactionModal from './components/CreditAddTransactionModal';
import CreditEntrySharePanel from './components/CreditEntrySharePanel';
import CreditHistoryHeader from './components/CreditHistoryHeader';
import CreditInvoiceModal from './components/CreditInvoiceModal';
import CreditIssuesAdminInbox from './components/CreditIssuesAdminInbox';
import CreditMonthlyStatementSection from './components/CreditMonthlyStatementSection';
import CreditQuickFilters from './components/CreditQuickFilters';
import CreditReportPreview from './components/CreditReportPreview';
import CreditTransactionsSection from './components/CreditTransactionsSection';
import './CreditHistory.css';

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

  return (
    <MobileAccountLayout>
      <div className="credit-history-page">
        <CreditHistoryHeader
          backHref={viewProps.backHref}
          backLabel={viewProps.backLabel}
          isAdminView={viewProps.isAdminView}
          customer={viewProps.customer}
          balanceSummary={viewProps.balanceSummary}
          balance={viewProps.balance}
          ledgerSummary={viewProps.ledgerSummary}
          lastTransactionLine={viewProps.lastTransactionLine}
          trustLine={viewProps.trustLine}
          billsHref={viewProps.billsHref}
          showPaymentBadges={viewProps.showPaymentBadges}
          paymentBadgesLoading={viewProps.paymentBadgesLoading}
          paymentBadges={viewProps.paymentBadges}
          paymentBadgeSummary={viewProps.paymentBadgeSummary}
          inactivityHint={viewProps.inactivityHint}
          error={viewProps.error}
          success={viewProps.success}
          isMobile={viewProps.isMobile}
          openAddModalWithType={viewProps.openAddModalWithType}
          onContactWhatsApp={viewProps.handleOpenWhatsAppChat}
        />

        <CreditQuickFilters
          quickTypeFilter={viewProps.quickTypeFilter}
          setQuickTypeFilter={viewProps.setQuickTypeFilter}
          quickRangeFilter={viewProps.quickRangeFilter}
          setQuickRangeFilter={viewProps.setQuickRangeFilter}
        />

        {!viewProps.isAdminView && (
          <CreditMonthlyStatementSection
            monthlyStatements={viewProps.monthlyStatements}
            paymentBadgeSummary={viewProps.paymentBadgeSummary}
          />
        )}

        {viewProps.isAdminView && (
          <CreditIssuesAdminInbox
            adminVisibleIssues={viewProps.adminVisibleIssues}
            focusIssueId={viewProps.focusIssueId}
            getAdminIssueDraft={viewProps.getAdminIssueDraft}
            setAdminIssueDraft={viewProps.setAdminIssueDraft}
            activeAdminIssueId={viewProps.activeAdminIssueId}
            setActiveAdminIssueId={viewProps.setActiveAdminIssueId}
            handleAdminIssueAction={viewProps.handleAdminIssueAction}
            adminIssueSavingId={viewProps.adminIssueSavingId}
            scrollToTransactionEntry={viewProps.scrollToTransactionEntry}
          />
        )}

        <CreditTransactionsSection
          filteredTransactions={viewProps.filteredTransactions}
          creditHistory={viewProps.creditHistory}
          hasFiltersApplied={viewProps.hasFiltersApplied}
          isAdminView={viewProps.isAdminView}
          isMobile={viewProps.isMobile}
          issueFlagByEntryId={viewProps.issueFlagByEntryId}
          groupedTransactions={viewProps.groupedTransactions}
          historyHasMore={viewProps.historyHasMore}
          historyLoadingMore={viewProps.historyLoadingMore}
          historyLoadingFull={viewProps.historyLoadingFull}
          loadMoreHistory={viewProps.loadMoreHistory}
          expandedTransactionId={viewProps.expandedTransactionId}
          setExpandedTransactionId={viewProps.setExpandedTransactionId}
          getTypeIcon={viewProps.getTypeIcon}
          getTypeLabel={viewProps.getTypeLabel}
          formatTransactionDate={viewProps.formatTransactionDate}
          isTransactionWithinFiveDays={viewProps.isTransactionWithinFiveDays}
          truncateCreditDescription={viewProps.truncateCreditDescription}
          setIssueForm={viewProps.setIssueForm}
          handlePrintInvoice={viewProps.handlePrintInvoice}
          handleSendTransactionWhatsApp={viewProps.handleSendTransactionWhatsApp}
          handleDeleteTransaction={viewProps.handleDeleteTransaction}
          deletingEntryId={viewProps.deletingEntryId}
          issueForm={viewProps.issueForm}
          handleReportIssue={viewProps.handleReportIssue}
          issueSubmitting={viewProps.issueSubmitting}
          creditIssues={viewProps.creditIssues}
          issueResponseDrafts={viewProps.issueResponseDrafts}
          setIssueResponseDrafts={viewProps.setIssueResponseDrafts}
          handleIssueResponse={viewProps.handleIssueResponse}
          issueRespondingId={viewProps.issueRespondingId}
          fromDate={viewProps.fromDate}
          toDate={viewProps.toDate}
          setFromDate={viewProps.setFromDate}
          setToDate={viewProps.setToDate}
          handleGenerateReport={viewProps.handleGenerateReport}
        />

        {viewProps.isAdminView && (
          <CreditReportPreview
            showReport={viewProps.showReport}
            reportSummary={viewProps.reportSummary}
            reportText={viewProps.reportText}
            customer={viewProps.customer}
            paymentBadgeSummary={viewProps.paymentBadgeSummary}
            handleCopyReport={viewProps.handleCopyReport}
            handleSendWhatsApp={viewProps.handleSendWhatsApp}
            generatePDFReport={viewProps.generatePDFReport}
            setShowReport={viewProps.setShowReport}
            setReportSummary={viewProps.setReportSummary}
          />
        )}

        {viewProps.isAdminView && (
          <CreditEntrySharePanel
            entryShareText={viewProps.entryShareText}
            handleCopyEntryShare={viewProps.handleCopyEntryShare}
            handleSendEntryWhatsApp={viewProps.handleSendEntryWhatsApp}
            setEntryShareText={viewProps.setEntryShareText}
          />
        )}

        {viewProps.isAdminView && viewProps.isMobile && (
          <div className="credit-mobile-cta-bar">
            <button
              type="button"
              className="mobile-cta payment"
              onClick={() => viewProps.openAddModalWithType('payment')}
            >
              <RefreshCw size={16} /> Add Payment
            </button>
            <button
              type="button"
              className="mobile-cta given"
              onClick={() => viewProps.openAddModalWithType('given')}
            >
              <Plus size={16} /> Add Manual Sale
            </button>
            <Link to={viewProps.billsHref} className="mobile-cta bills">
              View Bills
            </Link>
          </div>
        )}

        <CreditAddTransactionModal
          showAddModal={viewProps.isAdminView && viewProps.showAddModal}
          closeAddModal={viewProps.closeAddModal}
          addingTransaction={viewProps.addingTransaction}
          handleAddTransaction={viewProps.handleAddTransaction}
          newTransaction={viewProps.newTransaction}
          setNewTransaction={viewProps.setNewTransaction}
          handleClearAttachment={viewProps.handleClearAttachment}
          fileInputRef={viewProps.fileInputRef}
          handleFileUpload={viewProps.handleFileUpload}
          uploading={viewProps.uploading}
          addModalTitle={viewProps.addModalTitle}
          customer={viewProps.customer}
          balance={viewProps.balance}
          balanceSummary={viewProps.balanceSummary}
        />

        <CreditInvoiceModal
          showInvoiceModal={viewProps.showInvoiceModal}
          selectedTransaction={viewProps.selectedTransaction}
          setShowInvoiceModal={viewProps.setShowInvoiceModal}
          formatTransactionDate={viewProps.formatTransactionDate}
          customer={viewProps.customer}
          getTypeLabel={viewProps.getTypeLabel}
          printInvoice={viewProps.printInvoice}
        />
      </div>
    </MobileAccountLayout>
  );
}

export default CreditHistory;

