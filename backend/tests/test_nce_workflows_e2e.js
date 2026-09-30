'use strict';

const assert = require('node:assert/strict');
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
    getDatabase: async () => { throw new Error('database polling disabled for isolated runtime test'); },
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
  await testPlaySandboxFlow();
  await testPoetExecutionAndBridge();
  console.log('NCE workflow end-to-end: Play sandbox and POET execution bridge passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
