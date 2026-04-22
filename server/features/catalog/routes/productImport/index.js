const { registerProductTemplateRoutes } = require('./templateRoutes');
const { registerProductExportRoutes } = require('./exportRoutes');
const { registerProductImportPreviewRoutes } = require('./previewRoutes');
const { registerProductImportConfirmRoutes } = require('./confirmRoutes');

module.exports = {
  registerProductTemplateRoutes,
  registerProductExportRoutes,
  registerProductImportPreviewRoutes,
  registerProductImportConfirmRoutes,
};
