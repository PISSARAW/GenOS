const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const snapshotStore = require('../src/services/workspaceSnapshotStore');

(async () => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-snapshot-capture-'));
  await fs.writeFile(path.join(workspacePath, 'file.txt'), 'snapshot payload');
  const db = {
    async all() { return []; },
    async get() { return null; },
    async exec(sql) {
      if (sql.includes('BEGIN')) return;
      if (sql.includes('COMMIT')) return;
      if (sql.includes('ROLLBACK')) return;
    },
    async run(sql) {
      if (sql.includes('INSERT INTO workspace_snapshots')) throw new Error('simulated database failure');
      return { changes: 1 };
    }
  };

  await assert.rejects(
    snapshotStore.capture({ db, workspace: { id: 'workspace-1', path: workspacePath } }),
    /simulated database failure/
  );
  const entries = await fs.readdir(snapshotStore.snapshotRoot(workspacePath, 'workspace-1'));
  assert.deepEqual(entries, [], 'failed registration must not leave an orphan payload');
  await fs.rm(workspacePath, { recursive: true, force: true });
  console.log('Snapshot capture cleanup checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
