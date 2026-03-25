require('./loadEnv');

const { startRuntime } = require('./core/runtime');
const { createAppContext } = require('./appFactory');

const { app, runtime } = createAppContext();

if (require.main === module) {
  startRuntime({
    app,
    port: runtime.port,
    isVercelRuntime: runtime.isVercelRuntime,
    ensureRuntimeReady: runtime.ensureRuntimeReady,
    startWorkers: runtime.startWorkers,
    stopWorkers: runtime.stopWorkers,
    closePostgresScaffold: runtime.closePostgresScaffold,
  });
}

module.exports = app;
