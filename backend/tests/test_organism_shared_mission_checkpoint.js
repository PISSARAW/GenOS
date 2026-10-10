const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const dbModule = require('../src/db');
const checkpoints = require('../src/services/organismOrchestratorCheckpoint');

async function main() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'SharedMissionSnapshotTestOnly-2026!';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-shared-mission-'));
  const previous = process.env.GENOS_STUDIO_ROOT;
  const originalGetDatabase = dbModule.getDatabase;
  const rustMissionId = '00000000-0000-4000-8000-000000000002';
  const directory = path.join(root, 'biological-receipts', `${rustMissionId}.continuity`);
  try {
    process.env.GENOS_STUDIO_ROOT = root;
    await fs.mkdir(directory, { recursive: true });
    const bytes = Buffer.from(JSON.stringify({ seq_id: 1, orchestrator_state: {
      mission_id: rustMissionId, orchestrator: { ready: true } } }));
    const name = `checkpoint-1-${crypto.createHash('sha256').update(bytes).digest('hex')}.json`;
    await fs.writeFile(path.join(directory, name), bytes);
    const db = await dbModule.getDatabase(':memory:');
    dbModule.getDatabase = async () => db;
    delete require.cache[require.resolve('../src/controllers/lineage/snapshots')];
    const controller = require('../src/controllers/lineage/snapshots');
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('primary', 'Primary', 'Solver', 'idle')");
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('peer', 'Peer', 'Solver', 'idle')");
    await db.run("INSERT INTO missions (mission_id, objective) VALUES ('shared', 'Snapshot')");
    await db.run("INSERT INTO mission_agents (mission_id, agent_id) VALUES ('shared', 'primary')");
    await db.run("INSERT INTO mission_agents (mission_id, agent_id) VALUES ('shared', 'peer')");
    await db.run('INSERT INTO biological_execution_missions (mission_id, rust_mission_id) VALUES (?, ?)', 'shared', rustMissionId);
    const scope = { clause: 'w.organization_id IS NULL AND w.project_id IS NULL', params: [] };
    const references = await checkpoints.capture(db, 'primary', { scope });
    assert.equal(references[0].peers.length, 1);
    await checkpoints.assertCoherent(db, { agentId: 'primary', references, scope });
    const response = { body: null, status() { return this; }, json(value) { this.body = value; } };
    await controller.snapshotAgentState({ body: { agentId: 'primary' } }, response);
    const snapshot = await db.get('SELECT state_json FROM agent_state_snapshots WHERE id = ?', response.body.snapshotId);
    assert.equal(response.body.organismSnapshot.components.orchestrator.status, 'captured-reference');
    const laterBytes = Buffer.from(JSON.stringify({ seq_id: 2, orchestrator_state: {
      mission_id: rustMissionId, orchestrator: { ready: true } } }));
    const laterName = `checkpoint-2-${crypto.createHash('sha256').update(laterBytes).digest('hex')}.json`;
    await fs.writeFile(path.join(directory, laterName), laterBytes);
    await db.run("UPDATE agents SET name = 'Mutated' WHERE id = 'primary'");
    const restored = await controller.restoreAgentStateSnapshot({ db, scope,
      agent: await db.get("SELECT * FROM agents WHERE id = 'primary'"), state: JSON.parse(snapshot.state_json) });
    assert.equal(restored.orchestratorCursorRestored, true);
    assert.equal((await checkpoints.latest(rustMissionId)).seq, 1);
    assert.equal((await db.get("SELECT name FROM agents WHERE id = 'primary'")).name, 'Primary');
    await db.run("UPDATE agents SET name = 'Changed' WHERE id = 'peer'");
    await assert.rejects(() => checkpoints.assertCoherent(db,
      { agentId: 'primary', references, scope }), { code: 'ORGANISM_SHARED_PEER_CHANGED' });
    console.log('Shared mission cohort guard passed.');
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    delete require.cache[require.resolve('../src/controllers/lineage/snapshots')];
    await dbModule.closeDatabase();
    if (previous === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
