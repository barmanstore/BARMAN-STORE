const {
  registerProductTemplateRoutes,
  registerProductExportRoutes,
  registerProductImportPreviewRoutes,
  registerProductImportConfirmRoutes,
} = require('./productImport');

const registerProductImportRoutes = (deps) => {
  registerProductTemplateRoutes(deps);
  registerProductExportRoutes(deps);
  registerProductImportPreviewRoutes(deps);
  registerProductImportConfirmRoutes(deps);
};

module.exports = { registerProductImportRoutes };
