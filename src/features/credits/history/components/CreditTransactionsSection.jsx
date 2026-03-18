import { FileText, Eye, Printer, MessageCircle, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';
import SignedCurrency from '../../../../shared/components/SignedCurrency';

function CreditTransactionsSection({
  filteredTransactions,
  creditHistory,
  hasFiltersApplied,
  isAdminView,
  isMobile,
  issueFlagByEntryId,
  groupedTransactions,
  expandedTransactionId,
  setExpandedTransactionId,
  getTypeIcon,
  getTypeLabel,
  formatTransactionDate,
  isTransactionWithinFiveDays,
  truncateCreditDescription,
  setIssueForm,
  handlePrintInvoice,
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
}) {
  return (
    <div className="credit-table-container">
      {filteredTransactions.length === 0 ? (
        <div className="empty-state">
          {creditHistory.length === 0 ? (
            <>
              <p>No entries yet{isAdminView ? ' for this customer.' : '.'}</p>
              {isAdminView && <p>Tap "Add Credit" for first sale or "Add Payment" when customer pays.</p>}
            </>
          ) : (
            <>
              <p>No entries match current filters.</p>
              {hasFiltersApplied && <p>Switch filters to "All" to view complete history.</p>}
            </>
          )}
        </div>
      ) : (
        <>
          <table className="credit-table">
            <thead>
              <tr>
                <th className="credit-col-date">Date</th>
                <th>Invoice #</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Description</th>
                <th className="credit-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => {
                const descriptionWithRef = transaction.reference
                  ? `${transaction.description || ''} (${transaction.reference})`.trim()
                  : transaction.description || '-';
                const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
                const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
                return (
                  <tr
                    key={transaction.id}
                    data-credit-entry-id={Number(transaction.id || 0) || undefined}
                    className={issueFlag ? `credit-row-issue ${issueFlag.tone}` : ''}
                  >
                    <td>{formatTransactionDate(transaction, { long: true })}</td>
                    <td className="invoice-number">{transaction.invoice_number || '-'}</td>
                    <td>
                      {getTypeIcon(transaction.type)}
                      <span>{getTypeLabel(transaction.type)}</span>
                    </td>
                    <td className={transaction.type === 'payment' ? 'payment-amount' : 'given-amount'}>
                      <SignedCurrency amount={transaction.type === 'payment' ? -parseFloat(transaction.amount) : parseFloat(transaction.amount)} />
                    </td>
                    <td><SignedCurrency amount={parseFloat(transaction.balance)} /></td>
                    <td>
                      {descriptionWithRef}
                      {issueFlag ? <span className={`entry-issue-pill ${issueFlag.tone}`}>{issueFlag.label}</span> : null}
                    </td>
                    <td className="actions-cell">
                      {!isAdminView && (
                        <button
                          className="action-icon"
                          onClick={() => setIssueForm((prev) => ({ ...prev, credit_entry_id: String(transaction.id || '') }))}
                          title="Report issue on this entry"
                        >
                          <FileText size={16} />
                        </button>
                      )}
                      {transaction.image_path && (
                        <a
                          href={transaction.image_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="action-icon view"
                          title="View Invoice"
                        >
                          <Eye size={16} />
                        </a>
                      )}
                      <button
                        className="action-icon print mobile-hide-print"
                        onClick={() => handlePrintInvoice(transaction)}
                        title="Print Invoice"
                        disabled={isMobile}
                        aria-disabled={isMobile}
                      >
                        <Printer size={16} />
                      </button>
                      {canShareTransaction && (
                        <button
                          className="action-icon whatsapp"
                          onClick={() => handleSendTransactionWhatsApp(transaction)}
                          title="Share on WhatsApp"
                        >
                          <MessageCircle size={16} />
                        </button>
                      )}
                      {isAdminView && (
                        <button
                          className="action-icon delete"
                          onClick={() => handleDeleteTransaction(transaction)}
                          title="Delete entry"
                          disabled={deletingEntryId === Number(transaction.id || 0)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="credit-mobile-list">
            {groupedTransactions.map((group) => (
              <section key={group.dateKey} className="credit-day-group">
                <h3 className="credit-day-title">{group.dateLabel}</h3>
                <div className="credit-tile-stack">
                  {group.transactions.map((transaction) => {
                    const description = String(transaction.description || '').trim();
                    const reference = String(transaction.reference || '').trim();
                    const signedAmount = transaction.type === 'payment'
                      ? -parseFloat(transaction.amount)
                      : parseFloat(transaction.amount);
                    const canShareTransaction = isAdminView && isTransactionWithinFiveDays(transaction);
                    const isExpanded = expandedTransactionId === transaction.id;
                    const issueFlag = issueFlagByEntryId.get(Number(transaction.id || 0)) || null;
                    return (
                      <article
                        key={`mobile-${transaction.id}`}
                        data-credit-entry-id={Number(transaction.id || 0) || undefined}
                        className={`credit-transaction-tile ${transaction.type === 'payment' ? 'payment' : 'given'}${issueFlag ? ` has-issue ${issueFlag.tone}` : ''}`}
                      >
                        <header className="tile-top-row">
                          <span className="tile-type-wrap">
                            <span className={`tile-type-pill ${transaction.type === 'payment' ? 'payment' : 'given'}`}>
                              {getTypeLabel(transaction.type)}
                          </span>
                          {issueFlag ? <span className={`entry-issue-pill ${issueFlag.tone}`}>{issueFlag.label}</span> : null}
                        </span>
                        <span className={`tile-amount ${transaction.type === 'payment' ? 'payment-amount' : 'given-amount'}`}>
                          <SignedCurrency amount={signedAmount} />
                        </span>
                      </header>

                        <div className="tile-meta-row">
                          <span>{formatTransactionDate(transaction, { long: false })}</span>
                          <span>Invoice: {transaction.invoice_number || '-'}</span>
                        </div>

                        <div className="tile-description">
                          {truncateCreditDescription(description || 'No description', 44)}
                        </div>

                        <div className="tile-footer-row">
                          <span className="tile-balance-pill">
                            Balance: <SignedCurrency amount={parseFloat(transaction.balance)} />
                          </span>
                          <button
                            type="button"
                            className="tile-expand-btn"
                            onClick={() => setExpandedTransactionId(isExpanded ? null : transaction.id)}
                          >
                            {isExpanded ? 'Less' : 'More'}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="tile-expanded">
                            <div className="tile-detail"><strong>Invoice:</strong> {transaction.invoice_number || '-'}</div>
                            {reference ? <div className="tile-detail"><strong>Ref:</strong> {reference}</div> : null}
                            <div className="tile-detail"><strong>Date:</strong> {formatTransactionDate(transaction, { long: true })}</div>
                            <div className="tile-actions">
                              {!isAdminView && (
                                <button
                                  className="action-icon"
                                  onClick={() => setIssueForm((prev) => ({ ...prev, credit_entry_id: String(transaction.id || '') }))}
                                  title="Report issue on this entry"
                                >
                                  <FileText size={16} />
                                </button>
                              )}
                              {transaction.image_path && (
                                <a
                                  href={transaction.image_path}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-icon view"
                                  title="View Invoice"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Eye size={16} />
                                </a>
                              )}
                              <button
                                className="action-icon print mobile-hide-print"
                                onClick={() => handlePrintInvoice(transaction)}
                                title="Print Invoice"
                                disabled={isMobile}
                                aria-disabled={isMobile}
                              >
                                <Printer size={16} />
                              </button>
                              {canShareTransaction && (
                                <button
                                  className="action-icon whatsapp"
                                  onClick={() => handleSendTransactionWhatsApp(transaction)}
                                  title="Share on WhatsApp"
                                >
                                  <MessageCircle size={16} />
                                </button>
                              )}
                              {isAdminView && (
                                <button
                                  className="action-icon delete"
                                  onClick={() => handleDeleteTransaction(transaction)}
                                  title="Delete entry"
                                  disabled={deletingEntryId === Number(transaction.id || 0)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {!isAdminView && (
        <div className="report-box">
          <div className="report-header">
            <strong>Report Credit Entry Issue</strong>
          </div>
          <form className="credit-issue-form" onSubmit={handleReportIssue}>
            <label>
              Entry
              <select
                id="credit-issue-entry"
                name="credit_entry_id"
                value={issueForm.credit_entry_id}
                onChange={(e) => setIssueForm((prev) => ({ ...prev, credit_entry_id: e.target.value }))}
              >
                <option value="">Select (optional)</option>
                {creditHistory.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    #{entry.id} | {getTypeLabel(entry.type)} | {formatCurrency(entry.amount || 0)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Issue Type
              <select
                id="credit-issue-type"
                name="issue_type"
                value={issueForm.issue_type}
                onChange={(e) => setIssueForm((prev) => ({ ...prev, issue_type: e.target.value }))}
              >
                <option value="wrong_entry">Wrong Entry</option>
                <option value="missing_entry">Missing Entry</option>
                <option value="wrong_amount">Wrong Amount</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Message
              <textarea
                id="credit-issue-message"
                name="issue_message"
                value={issueForm.message}
                onChange={(e) => setIssueForm((prev) => ({ ...prev, message: e.target.value }))}
                placeholder="Explain what is wrong so admin can correct it."
                rows={3}
                required
              />
            </label>
            <button type="submit" className="report-btn primary-action" disabled={issueSubmitting}>
              {issueSubmitting ? 'Submitting...' : 'Submit Issue'}
            </button>
          </form>
          {creditIssues.length > 0 && (
            <div className="credit-issues-list">
              {creditIssues.map((issue) => (
                <div key={issue.id} className="credit-issue-row">
                  <div>
                    <strong>#{issue.id}</strong> {issue.issue_type}
                  </div>
                  <div>{issue.message}</div>
                  <div className={`status-chip ${issue.status}`}>{issue.status}</div>
                  {issue.admin_reason || issue.resolution_note ? (
                    <div><strong>Admin reason:</strong> {issue.admin_reason || issue.resolution_note}</div>
                  ) : null}
                  {issue.correction_entry_id ? (
                    <div><strong>Correction entry:</strong> #{issue.correction_entry_id}</div>
                  ) : null}
                  {issue.customer_response_status ? (
                    <div><strong>Your response:</strong> {issue.customer_response_status}</div>
                  ) : null}
                  {(issue.status === 'corrected' || issue.status === 'rejected') && !issue.customer_response_status ? (
                    <div className="credit-issue-response">
                      <textarea
                        id={`credit-issue-response-${issue.id}`}
                        name={`credit_issue_response_${issue.id}`}
                        value={issueResponseDrafts[issue.id] || ''}
                        onChange={(e) => setIssueResponseDrafts((prev) => ({ ...prev, [issue.id]: e.target.value }))}
                        placeholder="Optional note. Required if you still disagree."
                        rows={2}
                      />
                      <div className="credit-issue-response-actions">
                        <button
                          type="button"
                          className="report-btn secondary-action"
                          onClick={() => handleIssueResponse(issue, 'acknowledged')}
                          disabled={issueRespondingId === Number(issue.id)}
                        >
                          {issueRespondingId === Number(issue.id) ? 'Sending...' : 'Acknowledge'}
                        </button>
                        <button
                          type="button"
                          className="report-btn primary-action"
                          onClick={() => handleIssueResponse(issue, 'disputed')}
                          disabled={issueRespondingId === Number(issue.id)}
                        >
                          {issueRespondingId === Number(issue.id) ? 'Sending...' : 'Still Wrong'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isAdminView && (
        <div id="credit-report-controls" className="report-controls credit-secondary-tools report-controls-light">
          <label htmlFor="credit-report-from-date">
            <span>From:</span>
            <input id="credit-report-from-date" name="from_date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label htmlFor="credit-report-to-date">
            <span>To:</span>
            <input id="credit-report-to-date" name="to_date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <button type="button" className="report-btn primary-action" onClick={handleGenerateReport} title="Generate credit report for date range">
            Generate Report
          </button>
        </div>
      )}
    </div>
  );
}

export default CreditTransactionsSection;

