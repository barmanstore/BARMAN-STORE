import { Plus, RefreshCw, X } from 'lucide-react';
import { useMemo } from 'react';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
import { useSession } from '../../../providers/SessionProvider';
import useCreditHistoryController from './hooks/useCreditHistoryController.jsx';
import { FilterBar, FilterPills, DateRangeFilter } from '../../../shared/components/filters';
import CreditAddTransactionModal from './components/CreditAddTransactionModal';
import CreditEntrySharePanel from './components/CreditEntrySharePanel';
import CreditHistoryHeader from './components/CreditHistoryHeader';
import CreditInvoiceModal from './components/CreditInvoiceModal';
import CreditMonthlyStatementSection from './components/CreditMonthlyStatementSection';
import CreditReportPreview from './components/CreditReportPreview';
import CreditTransactionsSection from './components/CreditTransactionsSection';
import './CreditHistory.css';

const toDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateByDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const buildDateRangePresets = () => {
  const today = new Date();
  const todayToken = toDateToken(today);
  const yesterday = shiftDateByDays(today, -1);
  return [
    { label: 'Today', value: [todayToken, todayToken] },
    { label: 'Yesterday', value: [toDateToken(yesterday), toDateToken(yesterday)] },
    { label: 'Last 7 Days', value: [toDateToken(shiftDateByDays(today, -6)), todayToken] },
    {
      label: 'This Month',
      value: [toDateToken(new Date(today.getFullYear(), today.getMonth(), 1)), todayToken],
    },
  ];
};

function CreditHistory() {
  const { user } = useSession();
  const { loading, viewProps } = useCreditHistoryController({ user });
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);

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
          lastTransactionLine={viewProps.lastTransactionLine}
          trustLine={viewProps.trustLine}
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
          onOpenReportPanel={viewProps.handleGenerateReport}
        />

        <FilterBar className="credit-history-filters">
          <div className="credit-history-filter-chips">
            <button
              type="button"
              className={`filter-chip ${viewProps.quickTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => viewProps.setQuickTypeFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-chip ${viewProps.quickTypeFilter === 'given' ? 'active' : ''}`}
              onClick={() => viewProps.setQuickTypeFilter('given')}
            >
              Charges
            </button>
            <button
              type="button"
              className={`filter-chip ${viewProps.quickTypeFilter === 'payment' ? 'active' : ''}`}
              onClick={() => viewProps.setQuickTypeFilter('payment')}
            >
              Payment
            </button>
          </div>
          <DateRangeFilter
            value={[viewProps.filters.start_date, viewProps.filters.end_date]}
            onChange={([start, end]) =>
              viewProps.setFilters({ ...viewProps.filters, start_date: start, end_date: end })
            }
            width="220px"
            tone="sky"
            presets={dateRangePresets}
            helperText="Transaction date"
            showIcon={false}
            showPlaceholderText={false}
            triggerPlaceholder="Date Filter"
            popoverAlign="right"
          />
        </FilterBar>

        <FilterPills
          items={[
            viewProps.quickTypeFilter !== 'all'
              ? {
                  key: 'type',
                  label: viewProps.quickTypeFilter === 'given' ? 'Charges' : 'Payment',
                  onClear: () => viewProps.setQuickTypeFilter('all'),
                }
              : null,
            viewProps.filters.start_date || viewProps.filters.end_date
              ? {
                  key: 'date_range',
                  label: `${viewProps.filters.start_date || '..'} - ${viewProps.filters.end_date || '..'}`,
                  onClear: () => viewProps.setFilters({ ...viewProps.filters, start_date: '', end_date: '' }),
                }
              : null,
          ].filter(Boolean).map((pill) => ({
            ...pill,
            icon: <X size={12} aria-hidden="true" />,
          }))}
        />

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
          handleCustomerTransactionIssue={viewProps.handleCustomerTransactionIssue}
          openEditModalWithTransaction={viewProps.openEditModalWithTransaction}
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
          activeAdminIssueId={viewProps.activeAdminIssueId}
          setActiveAdminIssueId={viewProps.setActiveAdminIssueId}
          getAdminIssueDraft={viewProps.getAdminIssueDraft}
          setAdminIssueDraft={viewProps.setAdminIssueDraft}
          handleAdminIssueAction={viewProps.handleAdminIssueAction}
          adminIssueSavingId={viewProps.adminIssueSavingId}
        />

        {!viewProps.isAdminView && (
          <CreditMonthlyStatementSection
            monthlyStatements={viewProps.monthlyStatements}
            paymentBadgeSummary={viewProps.paymentBadgeSummary}
          />
        )}

        {viewProps.isAdminView && (
          <CreditReportPreview
            showReport={viewProps.showReport}
            reportSummary={viewProps.reportSummary}
            reportText={viewProps.reportText}
            customer={viewProps.customer}
            paymentBadgeSummary={viewProps.paymentBadgeSummary}
            fromDate={viewProps.fromDate}
            toDate={viewProps.toDate}
            setFromDate={viewProps.setFromDate}
            setToDate={viewProps.setToDate}
            handleGenerateReport={viewProps.handleGenerateReport}
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
