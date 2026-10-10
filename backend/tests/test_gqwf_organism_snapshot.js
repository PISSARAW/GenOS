const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const dbModule = require('../src/db');

function response() {
  let result;
  return { res: {
    status: (code) => ({ json: (body) => { result = { code, body }; } }),
    json: (body) => { result = { code: 200, body }; }
  }, get: () => result };
}

async function main() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'GqwfOrganismSnapshotTestOnly-2026!';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gqwf-organism-'));
  const originalGetDatabase = dbModule.getDatabase;
  try {
    await fs.writeFile(path.join(root, 'source.txt'), 'durable source');
    const db = await dbModule.getDatabase(':memory:');
    await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'gqwf-organism-ws', 'GQWF organism', root);
    await db.run(`INSERT INTO agents (id, name, role, status, workspace_id)
      VALUES (?, ?, ?, ?, ?)`, 'gqwf-organism-agent', 'GQWF agent', 'Solver', 'idle', 'gqwf-organism-ws');
    dbModule.getDatabase = async () => db;
    const snapshotsPath = '../src/controllers/lineage/snapshots';
    delete require.cache[require.resolve(snapshotsPath)];
    const snapshots = require(snapshotsPath);
    const request = { body: { agentId: 'gqwf-organism-agent', gqwfV2: true } };
    const created = response();
    await snapshots.snapshotAgentState(request, created.res);
    assert.equal(created.get().code, 201);
    const rootHash = created.get().body.gqwfRootHash;
    assert.match(rootHash, /^[a-f0-9]{64}$/);
    const saved = await db.get('SELECT state_json FROM agent_state_snapshots WHERE id = ?', created.get().body.snapshotId);
    const state = JSON.parse(saved.state_json);
    assert.equal(snapshots.verifyOrganismSnapshot(state).valid, true);
    assert.equal(state._genosSnapshot.workspaceSnapshot.gqwfRootHash, rootHash);
    const altered = structuredClone(state);
    altered._genosSnapshot.workspaceSnapshot.gqwfRootHash = 'f'.repeat(64);
    assert.equal(snapshots.verifyOrganismSnapshot(altered).valid, false);
    assert.deepEqual(state._genosSnapshot.organismSnapshot.components.gqwfFileRoot, {
      status: 'captured-reference', rootHash, sourceSnapshotId: created.get().body.workspaceSnapshotId,
      restorable: false
    });
    const link = await db.get('SELECT legacy_hash, root_hash FROM gqwf_legacy_links WHERE workspace_id = ? AND snapshot_id = ?',
      'gqwf-organism-ws', created.get().body.workspaceSnapshotId);
    assert.equal(link.legacy_hash, created.get().body.workspaceSnapshotHash);
    assert.equal(link.root_hash, rootHash);
    const restored = response();
    await snapshots.restoreAgentState({ body: { agentId: request.body.agentId, snapshotId: created.get().body.snapshotId } }, restored.res);
    assert.equal(restored.get().body.gqwfRootHash, rootHash);
    assert.equal(restored.get().body.gqwfRootRestored, false);
    const legacy = response();
    await snapshots.snapshotAgentState({ body: { agentId: request.body.agentId } }, legacy.res);
    assert.equal(legacy.get().body.gqwfRootHash, null);
    const legacyRow = await db.get('SELECT state_json FROM agent_state_snapshots WHERE id = ?', legacy.get().body.snapshotId);
    assert.equal(JSON.parse(legacyRow.state_json)._genosSnapshot.organismSnapshot.components.gqwfFileRoot, undefined);
    const committed = response();
    await snapshots.commitAgentState({ body: { agentId: request.body.agentId,
      message: 'GQWF capture', gqwfV2: true } }, committed.res);
    assert.equal(committed.get().code, 201);
    assert.match(committed.get().body.gqwfRootHash, /^[a-f0-9]{64}$/);
    await db.run('DELETE FROM gqwf_legacy_links WHERE workspace_id = ? AND snapshot_id = ?',
      'gqwf-organism-ws', created.get().body.workspaceSnapshotId);
    await assert.rejects(() => snapshots.restoreAgentState(
      { body: { agentId: request.body.agentId, snapshotId: created.get().body.snapshotId } }, response().res),
    { code: 'ORGANISM_GQWF_REFERENCE_INVALID', status: 409 });
    assert.throws(() => require('../src/services/organismSnapshotCapabilities').assertRequest({ gqwfV2: 'true' }),
      { code: 'ORGANISM_GQWF_MODE_INVALID', status: 400 });
    assert.equal(require('../src/services/organismSnapshotCapabilities').report().gqwfFileRoot.restoreAvailable, false);
    console.log('GQWF organism snapshot reference and restore boundary passed.');
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    await dbModule.closeDatabase();
    if (root.startsWith(path.resolve(os.tmpdir()) + path.sep)) await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
