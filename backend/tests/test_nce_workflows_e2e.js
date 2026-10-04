'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function createPlayFixture() {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-nce-play-'));
  await fs.writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({ scripts: { test: 'node verify.js' } }));
  await fs.writeFile(path.join(workspacePath, 'proof.txt'), 'original');
  await fs.writeFile(path.join(workspacePath, 'verify.js'), [
    "require('fs').writeFileSync('proof.txt', 'mutated in snapshot');",
    "console.log('solver supporte maze solving');",
  ].join('\n'));
  return workspacePath;
}

function executeSql(options) {
  const { database, sql, params, mode } = options;
  return new Promise((resolve, reject) => {
    const callback = function callback(error, value) {
      if (error) return reject(error);
      resolve(mode === 'run' ? this : value);
    };
    database[mode](sql, params, callback);
  });
}

async function createSqliteDatabase() {
  const sqlite3 = require('sqlite3').verbose();
  const database = new sqlite3.Database(':memory:');
  const adapter = {
    run: (sql, ...params) => executeSql({ database, sql, params, mode: 'run' }),
    get: (sql, ...params) => executeSql({ database, sql, params, mode: 'get' }),
    all: (sql, ...params) => executeSql({ database, sql, params, mode: 'all' }),
    exec: (sql) => new Promise((resolve, reject) => database.exec(sql, (error) => error ? reject(error) : resolve())),
  };
  await adapter.run(`CREATE TABLE agent_phenotype_states (
    id TEXT PRIMARY KEY, agent_id TEXT, genome_id TEXT, state_json TEXT,
    phenotype_json TEXT, branches_json TEXT, atrophies_json TEXT, history_json TEXT,
    created_at TEXT, updated_at TEXT
  )`);
  await adapter.run(`CREATE TABLE workspace_snapshots (
    id TEXT PRIMARY KEY, workspace_id TEXT, snapshot_hash TEXT, step_number INTEGER,
    label TEXT, author TEXT, reason TEXT, diff_summary TEXT, metadata TEXT
  )`);
  await require('../src/db/migrations/migrateNcePlayObservations').migrateNcePlayObservations(adapter);
  return { database, adapter };
}

async function testCulturePhenotypeWithSQLite() {
  const dbPath = require.resolve('../src/db');
  const sqlite = await createSqliteDatabase();
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    withTransaction: async (_db, operation) => operation(),
    getDatabase: async () => { throw new Error('POET poll disabled in the isolated test'); },
  } };
  try {
    const state = { id: 'pheno_agent-learner', agentId: 'agent-learner', genomeId: 'genome-learner', currentPhenotype: { role: 'solver' }, branches: [], atrophies: [], history: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const artifact = { ...require('../src/services/culturalTransmissionService').createCulturalArtifact({
      agentId: 'teacher', type: 'procedure', content: { requiredCapabilities: ['planning'] },
    }), id: 'artifact-planning' };
    const benchmark = async () => Number(state.branches.some((branch) => branch.capabilities.includes('planning')));
    const bridge = require('../src/services/culturalPhenotypeBridgeService');
    const phenotype = require('../src/services/phenotypicDevelopmentService');
    const transfer = await bridge.transferCultureToPhenotype({ phenotypeState: state, artifact, benchmark });
    await phenotype.savePhenotypeState(state, sqlite.adapter);
    const nextEnvironment = await require('../src/services/nceEngines').applyPhenotype({
      agentId: state.agentId, genomeId: state.genomeId, requiredCapabilities: ['analysis'],
    }, { phenotype: { enabled: true } }, sqlite.adapter);
    const restored = await phenotype.loadPhenotypeState(state.genomeId, sqlite.adapter, state.agentId);
    const indexedState = await sqlite.adapter.get('SELECT branches_json, history_json FROM agent_phenotype_states WHERE id = ?', state.id);
    assert.equal(transfer.transfer.delta, 1);
    assert.equal(nextEnvironment.branchCount, 2, 'next mission loads the culturally changed phenotype');
    assert.equal(restored.history[0].culturalArtifactId, artifact.id);
    assert.equal(restored.branches.length, 2);
    assert.equal(JSON.parse(indexedState.branches_json).length, 2, 'denormalized branch index stays synchronized');
    assert.equal(JSON.parse(indexedState.history_json)[0].culturalArtifactId, artifact.id);
    const other = { ...restored, id: 'pheno_other-agent', agentId: 'other-agent',
      genomeId: state.genomeId, revision: 0, branches: [], history: [] };
    await phenotype.savePhenotypeState(other, sqlite.adapter);
    const owned = await phenotype.loadPhenotypeState(state.genomeId, sqlite.adapter, state.agentId);
    assert.equal(owned.agentId, state.agentId, 'shared genome must not return another agent phenotype');
    const stale = JSON.parse(JSON.stringify(owned));
    await phenotype.savePhenotypeState(owned, sqlite.adapter);
    await assert.rejects(phenotype.savePhenotypeState(stale, sqlite.adapter), /revision conflict/);
    console.log('Culture to phenotype persistence with SQLite: PASS');
  } finally {
    await new Promise((resolve, reject) => sqlite.database.close((error) => error ? reject(error) : resolve()));
  }
}

