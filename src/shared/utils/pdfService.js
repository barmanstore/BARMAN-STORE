import jsPDF from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';

export const safeFileName = (value, fallback = 'document') => {
  const raw = String(value || '').trim();
  const normalized = raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
};

export const createPdfDoc = ({ orientation = 'p', unit = 'mm', format = 'a4' } = {}) => {
  return new jsPDF({ orientation, unit, format });
};

export const addAutoTable = (doc, options) => {
  if (typeof doc?.autoTable === 'function') {
    doc.autoTable(options);
    return doc;
  }
  if (typeof autoTable === 'function') {
    autoTable(doc, options);
    return doc;
  }
  throw new Error('PDF table plugin is unavailable');
};

export const addPdfFooterWithPagination = (doc, footerTextBuilder) => {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    if (typeof footerTextBuilder === 'function') {
      footerTextBuilder(doc, i, pageCount);
    }
  }
};

export const savePdf = (doc, fileNameWithoutExt = 'document') => {
  const fileName = `${safeFileName(fileNameWithoutExt, 'document')}.pdf`;
  doc.save(fileName);
};
