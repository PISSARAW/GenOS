'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getDatabase, closeDatabase } = require('../src/db');
const snapshots = require('../src/services/workspaceSnapshotStore');
const { RETRY_DELAYS_MS } = require('../src/services/snapshotPublishRetry');

async function retryCapture(spec, failureCount) {
  const original = fs.promises.rename;
  let attempts = 0;
  fs.promises.rename = async (source, destination) => {
    if (path.basename(source).startsWith('.snapshot-')) {
      attempts += 1;
      if (attempts <= failureCount) throw Object.assign(new Error('Injected busy publication'), { code: 'EPERM' });
    }
    return original(source, destination);
  };
  try { return { snapshot: await snapshots.capture(spec), attempts }; }
  finally { fs.promises.rename = original; }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-snapshot-retry-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'snapshot-retry-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  const db = await getDatabase(path.join(root, 'test.db'));
  const workspace = { id: 'retry-ws', path: path.join(root, 'workspace') };
  fs.mkdirSync(workspace.path);
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', workspace.id, 'Retry', workspace.path);
  const spec = { db, workspace };
  try {
    fs.writeFileSync(path.join(workspace.path, 'proof.txt'), 'transient');
    const success = await retryCapture(spec, 3);
    assert.equal(success.attempts, 4);
    assert.ok(success.snapshot.snapshotHash);
    const before = await db.get('SELECT count(*) AS n FROM workspace_snapshots');
    fs.writeFileSync(path.join(workspace.path, 'proof.txt'), 'permanent');
    await assert.rejects(retryCapture(spec, 100), { code: 'EPERM' });
    assert.equal((await db.get('SELECT count(*) AS n FROM workspace_snapshots')).n, before.n);
    const entries = fs.readdirSync(snapshots.snapshotRoot(workspace.path, workspace.id));
    assert.ok(!entries.some(entry => entry.startsWith('.snapshot-')));
    console.log(`PASS EPERM transient retry and permanent failure without row or staging leak; ${RETRY_DELAYS_MS.length + 1} attempts maximum`);
    for (let index = 0; index < 12; index += 1) {
      fs.writeFileSync(path.join(workspace.path, 'proof.txt'), `collision-${index}`);
      const pair = await Promise.all([snapshots.capture(spec), snapshots.capture(spec)]);
      assert.equal(pair[0].snapshotHash, pair[1].snapshotHash);
    }
    const last = await snapshots.capture(spec);
    const payload = path.join(snapshots.snapshotRoot(workspace.path, workspace.id), last.snapshotHash, 'files', 'proof.txt');
    fs.writeFileSync(payload, 'corrupt');
    await assert.rejects(snapshots.capture(spec), /integrity|hash|mismatch|corrupt|altered/i);
    console.log('PASS 12 native publication collisions; corrupted existing payload refuses success');
  } finally { await closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
