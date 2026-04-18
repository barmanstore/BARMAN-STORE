import AppModal from '../../../shared/components/AppModal';

const AdminExportModal = ({
  showExportDialog,
  onClose,
  exportFormat,
  setExportFormat,
  importBusy,
  handleExportProducts,
}) => {
  if (!showExportDialog) return null;

  return (
    <AppModal
      open={showExportDialog}
      title="Export Products"
      onClose={onClose}
      dialogClassName="export-modal-card"
    >
      <p>Select format, then export the current filtered view.</p>
      <div className="export-format-toggle-group">
        <button
          className={`admin-btn ${exportFormat === 'csv' ? 'primary' : ''}`}
          onClick={() => setExportFormat('csv')}
          disabled={importBusy}
        >
          CSV (.csv)
        </button>
        <button
          className={`admin-btn ${exportFormat === 'xlsx' ? 'primary' : ''}`}
          onClick={() => setExportFormat('xlsx')}
          disabled={importBusy}
        >
          Excel (.xlsx)
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="admin-btn" onClick={onClose} disabled={importBusy}>
          Cancel
        </button>
        <button className="admin-btn primary" onClick={handleExportProducts} disabled={importBusy}>
          Confirm Export
        </button>
      </div>
    </AppModal>
  );
};

export default AdminExportModal;
