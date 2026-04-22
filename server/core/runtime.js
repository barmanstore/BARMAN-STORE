const startRuntime = ({
  app,
  port,
  isVercelRuntime,
  ensureRuntimeReady,
  startWorkers,
  stopWorkers,
  closePostgresScaffold,
} = {}) => {
  const shutdownAfterStartupFailure = (error, server) => {
    const isPortInUse = error && error.code === 'EADDRINUSE';
    const reason = isPortInUse
      ? `Port ${port} is already in use. Stop the existing process or set PORT to another free port.`
      : error?.message || 'Unknown startup failure';

    console.error(`[SYSTEM] Server start aborted: ${reason}`);

    const finalize = () => {
      try {
        if (typeof stopWorkers === 'function') stopWorkers();
      } catch (stopError) {
        console.error(`[SYSTEM] Worker shutdown failed: ${stopError.message}`);
      }

      const closeRuntime = Promise.resolve().then(() => closePostgresScaffold?.());
      void Promise.allSettled([closeRuntime]).finally(() => {
        process.exit(1);
      });
    };

    if (server && server.listening) {
      server.close(finalize);
      return;
    }

    finalize();
  };

  const startServer = async () => {
    await ensureRuntimeReady();

    let server;
    server = app.listen(port, '0.0.0.0', () => {
      try {
        if (typeof startWorkers === 'function') startWorkers();
        console.log(`BARMAN STORE API running on http://localhost:${port}`);
      } catch (error) {
        shutdownAfterStartupFailure(error, server);
      }
    });

    server.once('error', (error) => {
      shutdownAfterStartupFailure(error, server);
    });
  };

  const shutdownServer = (signal) => {
    console.log(`[SYSTEM] Received ${signal}. Shutting down...`);
    if (typeof stopWorkers === 'function') stopWorkers();
    void Promise.allSettled([closePostgresScaffold()]).finally(() => {
      process.exit(0);
    });
  };

  if (!isVercelRuntime) {
    void startServer().catch((error) => {
      console.error(`[SYSTEM] Server start aborted: ${error.message}`);
      process.exit(1);
    });
    process.once('SIGINT', () => shutdownServer('SIGINT'));
    process.once('SIGTERM', () => shutdownServer('SIGTERM'));
  } else {
    console.log('[SYSTEM] Vercel runtime detected. Using serverless request handling.');
  }

  return { shutdownServer };
};

module.exports = { startRuntime };
