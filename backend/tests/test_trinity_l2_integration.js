'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const qualification = require('../src/services/trinityQualificationDispatch');
const capsules = require('../src/services/agentCapsuleService');
const bindings = require('../src/services/trinityCapsuleBinding');
const manifests = require('../src/services/trinityRunManifest');
const traces = require('../src/services/trinityTraceEvents');
const values = require('../src/services/trinityProvenanceValues');

async function createContext(root, db) {
  const hash = 'a'.repeat(64);
  await db.exec(`CREATE TABLE trinity_worlds (id TEXT, world_number INTEGER, snapshot_hash TEXT,
    workspace_root TEXT, experiment_id TEXT, agent_id TEXT);
    CREATE TABLE trinity_experiments (id TEXT, mission_id TEXT, design_json TEXT);`);
  await db.run('INSERT INTO trinity_experiments VALUES (?, ?, ?)', ['experiment', 'mission', JSON.stringify({ orchestratorId: 'parent' })]);
  await db.run('INSERT INTO trinity_worlds VALUES (?, ?, ?, ?, ?, ?)', ['world', 1, hash, root, 'experiment', 'worker']);
  const ctx = { db, agentId: 'worker', executionRun: { id: 'run' },
    dispatchedAgent: { organization_id: 'tenant' }, normalizedMission: {
      missionScope: { trinityExperimentId: 'experiment', missionId: 'mission' },
      workspaceRoot: root, workspaceId: 'workspace', orchestratorAgentId: 'parent', prompt: 'Execute a bounded candidate.', toolLease: [] } };
  const provisioning = { db, agentId: 'worker', workspaceRoot: root, capsuleRoot: root,
    executable: path.join(root, 'missing-genos.exe'), fallbackSynthetic: true,
    correlation: { missionId: 'mission', trinityExperimentId: 'experiment', worldId: 'world',
      workerId: 'worker', runId: 'run', parentId: 'parent', tenantId: 'tenant', workspaceId: 'workspace' },
    sourceSnapshotHash: hash };
  ctx.genosCapsule = await capsules.provision(provisioning);
  assert.equal(ctx.genosCapsule.correlation.runId, ctx.executionRun.id);
  assert.equal(ctx.genosCapsule.worldId, 'world');
  assert.equal(ctx.genosCapsule.bootstrapMode, 'synthetic');
  assert.ok(ctx.genosCapsule.fallbackReason);
  const same = await capsules.provision(provisioning);
  assert.equal(same.sealHash, ctx.genosCapsule.sealHash);
  return { ctx, provisioning };
}

async function bindingAndReplay(input) {
  const manifest = await qualification.recordStarted(input.ctx);
  assert.equal(manifest.payload.correlation.snapshotId, input.ctx.genosCapsule.snapshotId);
  assert.equal(await manifests.verify(manifest), true);
  const replay = await qualification.recordStarted(input.ctx);
  assert.equal(replay.hash, manifest.hash);
  const seal = await bindings.assertAnchored(input.ctx, manifest);
  assert.equal(seal.hash, input.ctx.genosCapsule.sealHash);
  const events = await traces.read(input.ctx.db, { missionId: 'mission' });
  assert.deepEqual(events.map(event => event.stage), ['capsule_binding', 'worker_runtime']);
  assert.equal(events[0].details.bootstrapMode, 'synthetic');
  assert.equal(events[0].details.capsuleSealHash, seal.hash);
  await assert.rejects(bindings.assertAnchored({ ...input.ctx, genosCapsule: {
    ...input.ctx.genosCapsule, correlation: { ...input.ctx.genosCapsule.correlation, worldId: 'foreign' } } }, manifest),
    { code: 'TRINITY_CAPSULE_INVALID' });
  return manifest;
}

async function tamperRefusal(input) {
  const capsule = input.ctx.genosCapsule;
  const seal = JSON.parse(await fs.readFile(capsule.sealPath, 'utf8'));
  await fs.writeFile(capsule.genomePath, '{}');
  seal.payload.files.genomePath = values.hashBytes('{}');
  seal.hash = require('../src/services/trinityCapsulePaths').hash(seal.payload);
  await fs.writeFile(capsule.sealPath, JSON.stringify(seal));
  await assert.rejects(capsules.provision(input.provisioning), { code: 'TRINITY_CAPSULE_INVALID' });
  await assert.rejects(qualification.recordStarted({ ...input.ctx, genosCapsule: {
    ...capsule, sealHash: seal.hash } }), { code: 'TRINITY_TRACE_REPLAY_CHANGED' });
}

async function prelaunchRefusal(root) {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  const previous = process.env.GENOS_TRINITY_MODELS;
  process.env.GENOS_TRINITY_MODELS = '';
  try {
    let launches = 0;
    await assert.rejects(require('../bin/topologyTrinityHandler.cjs').handle({ db,
      context: { request: { mission: 'Compare les scénarios de cette architecture de messagerie.',
        variant_id: 'factorial', trinityMissionId: 'factorial-refusal' }, repoRoot: root, orchestratorId: 'parent' },
      ensureParent: async () => ({}), workerGarage: { state: async () => ({ available: 16 }) },
      buildNCEEnrichments: async () => null, launchWorker: async () => { launches += 1; } }),
    { code: 'TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED' });
    assert.equal(launches, 0);
    const events = await traces.read(db, { missionId: 'factorial-refusal' });
    assert.deepEqual(events.map(event => event.status), ['started', 'failed']);
    assert.equal(events[1].details.errorCode, 'TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED');
    assert.equal((await db.all("SELECT name FROM sqlite_master WHERE name='trinity_worlds'")).length, 0);
  } finally {
    if (previous === undefined) delete process.env.GENOS_TRINITY_MODELS;
    else process.env.GENOS_TRINITY_MODELS = previous;
    await db.close();
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trinity-l2-integration-'));
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const input = await createContext(root, db);
    await bindingAndReplay(input);
    await tamperRefusal(input);
    await prelaunchRefusal(root);
    console.log('Trinity L2 capsule/run/world binding, independent SQLite anchor and prelaunch refusal: PASS');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