async function testPlayWithRealSnapshotRuntime() {
  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    withTransaction: async (_db, operation) => operation(),
  } };
  for (const name of ['workspaceSnapshotStore', 'workspaceSnapshotPayload', 'workspaceSnapshotRun', 'playService']) {
    delete require.cache[require.resolve(`../src/services/${name}`)];
  }
  const workspacePath = await createPlayFixture();
  const sqlite = await createSqliteDatabase();
  try {
    const play = require('../src/services/playService');
    const session = await play.runPlaySession('agent-play-real', {
      db: sqlite.adapter, workspacePath, workspaceId: 'ws-play-real',
      options: { budget: 1, timeoutMs: 10000 },
      inputs: [{ action: 'verify', tool: 'solver', context: 'maze', command: 'npm test' }],
    });
    assert.equal(session.iterations[0].outcome, 'success');
    assert.match(session.iterations[0].observation, /maze solving/);
    assert.equal(session.iterations[0].snapshotId.startsWith('snp-'), true);
    assert.equal(await fs.readFile(path.join(workspacePath, 'proof.txt'), 'utf8'), 'original', 'execution stays isolated from the source workspace');
    assert.ok(await sqlite.adapter.get('SELECT snapshot_hash FROM workspace_snapshots WHERE id = ?', session.iterations[0].snapshotId));
    const stored = await sqlite.adapter.get('SELECT observation_json FROM nce_play_observations WHERE agent_id = ?', 'agent-play-real');
    assert.equal(JSON.parse(stored.observation_json).verified, false,
      'Play output is recorded as an observation, not an independently verified ability');
    assert.deepEqual(play.extractAffordances({ outcome: 'failure', snapshotId: 'snp-failed',
      result: { exitCode: 1 }, observation: 'solver supporte maze solving' }), []);
    assert.deepEqual(play.generateCombinatorialInputs(['solver'], ['maze'], 'seed-1'),
      play.generateCombinatorialInputs(['solver'], ['maze'], 'seed-1'));
    console.log('Play with real snapshot capture and execution: PASS');
  } finally {
    await new Promise((resolve, reject) => sqlite.database.close((error) => error ? reject(error) : resolve()));
    await fs.rm(workspacePath, { recursive: true, force: true });
  }
}

