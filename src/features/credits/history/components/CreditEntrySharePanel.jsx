function CreditEntrySharePanel({
  entryShareText,
  handleCopyEntryShare,
  handleSendEntryWhatsApp,
  setEntryShareText,
}) {
  if (!entryShareText) return null;

  return (
    <div className="report-box">
      <div className="report-header">
        <strong>Manual Entry Message</strong>
      </div>
      <textarea id="credit-entry-share-text" name="credit_entry_share_text" className="report-text" readOnly value={entryShareText} />
      <div className="report-actions">
        <button className="report-btn" onClick={handleCopyEntryShare}>Copy</button>
        <button className="report-btn whatsapp" onClick={handleSendEntryWhatsApp}>WhatsApp</button>
        <button className="report-btn" onClick={() => setEntryShareText('')}>Close</button>
      </div>
    </div>
  );
}

export default CreditEntrySharePanel;
