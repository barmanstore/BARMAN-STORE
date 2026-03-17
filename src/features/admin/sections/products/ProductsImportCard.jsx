const ProductsImportCard = ({
  showProductsImportCard,
  importPreviewData,
  importFile,
  importAllowIdenticalRows,
  setImportAllowIdenticalRows,
  importFileInputRef,
  importBusy,
  handleFileSelected,
}) => (
  <>
    <input
      id="import-file-input"
      name="import_file"
      ref={importFileInputRef}
      type="file"
      accept=".csv,.xlsx,.xls"
      onChange={handleFileSelected}
      disabled={importBusy}
      style={{ display: 'none' }}
    />
    {showProductsImportCard ? (
      <div className="products-import-export-card">
        {importPreviewData?.batch_id ? (
          <div className="products-import-controls">
            <span>{importFile ? `Selected: ${importFile.name}` : 'No file selected'}</span>
          </div>
        ) : null}
        {importPreviewData?.summary && (
          <div className="products-import-preview-summary">
            <span>Creates: {importPreviewData.summary.creates}</span>
            <span>Updates: {importPreviewData.summary.updates}</span>
            <span>Errors: {importPreviewData.summary.errors}</span>
            <span>Needs Choice: {importPreviewData.summary.needs_confirmation || 0}</span>
            <span>Expires: {new Date(importPreviewData.expires_at).toLocaleString()}</span>
          </div>
        )}
        {Array.isArray(importPreviewData?.preview) && importPreviewData.preview.length > 0 && (
          <div className="products-import-preview-table-wrap">
            <table className="products-import-preview-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Allow</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {importPreviewData.preview.slice(0, 25).map((row) => (
                  <tr key={`preview-${row.row}`}>
                    <td>{row.row}</td>
                    <td>{row.action}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.status === 'needs_confirmation' ? (
                        <input
                          id={`import-allow-identical-${row.row}`}
                          name={`import_allow_identical_${row.row}`}
                          type="checkbox"
                          checked={importAllowIdenticalRows.includes(Number(row.row))}
                          onChange={(e) => {
                            const rowNo = Number(row.row);
                            setImportAllowIdenticalRows((prev) => {
                              if (e.target.checked) return Array.from(new Set([...prev, rowNo]));
                              return prev.filter((v) => v !== rowNo);
                            });
                          }}
                        />
                      ) : '-'}
                    </td>
                    <td>
                      {row.errors?.length
                        ? row.errors.join('; ')
                        : row.warnings?.length
                          ? row.warnings.join('; ')
                          : 'Ready'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importPreviewData.preview.length > 25 && (
              <p className="products-import-preview-note">
                Showing first 25 rows of {importPreviewData.preview.length}. Confirm applies full validated batch.
              </p>
            )}
          </div>
        )}
      </div>
    ) : null}
  </>
);

export default ProductsImportCard;