async function testPoetWithRealSnapshotVerification() {
  const dbPath = require.resolve('../src/db');
  const workspacePath = await createPlayFixture();
  const sqlite = await createSqliteDatabase();
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    withTransaction: async (_db, operation) => operation(),
    getDatabase: async () => { throw new Error('POET telemetry poll disabled in the isolated test'); },
  } };
  const runtimePath = require.resolve('../src/services/agentRuntimeAdapter');
  require.cache[runtimePath] = { id: runtimePath, filename: runtimePath, loaded: true, exports: {
    startMission: async (mission) => {
      const telemetry = require('../src/services/telemetryObserver');
      setImmediate(() => telemetry.emit('telemetry', { agentId: mission.agentId, eventType: 'AGENT_COMPLETED' }));
      await fs.writeFile(path.join(mission.workspaceRoot, 'solution.json'), JSON.stringify({ solution: 'verified grid path' }));
      return { artifact: { path: 'solution.json' } };
    },
  } };
  for (const name of ['workspaceSnapshotStore', 'workspaceSnapshotPayload', 'workspaceSnapshotRun', 'telemetryObserver', 'poetExecutionEngine', 'poetBridgeService']) {
    delete require.cache[require.resolve(`../src/services/${name}`)];
  }
  try {
    const bridge = require('../src/services/poetBridgeService');
    const environment = {
      id: 'env-poet-real', difficulty: 0.3, workspacePath, workspaceId: 'ws-poet-real',
      db: sqlite.adapter, goals: ['solve grid'],
      verifierCommand: 'npm test', protectedPaths: ['package.json', 'verify.js'],
      stats: { attemptCount: 0, solvedCount: 0, bestScore: 0 },
    };
    const result = await bridge.coevolveWithExecution([{ id: 'agent-poet-real', role: 'solver' }], [environment], { timeoutMs: 60000 });
    const execution = result[0].evaluations[0].executionResult;
    assert.equal(execution.success, true, JSON.stringify(execution));
    await assert.rejects(fs.access(execution.executionWorkspace), /ENOENT/,
      'isolated POET workspace is removed after evidence capture');
    assert.match(execution.verification.output, /solver supporte maze solving/);
    assert.equal(environment.stats.solvedCount, 1);
    assert.equal(await fs.readFile(path.join(workspacePath, 'proof.txt'), 'utf8'), 'original');
    assert.ok(await sqlite.adapter.get('SELECT snapshot_hash FROM workspace_snapshots WHERE workspace_id = ?', 'ws-poet-real'));
    const generalization = await bridge.evaluateGeneralization(
      [{ id: 'agent-poet-real', role: 'solver' }],
      { training: [environment], heldOut: [{ ...environment, id: 'env-poet-heldout', goals: ['solve held-out grid'] }] },
      { timeoutMs: 60000 },
    );
    assert.equal(generalization.measured, true, 'held-out environments are actually executed');
    assert.equal(generalization.training.successRate, 1);
    assert.equal(generalization.heldOut.successRate, 1);
    assert.notEqual(generalization.split.trainingIds[0], generalization.split.heldOutIds[0]);
    assert.match(generalization.evidenceRef, /^[a-f0-9]{64}$/);
    const nceResult = await require('../src/services/nceIntegrationService').enhanceMissionWithNCE({
      poet: { agents: [{ id: 'agent-poet-real', role: 'solver' }],
        split: { training: [environment], heldOut: [{ ...environment,
          id: 'env-poet-nce-heldout', goals: ['solve another held-out grid'] }] },
        options: { timeoutMs: 60000 } },
      nceOptions: { curiosity: false, reprMutation: false, exaptation: false,
        envCoev: true, culture: false, play: false, phenotype: false },
    }, sqlite.adapter);
    assert.equal(nceResult.environments[0].measured, true,
      'the NCE integration must execute POET instead of returning synthetic descriptors');
    console.log('POET with real snapshot capture and verification: PASS');
  } finally {
    await new Promise((resolve, reject) => sqlite.database.close((error) => error ? reject(error) : resolve()));
    await fs.rm(workspacePath, { recursive: true, force: true });
  }
}

