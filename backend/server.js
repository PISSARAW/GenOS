/**
 * GenOS Studio Backend Server Entry Point
 * Boots SQLite persistence and starts HTTP server.
 */

const http = require('http');
const { createApp } = require('./src/app');
const { getDatabase } = require('./src/db');
const telemetry = require('./src/services/telemetryObserver');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // 1. Initialize SQLite Database & Schema
    console.log('[GenOS Backend] Initializing SQLite database...');
    const db = await getDatabase();
    console.log('[GenOS Backend] SQLite database & 18 tables ready.');

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
