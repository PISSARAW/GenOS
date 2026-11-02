'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const adapter = require('../../src/services/nervous/topologyAdapter');
const { SCOPE, event, saveTelemetry, connection } = require('./helpers');
const { setup, prepare } = require('./graphFixtures');
process.env.GENOS_NERVOUS_ENABLED = '1';

function workerInput(db, mode, workerId) {
  return { db, workerId, context: { missionId: 'mission-a', orchestratorId: 'parent', request: { mode } },
    member: { role: workerId === 'worker-a' ? 'producer' : 'consumer',
      dependsOn: workerId === 'worker-b' ? ['producer'] : [] } };
}

async function bind(db, mode) {
  for (const id of ['worker-a', 'worker-b']) {
    assert.equal((await adapter.recordWorker(workerInput(db, mode, id))).status, 'RECORDED');
  }
}

for (const mode of adapter.MODES) {
  test(`${mode}: persisted worker identities automatically configure the monitoring graph`, async t => {
    const h = await setup(t);
    await bind(h.source, mode);
    const item = event(`topology-${mode}`, { eventType: 'AGENT_FAILED', payload: { missionId: 'mission-a' } });
    await saveTelemetry(h.source, item);
    assert.equal((await h.bridge.observePersistedEvent(h.source, item)).status, 'OBSERVED');
    const effects = (await h.store.effects(SCOPE)).map(row => JSON.parse(row.body));
    const waves = effects.filter(effect => effect.pathway === 'SYSTEMIC_WAVE');
    assert.deepEqual(waves.map(effect => effect.target).sort(), ['parent', 'worker-b']);
    assert.ok(waves.every(effect => effect.action === 'INCREASE_MONITORING' && effect.evidenceStatus === 'UNVERIFIED'));
  });
}

test('topology metadata survives source connection restart; no manual graph replay is required', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gns-topology-'));
  const filename = path.join(directory, 'source.sqlite');
  let db = connection(filename);
  t.after(async () => { await db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await prepare(db);
  await bind(db, 'rhizome');
  await db.close();
  db = connection(filename);
  const graph = await adapter.loadGraph({ db, event: event('restart'), scope: SCOPE });
  assert.deepEqual(graph.edges, [
    { from: 'worker-a', to: 'parent' }, { from: 'worker-b', to: 'parent' }, { from: 'worker-a', to: 'worker-b' }
  ]);
});

test('conflicting transitions fail closed until all persisted bindings agree', async t => {
  const h = await setup(t);
  await bind(h.source, 'trinity');
  await adapter.recordWorker(workerInput(h.source, 'biome', 'worker-a'));
  const input = { db: h.source, event: event('transition'), scope: SCOPE };
  await assert.rejects(adapter.loadGraph(input), /TOPOLOGY_BINDING_CONFLICT/);
  await adapter.recordWorker(workerInput(h.source, 'biome', 'worker-b'));
  assert.equal((await adapter.loadGraph(input)).edges.length, 3);
});

test('forged missions, foreign scopes and unattached identities never configure a graph', async t => {
  const h = await setup(t);
  await bind(h.source, 'biome');
  const request = { db: h.source, event: event('forged', { payload: { missionId: 'mission-b' } }), scope: SCOPE };
  await assert.rejects(adapter.loadGraph(request), /TOPOLOGY_MISSION_MISMATCH/);
  assert.equal(await adapter.loadGraph({ ...request, scope: { ...SCOPE, projectId: 'other' } }), null);
  assert.equal((await adapter.recordWorker(workerInput(h.source, 'biome', 'foreign'))).status, 'NOT_BOUND');
});

function launchModule() {
  let reads = 0;
  const dependencies = {
    '../../../bin/workerLaunchPayload.cjs': { workerLaunchPayload: () => ({}) },
    '../agents/agentIncarnationPayloadService.js': { buildLaunchCapabilities: () => ({}) },
    '../topologyWorkerPersistenceService.js': { ensureTopologyWorker: async () => ({}) },
    '../missionIdentityService.js': { attachAgent: async () => ({}) },
    '../biologicalWorkerStore': { latestBindingForMission: async () => ({ runId: `run-${++reads}` }) },
    '../nervous/topologyAdapter': adapter,
    '../../../bin/detachedSpawn.cjs': { runtimeDirectory: () => '', toSpawnArgs: () => [],
      openRunnerStdio: () => ({ stdio: 'ignore', close: () => {} }) },
    child_process: { spawn: () => {
      const runner = new EventEmitter();
      setImmediate(() => { runner.emit('spawn'); setImmediate(() => runner.emit('close', 0)); });
      return runner;
    } }
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../../src/services/topology/workerLauncher.cjs');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, process,
    require: name => dependencies[name] || require(name), console });
  return module.exports;
}

test('the production launch path records topology binding before starting its runtime', async t => {
  const h = await setup(t);
  const input = workerInput(h.source, 'syncytium', 'worker-a');
  input.context.repoRoot = process.cwd();
  input.context.bridgePath = 'unused-test-bridge';
  await launchModule().launchWorker({ ...input, parent: {}, suppliedWorkerId: 'worker-a', index: 1 });
  const row = await h.source.get('SELECT metadata_json FROM agents WHERE id=?', 'worker-a');
  assert.equal(JSON.parse(row.metadata_json).nervousTopology.mode, 'syncytium');
});

test('disabled GNS neither records identities nor reads topology storage', async () => {
  process.env.GENOS_NERVOUS_ENABLED = '0';
  try {
    assert.deepEqual(await adapter.recordWorker({}), { status: 'DISABLED' });
    assert.equal(await adapter.loadGraph({}), null);
  } finally { process.env.GENOS_NERVOUS_ENABLED = '1'; }
});