async function testPoetIgnoresStaleTerminalEvent() {
  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    getDatabase: async () => ({
      get: async (sql) => sql.includes('MAX(id)') ? { cursor: 7 } : {
        id: 7, event_type: 'AGENT_COMPLETED', payload_json: JSON.stringify({ agentId: 'agent-stale' }),
      },
    }),
  } };
  const runtimePath = require.resolve('../src/services/agentRuntimeAdapter');
  require.cache[runtimePath] = { id: runtimePath, filename: runtimePath, loaded: true, exports: {
    startMission: async () => ({ artifact: { solution: 'stale completion must not verify' } }),
  } };
  delete require.cache[require.resolve('../src/services/poetExecutionEngine')];
  const evidenceModule = require('../src/services/poetExecutionEvidence');
  const originalIsolation = evidenceModule.isolateEnvironment;
  const originalArtifact = evidenceModule.artifactEvidence;
  evidenceModule.isolateEnvironment = async (environment) => environment;
  evidenceModule.artifactEvidence = async () => null;
  delete require.cache[require.resolve('../src/services/poetExecutionEngine')];
  const execution = await require('../src/services/poetExecutionEngine').executeAgentOnEnvironment(
    { id: 'agent-stale', role: 'solver' },
    { id: 'env-stale', goals: ['solve grid'] },
    { timeoutMs: 20 },
  );
  assert.equal(execution.success, false);
  assert.match(execution.error, /TIMEOUT|deadline/);
  assert.equal(execution.verification, undefined, 'stale terminal rows cannot trigger snapshot verification');

  require.cache[runtimePath].exports.startMission = async () => { throw new Error('runtime startup rejected'); };
  delete require.cache[require.resolve('../src/services/poetExecutionEngine')];
  const failedRuntime = await require('../src/services/poetExecutionEngine').executeAgentOnEnvironment(
    { id: 'agent-runtime-failure', role: 'solver' }, { id: 'env-runtime-failure', goals: ['solve grid'] }, { timeoutMs: 5000 },
  );
  assert.match(failedRuntime.error, /runtime startup rejected/, 'startup errors propagate without waiting for timeout');
  evidenceModule.isolateEnvironment = originalIsolation;
  evidenceModule.artifactEvidence = originalArtifact;
  console.log('POET ignores stale terminal telemetry: PASS');
}

async function testPlaySandboxFlow() {
  const storePath = require.resolve('../src/services/workspaceSnapshotStore');
  const runPath = require.resolve('../src/services/workspaceSnapshotRun');
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: {
    capture: async () => ({ id: 'snap-play-1', snapshotHash: 'hash', metadata: { storagePath: '/snapshot' } }),
    readManifest: async () => ({}),
  } };
  require.cache[runPath] = { id: runPath, filename: runPath, loaded: true, exports: {
    runInSnapshot: async (input) => ({ exitCode: input.command === 'npm test' ? 0 : 1, stdout: 'solver supporte maze solving', stderr: '' }),
  } };
  const servicePath = require.resolve('../src/services/playService');
  delete require.cache[servicePath];
  const play = require(servicePath);
  const session = await play.runPlaySession('agent-play', {
    workspacePath: '/workspace', workspaceId: 'ws-1',
    inputs: [{ action: 'test', tool: 'solver', context: 'maze', command: 'npm test' }],
  });
  assert.equal(session.iterations[0].outcome, 'success');
  assert.equal(session.iterations[0].snapshotId, 'snap-play-1');
  assert.equal(session.dedupedDiscoveries[0].target, 'maze solving');
  const ncePlay = await require('../src/services/nceEngines').applyPlay({
    agentId: 'agent-play', workspacePath: '/workspace', existingCapabilities: ['solver'], explorationDomains: ['maze'],
  }, { playSandbox: { enabled: true, budget: 1 } }, null);
  assert.equal(ncePlay.iterations, 1, 'NCE Play engine routes through the sandbox session');
}

async function testPoetExecutionAndBridge() {
  const evidenceModule = require('../src/services/poetExecutionEvidence');
  const original = evidenceModule.isolateEnvironment;
  evidenceModule.isolateEnvironment = async () => { throw new Error('No durable artifact proof'); };
  delete require.cache[require.resolve('../src/services/poetExecutionEngine')];
  delete require.cache[require.resolve('../src/services/poetBridgeService')];
  try {
    const bridge = require('../src/services/poetBridgeService');
    const env = { id: 'env-e2e', difficulty: 0.3, stats: { attemptCount: 0, solvedCount: 0, bestScore: 0 } };
    const result = await bridge.coevolveWithExecution([{ id: 'agent-e2e', role: 'solver' }], [env], { timeoutMs: 1000 });
    assert.equal(result[0].evaluations[0].executionResult.success, false);
    assert.match(result[0].evaluations[0].executionResult.error, /durable artifact proof/);
    assert.equal(env.stats.solvedCount, 0);
  } finally { evidenceModule.isolateEnvironment = original; }
}

async function main() {
  await testCulturePhenotypeWithSQLite();
  await testPlayWithRealSnapshotRuntime();
  await testPlaySandboxFlow();
  await testPoetWithRealSnapshotVerification();
  await testPoetIgnoresStaleTerminalEvent();
  await testPoetExecutionAndBridge();
  console.log('NCE workflow end-to-end: Play sandbox and POET execution bridge passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
