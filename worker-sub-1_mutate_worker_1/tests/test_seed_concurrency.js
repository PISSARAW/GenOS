const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./src/db/schema');
const { seedDatabase, workspaceInitializationAlertId } = require('./src/db/seed');

async function openDatabase(filename) {
  return open({ filename, driver: sqlite3.Database });
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-seed-concurrency-'));
  const filename = path.join(directory, 'genos.db');
  const first = await openDatabase(filename);
  const second = await openDatabase(filename);

  try {
    await initializeSchema(first);
    await seedDatabase(first);
    await first.run("INSERT INTO workspaces (id, name, path) VALUES ('ws-concurrent', 'Concurrent workspace', '/tmp/concurrent')");

    // Separate SQLite connections simulate two GenOS startup processes.  Both
    // seed passes must succeed even when they discover the new workspace together.
    await Promise.all([seedDatabase(first), seedDatabase(second)]);

    const alerts = await first.all("SELECT id FROM global_alerts WHERE workspace_name = 'Concurrent workspace'");
    assert.equal(alerts.length, 1, 'the workspace must have exactly one bootstrap alert');
    assert.equal(alerts[0].id, workspaceInitializationAlertId('ws-concurrent'));
  } finally {
    await first.close();
    await second.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log('Concurrent seed bootstrap checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
