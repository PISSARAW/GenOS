/**
 * GenOS Studio Backend Server Entry Point
 * Boots SQLite persistence and starts HTTP server.
 */

const http = require('http');
const { createApp } = require('./src/app');
const { getDatabase, closeDatabase } = require('./src/db');
const telemetry = require('./src/services/telemetryObserver');
const jobWorker = require('./src/services/jobWorker');
const { enableGriotAutostart } = require('./src/services/griotAutostart');

const PORT = process.env.PORT || 4000;

async function startServer() {
  // Configure Griot to auto-start on Windows boot automatically
  enableGriotAutostart();

  try {
    // 1. Initialize SQLite Database & Schema
    console.log('[GenOS Backend] Initializing SQLite database...');
    const db = await getDatabase();
    jobWorker.startJobWorker();
    const { count } = await db.get(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );
    console.log(`[GenOS Backend] SQLite database & ${count} tables ready.`);

    // 2. Create Express App
    const app = createApp();
    const server = http.createServer(app);

    // 3. Start Listening
    server.listen(PORT, () => {
      console.log(`[GenOS Full-Stack] Server running on port ${PORT}`);
      telemetry.emitEvent({
        eventType: 'SERVER_BOOT',
        agentId: 'system',
        action: 'BOOT',
        detail: `GenOS Backend operational on port ${PORT}`,
        severity: 'info'
      });
    });

    const shutdown = async (signal) => {
      console.log(`[GenOS Backend] Received ${signal}; draining requests.`);
      jobWorker.stopJobWorker();
      server.close(async () => {
        await closeDatabase();
        console.log('[GenOS Backend] Shutdown complete.');
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);

    return { app, server, db };
  } catch (err) {
    console.error('[GenOS Backend] Fatal boot error:', err);
    process.exit(1);
  }
}


if (require.main === module) {
  startServer();
}

module.exports = { startServer };
