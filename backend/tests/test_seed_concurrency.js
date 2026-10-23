const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-only';
const { initializeSchema } = require('../src/db/schema');
const { seedDatabase, workspaceInitializationAlertId } = require('../src/db/seed');

async function openDatabase(filename) {
  return open({ filename, driver: sqlite3.Database });
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-seed-concurrency-'));
  const filename = path.join(directory, 'genos.db');
  const envKeys = ['GENOS_WORKSPACE_ROOT', 'GENOS_LOCAL_ORGANIZATION_ID', 'GENOS_LOCAL_PROJECT_ID',
    'GENOS_AGENT_ID', 'GENOS_ORCHESTRATOR_AGENT_ID', 'GENOS_CAPSULE_ROOT'];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.GENOS_WORKSPACE_ROOT = path.join(directory, 'parent-workspace');
  process.env.GENOS_LOCAL_ORGANIZATION_ID = 'test-org';
  process.env.GENOS_LOCAL_PROJECT_ID = 'test-project';
  delete process.env.GENOS_AGENT_ID;
  delete process.env.GENOS_ORCHESTRATOR_AGENT_ID;
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

    process.env.GENOS_AGENT_ID = 'worker-child';
    process.env.GENOS_ORCHESTRATOR_AGENT_ID = 'root-orchestrator';
    process.env.GENOS_CAPSULE_ROOT = path.join(directory, 'capsules');
    process.env.GENOS_WORKSPACE_ROOT = path.join(process.env.GENOS_CAPSULE_ROOT, 'workspace', 'worker-child');
    await seedDatabase(second);
    const rootWorkspace = await first.get("SELECT path FROM workspaces WHERE id = 'ws-local'");
    assert.equal(rootWorkspace.path, path.join(directory, 'parent-workspace'),
      'worker bootstrap must not replace the configured root workspace with its private capsule');
  } finally {
    await first.close();
    await second.close();
    fs.rmSync(directory, { recursive: true, force: true });
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

main().then(() => {
  console.log('Concurrent seed bootstrap checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
