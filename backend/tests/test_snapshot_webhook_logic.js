const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const snapshots = require('../src/services/workspaceSnapshotStore');
const webhooks = require('../src/services/webhookService');

function memoryDb() {
  const rows = [];
  return {
    rows,
    async exec(sql) {
      if (!/^\s*(BEGIN IMMEDIATE|COMMIT|ROLLBACK)/i.test(sql)) throw new Error(`Unexpected SQL: ${sql}`);
    },
    async run(sql, ...args) {
      if (sql.includes('INSERT INTO workspace_snapshots')) {
        const [id, workspace_id, snapshot_hash, label, author, reason, diff_summary, metadata] = args;
        const step_number = Math.max(0, ...rows.filter((r) => r.workspace_id === workspace_id).map((r) => r.step_number)) + 1;
        rows.push({ id, workspace_id, snapshot_hash, step_number, label, author, reason, diff_summary, metadata });
        return { changes: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async all(sql, workspaceId) {
      if (sql.includes('SELECT snapshot_hash')) return rows.filter((row) => row.workspace_id === workspaceId).map((row) => ({ snapshot_hash: row.snapshot_hash }));
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async get(sql, ...args) {
      if (sql.includes('WHERE id = ?')) return rows.find((r) => r.id === args[0]);
      if (sql.includes('step_number = ?')) return rows.find((r) => r.workspace_id === args[0] && r.step_number === args[1]);
      return rows.find((r) => r.workspace_id === args[0] && (r.id === args[1] || r.snapshot_hash === args[2]));
    }
  };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-snapshot-test-'));
  const db = memoryDb();
  const workspace = { id: 'ws-test', path: root };
  try {
    assert.equal(typeof db.exec, 'function');
    await fs.writeFile(path.join(root, 'source.txt'), 'version one');
    await fs.writeFile(path.join(root, '.env'), 'TOKEN=must-not-leak');
    const first = await snapshots.capture({ db, workspace });
    const firstManifest = await snapshots.readManifest(db.rows[0]);
    assert.deepEqual(firstManifest.files.map((file) => file.path), ['source.txt']);

    await fs.writeFile(path.join(root, 'source.txt'), 'version two');
    const parallel = await Promise.all([snapshots.capture({ db, workspace }), snapshots.capture({ db, workspace })]);
    assert.equal(new Set([first.stepNumber, ...parallel.map((item) => item.stepNumber)]).size, 3);

    await snapshots.restore({ db, workspace, reference: first.id });
    assert.equal(await fs.readFile(path.join(root, 'source.txt'), 'utf8'), 'version one');
    assert.equal(await fs.readFile(path.join(root, '.env'), 'utf8'), 'TOKEN=must-not-leak');

    assert.equal(webhooks.accepts({ events: '["AGENT_COMPLETED"]' }, { eventType: 'AGENT_COMPLETED' }), true);
    assert.equal(webhooks.accepts({ events: '["AGENT_COMPLETED"]' }, { eventType: 'AGENT_FAILED' }), false);
    assert.equal(webhooks.accepts({ events: '["*"]' }, { eventType: 'ANYTHING' }), true);
    assert.equal(snapshots.isAllowedTestCommand('npm test -- backend/tests/test_backend.js'), true);
    assert.equal(snapshots.isAllowedTestCommand('cargo test --workspace'), true);
    assert.equal(snapshots.isAllowedTestCommand('node -e "process.exit(1)"'), false);
    assert.equal(snapshots.isAllowedTestCommand('npx @attacker/pkg'), false);
    assert.equal(snapshots.isAllowedTestCommand('npm test & whoami'), false);
    assert.equal(snapshots.isAllowedTestCommand('cargo test; whoami'), false);
    console.log('Snapshot and webhook logic: all assertions passed.');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
