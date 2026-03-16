const startRuntime = ({
  app,
  port,
  isVercelRuntime,
  ensureRuntimeReady,
  startWorkers,
  stopWorkers,
  closePostgresScaffold,
} = {}) => {
  const startServer = async () => {
    await ensureRuntimeReady();
    if (typeof startWorkers === 'function') startWorkers();

    app.listen(port, '0.0.0.0', () => {
      console.log(`BARMAN STORE API running on http://localhost:${port}`);
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
