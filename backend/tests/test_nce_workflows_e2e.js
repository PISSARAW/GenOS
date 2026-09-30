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
    const artifact = { id: 'artifact-planning', agentId: 'teacher', content: { requiredCapabilities: ['planning'] } };
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
      return { artifact: { solution: 'verified grid path' } };
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
      stats: { attemptCount: 0, solvedCount: 0, bestScore: 0 },
    };
    const result = await bridge.coevolveWithExecution([{ id: 'agent-poet-real', role: 'solver' }], [environment], { timeoutMs: 10000 });
    const execution = result[0].evaluations[0].executionResult;
    assert.equal(execution.success, true);
    assert.match(execution.verification.output, /solver supporte maze solving/);
    assert.equal(environment.stats.solvedCount, 1);
    assert.equal(await fs.readFile(path.join(workspacePath, 'proof.txt'), 'utf8'), 'original');
    assert.ok(await sqlite.adapter.get('SELECT snapshot_hash FROM workspace_snapshots WHERE workspace_id = ?', 'ws-poet-real'));
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
  const execution = await require('../src/services/poetExecutionEngine').executeAgentOnEnvironment(
    { id: 'agent-stale', role: 'solver' },
    { id: 'env-stale', goals: ['solve grid'] },
    { timeoutMs: 20 },
  );
  assert.equal(execution.success, false);
  assert.match(execution.error, /TIMEOUT/);
  assert.equal(execution.verification, undefined, 'stale terminal rows cannot trigger snapshot verification');
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
  const runtimePath = require.resolve('../src/services/agentRuntimeAdapter');
  const telemetryPath = require.resolve('../src/services/telemetryObserver');
  const snapshotPath = require.resolve('../src/services/workspaceSnapshotStore');
  const runPath = require.resolve('../src/services/workspaceSnapshotRun');
  const dbPath = require.resolve('../src/db');
  const EventEmitter = require('node:events');
  const telemetry = new EventEmitter();
  require.cache[runtimePath] = { id: runtimePath, filename: runtimePath, loaded: true, exports: {
    startMission: async (mission) => {
      setImmediate(() => telemetry.emit('telemetry', { agentId: mission.agentId, eventType: 'AGENT_COMPLETED' }));
      return { artifact: { solution: 'verified grid path' } };
    },
  } };
  require.cache[telemetryPath] = { id: telemetryPath, filename: telemetryPath, loaded: true, exports: telemetry };
  require.cache[snapshotPath] = { id: snapshotPath, filename: snapshotPath, loaded: true, exports: {
    capture: async () => ({ id: 'snap-poet-1', snapshotHash: 'hash', metadata: { storagePath: '/snapshot' } }),
  } };
  require.cache[runPath] = { id: runPath, filename: runPath, loaded: true, exports: {
    runInSnapshot: async (input) => ({ exitCode: input.command === 'npm test' ? 0 : 1, stdout: 'verification passed' }),
  } };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    getDatabase: async () => ({}),
  } };
  delete require.cache[require.resolve('../src/services/poetExecutionEngine')];
  delete require.cache[require.resolve('../src/services/poetBridgeService')];
  const bridge = require('../src/services/poetBridgeService');
  const env = { id: 'env-e2e', difficulty: 0.3, workspacePath: '/workspace', workspaceId: 'ws-1', goals: ['solve grid'], stats: { attemptCount: 0, solvedCount: 0, bestScore: 0 } };
  const result = await bridge.coevolveWithExecution([{ id: 'agent-e2e', role: 'solver' }], [env], { timeoutMs: 1000 });
  assert.equal(result[0].evaluations[0].executionResult.success, true);
  assert.equal(result[0].evaluations[0].executionResult.verification.output, 'verification passed');
  assert.equal(env.stats.solvedCount, 1);
  assert.equal(env.stats.bestScore, 1);
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
