const createProductFileParser = ({ XLSX, path }) => {
  const parseProductFileToRows = ({ fileName, fileContentBase64 }) => {
    if (!fileName || !fileContentBase64) {
      throw new Error('file_name and file_content_base64 are required');
    }
    const ext = String(path.extname(fileName || '')).toLowerCase();
    const buffer = Buffer.from(String(fileContentBase64 || ''), 'base64');
    let workbook;
    if (ext === '.csv') {
      workbook = XLSX.read(buffer.toString('utf8'), { type: 'string' });
    } else if (ext === '.xlsx' || ext === '.xls') {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } else {
      throw new Error('Unsupported file format. Use .csv, .xlsx or .xls');
    }

    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('No sheet found in file');
    const sheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No data rows found');
    return rows;
  };

  return { parseProductFileToRows };
};

module.exports = { createProductFileParser };
