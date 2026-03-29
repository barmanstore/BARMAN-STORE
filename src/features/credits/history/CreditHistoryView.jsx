import { Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import MobileAccountLayout from '../../../shared/components/mobile/MobileAccountLayout';
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

const CreditHistoryView = ({
  backHref,
  backLabel,
  isAdminView,
  customer,
  balanceSummary,
  balance,
  ledgerSummary,
  lastTransactionLine,
  trustLine,
  billsHref,
  showPaymentBadges,
  monthlyStatements,
  paymentBadgesLoading,
  paymentBadges,
  paymentBadgeSummary,
  inactivityHint,
  error,
  success,
  isMobile,
  openAddModalWithType,
  quickTypeFilter,
  setQuickTypeFilter,
  quickRangeFilter,
  setQuickRangeFilter,
  adminVisibleIssues,
  focusIssueId,
  getAdminIssueDraft,
  setAdminIssueDraft,
  activeAdminIssueId,
  setActiveAdminIssueId,
  handleAdminIssueAction,
  adminIssueSavingId,
  scrollToTransactionEntry,
  filteredTransactions,
  creditHistory,
  hasFiltersApplied,
  issueFlagByEntryId,
  groupedTransactions,
  expandedTransactionId,
  setExpandedTransactionId,
  getTypeIcon,
  getTypeLabel,
  formatTransactionDate,
  truncateCreditDescription,
  setIssueForm,
  handlePrintInvoice,
  isTransactionWithinFiveDays,
  handleSendTransactionWhatsApp,
  handleDeleteTransaction,
  deletingEntryId,
  issueForm,
  handleReportIssue,
  issueSubmitting,
  creditIssues,
  issueResponseDrafts,
  setIssueResponseDrafts,
  handleIssueResponse,
  issueRespondingId,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  handleGenerateReport,
  showReport,
  reportSummary,
  reportText,
  handleCopyReport,
  handleSendWhatsApp,
  generatePDFReport,
  setShowReport,
  setReportSummary,
  entryShareText,
  handleCopyEntryShare,
  handleSendEntryWhatsApp,
  setEntryShareText,
  showAddModal,
  closeAddModal,
  addingTransaction,
  handleAddTransaction,
  newTransaction,
  setNewTransaction,
  handleClearAttachment,
  fileInputRef,
  handleFileUpload,
  uploading,
  addModalTitle,
  addModalActionLabel,
  showInvoiceModal,
  selectedTransaction,
  setShowInvoiceModal,
  printInvoice,
}) => (
  <MobileAccountLayout>
    <div className="credit-history-page">
      <CreditHistoryHeader
        backHref={backHref}
        backLabel={backLabel}
        isAdminView={isAdminView}
        customer={customer}
        balanceSummary={balanceSummary}
        balance={balance}
        ledgerSummary={ledgerSummary}
        lastTransactionLine={lastTransactionLine}
        trustLine={trustLine}
        billsHref={billsHref}
        showPaymentBadges={showPaymentBadges}
        paymentBadgesLoading={paymentBadgesLoading}
        paymentBadges={paymentBadges}
        paymentBadgeSummary={paymentBadgeSummary}
        inactivityHint={inactivityHint}
        error={error}
        success={success}
        isMobile={isMobile}
        openAddModalWithType={openAddModalWithType}
      />

      <CreditQuickFilters
        quickTypeFilter={quickTypeFilter}
        setQuickTypeFilter={setQuickTypeFilter}
        quickRangeFilter={quickRangeFilter}
        setQuickRangeFilter={setQuickRangeFilter}
      />

      {!isAdminView && (
        <CreditMonthlyStatementSection
          monthlyStatements={monthlyStatements}
          paymentBadgeSummary={paymentBadgeSummary}
        />
      )}

      {isAdminView && (
        <CreditIssuesAdminInbox
          adminVisibleIssues={adminVisibleIssues}
          focusIssueId={focusIssueId}
          getAdminIssueDraft={getAdminIssueDraft}
          setAdminIssueDraft={setAdminIssueDraft}
          activeAdminIssueId={activeAdminIssueId}
          setActiveAdminIssueId={setActiveAdminIssueId}
          handleAdminIssueAction={handleAdminIssueAction}
          adminIssueSavingId={adminIssueSavingId}
          scrollToTransactionEntry={scrollToTransactionEntry}
        />
      )}

      <CreditTransactionsSection
        filteredTransactions={filteredTransactions}
        creditHistory={creditHistory}
        hasFiltersApplied={hasFiltersApplied}
        isAdminView={isAdminView}
        isMobile={isMobile}
        issueFlagByEntryId={issueFlagByEntryId}
        groupedTransactions={groupedTransactions}
        expandedTransactionId={expandedTransactionId}
        setExpandedTransactionId={setExpandedTransactionId}
        getTypeIcon={getTypeIcon}
        getTypeLabel={getTypeLabel}
        formatTransactionDate={formatTransactionDate}
        isTransactionWithinFiveDays={isTransactionWithinFiveDays}
        truncateCreditDescription={truncateCreditDescription}
        setIssueForm={setIssueForm}
        handlePrintInvoice={handlePrintInvoice}
        handleSendTransactionWhatsApp={handleSendTransactionWhatsApp}
        handleDeleteTransaction={handleDeleteTransaction}
        deletingEntryId={deletingEntryId}
        issueForm={issueForm}
        handleReportIssue={handleReportIssue}
        issueSubmitting={issueSubmitting}
        creditIssues={creditIssues}
        issueResponseDrafts={issueResponseDrafts}
        setIssueResponseDrafts={setIssueResponseDrafts}
        handleIssueResponse={handleIssueResponse}
        issueRespondingId={issueRespondingId}
        fromDate={fromDate}
        toDate={toDate}
        setFromDate={setFromDate}
        setToDate={setToDate}
        handleGenerateReport={handleGenerateReport}
      />

      {isAdminView && (
        <CreditReportPreview
          showReport={showReport}
          reportSummary={reportSummary}
          reportText={reportText}
          customer={customer}
          paymentBadgeSummary={paymentBadgeSummary}
          handleCopyReport={handleCopyReport}
          handleSendWhatsApp={handleSendWhatsApp}
          generatePDFReport={generatePDFReport}
          setShowReport={setShowReport}
          setReportSummary={setReportSummary}
        />
      )}

      {isAdminView && (
        <CreditEntrySharePanel
          entryShareText={entryShareText}
          handleCopyEntryShare={handleCopyEntryShare}
          handleSendEntryWhatsApp={handleSendEntryWhatsApp}
          setEntryShareText={setEntryShareText}
        />
      )}

      {isAdminView && isMobile && (
        <div className="credit-mobile-cta-bar">
          <button
            type="button"
            className="mobile-cta payment"
            onClick={() => openAddModalWithType('payment')}
          >
            <RefreshCw size={16} /> Add Payment
          </button>
          <button
            type="button"
            className="mobile-cta given"
            onClick={() => openAddModalWithType('given')}
          >
            <Plus size={16} /> Add Manual Sale
          </button>
          <Link to={billsHref} className="mobile-cta bills">
            View Bills
          </Link>
        </div>
      )}

      <CreditAddTransactionModal
        showAddModal={isAdminView && showAddModal}
        closeAddModal={closeAddModal}
        addingTransaction={addingTransaction}
        handleAddTransaction={handleAddTransaction}
        newTransaction={newTransaction}
        setNewTransaction={setNewTransaction}
        handleClearAttachment={handleClearAttachment}
        fileInputRef={fileInputRef}
        handleFileUpload={handleFileUpload}
        uploading={uploading}
        addModalTitle={addModalTitle}
        addModalActionLabel={addModalActionLabel}
      />

      <CreditInvoiceModal
        showInvoiceModal={showInvoiceModal}
        selectedTransaction={selectedTransaction}
        setShowInvoiceModal={setShowInvoiceModal}
        formatTransactionDate={formatTransactionDate}
        customer={customer}
        getTypeLabel={getTypeLabel}
        printInvoice={printInvoice}
      />
    </div>
  </MobileAccountLayout>
);

export default CreditHistoryView;
