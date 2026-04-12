import { apiFetchRaw } from '../../../shared/services/api';

const useAdminImportExport = ({
  productsApi,
  user,
  importFile,
  setImportFile,
  importPreviewData,
  setImportPreviewData,
  importAllowIdenticalRows,
  setImportAllowIdenticalRows,
  setImportBusy,
  importBusy,
  importFileInputRef,
  showNotification,
  registerBulkJob,
  setShowExportDialog,
  exportFormat,
  productTableSearch,
  productTableCategoryFilter,
  productTableStatusFilter,
  productTableLowStockOnly,
  productTableSortField,
  productTableSortDir,
}) => {
  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const downloadProtectedFile = async (url, fallbackName) => {
    if (!user?.token) {
      throw new Error('Please login again. Missing auth token.');
    }
    const response = await apiFetchRaw(url, { method: 'GET' });
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const disposition = String(response.headers.get('Content-Disposition') || '');
    const match = disposition.match(/filename=\"?([^\"]+)\"?/i);
    anchor.href = href;
    anchor.download = match?.[1] || fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  const handleExportProducts = async () => {
    const format = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
    try {
      const url = productsApi.getExportUrl(format, {
        mode: 'current',
        q: String(productTableSearch || '').trim(),
        category: String(productTableCategoryFilter || '').trim(),
        status: String(productTableStatusFilter || '').trim(),
        low_stock: productTableLowStockOnly ? 'true' : '',
        include_inactive: 'true',
        sort_field: String(productTableSortField || '').trim(),
        sort_dir: String(productTableSortDir || '').trim(),
      });
      await downloadProtectedFile(url, `products-export.${format === 'xlsx' ? 'xlsx' : 'csv'}`);
      showNotification('Products exported successfully', 'success');
      setShowExportDialog(false);
    } catch (error) {
      showNotification(error.message || 'Failed to export products', 'error');
    }
  };

  const handleStartImport = () => {
    if (importBusy) return;
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setImportFile(file);
    await handlePreviewImport(file);
  };

  const handlePreviewImport = async (selectedFile = null) => {
    const file = selectedFile || importFile;
    if (!file) {
      showNotification('Select a CSV/XLSX file first', 'error');
      return;
    }
    try {
      setImportBusy(true);
      const base64 = await readFileAsBase64(file);
      const data = await productsApi.importPreview({
        file_name: file.name,
        file_content_base64: base64,
        mode: 'upsert',
        stock_mode: 'replace',
      });
      setImportPreviewData(data);
      setImportAllowIdenticalRows([]);
      showNotification('Import preview generated. Review and confirm.', 'success');
    } catch (error) {
      setImportPreviewData(null);
      showNotification(error.message || 'Failed to preview import', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreviewData?.batch_id || !importPreviewData?.checksum) {
      showNotification('Generate preview before confirming import', 'error');
      return;
    }
    try {
      setImportBusy(true);
      const result = await productsApi.importConfirm({
        batch_id: importPreviewData.batch_id,
        checksum: importPreviewData.checksum,
        allow_identical_rows: importAllowIdenticalRows,
      });
      const nextJob = registerBulkJob?.(result);
      setImportPreviewData(null);
      setImportFile(null);
      setImportAllowIdenticalRows([]);
      showNotification(
        nextJob
          ? 'Import job queued. The runner will process rows in the background.'
          : 'Import queued, but job tracking could not be initialized.',
        'success'
      );
    } catch (error) {
      showNotification(error.message || 'Failed to confirm import', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  return {
    handleExportProducts,
    handleStartImport,
    handleFileSelected,
    handlePreviewImport,
    handleConfirmImport,
  };
};

export default useAdminImportExport;
