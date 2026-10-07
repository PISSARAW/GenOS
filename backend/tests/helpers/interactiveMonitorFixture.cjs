'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../../src/db');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-interactive-monitor-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'interactive-monitor-test-only';
  process.env.GENOS_TRINITY_MONITOR_PORT = '14590';
  process.env.GENOS_TRINITY_MONITOR_TOKEN = 'interactive-monitor-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  const db = await getDatabase(path.join(root, 'monitor.db'));
  for (let number = 1; number <= 3; number += 1) {
    await db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status)
      VALUES (?, ?, ?, ?, ?, 'running')`, `b06-interactive_world_${number}`, 'B06 interactive SQLite monitor', number,
    `B06 world ${number}`, 'bounded fixture');
  }
  const monitor = require('../../src/services/trinityMonitorServer');
  monitor.start();
  const timer = setTimeout(async () => {
    await db.run("UPDATE trinity_worlds SET status = 'completed' WHERE id LIKE 'b06-interactive_world_%'");
    console.log('MONITOR_FIXTURE_COMPLETED');
  }, 12000);
  async function shutdown() {
    clearTimeout(timer);
    await monitor.stop();
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
  process.on('SIGTERM', () => shutdown().then(() => process.exit(0)));
  process.on('SIGINT', () => shutdown().then(() => process.exit(0)));
  setTimeout(() => shutdown().then(() => process.exit(0)), 120000).unref();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
