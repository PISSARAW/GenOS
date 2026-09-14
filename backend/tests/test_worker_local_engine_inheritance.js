const assert = require('node:assert/strict');
const { inheritedWorkerEngine } = require('../src/services/agentFleetWorkers');
const { configuredExecutable, LOCAL_RUNTIME_PATH, CODEX_RUNTIME_PATH } = require('../src/services/agentRuntimeExecutable');

assert.deepEqual(inheritedWorkerEngine(null), {});
assert.deepEqual(inheritedWorkerEngine({}), {});
assert.deepEqual(inheritedWorkerEngine({ localRuntime: true }), { localRuntime: true });
assert.deepEqual(inheritedWorkerEngine({ executor: 'local' }), { localRuntime: true });
assert.deepEqual(inheritedWorkerEngine({ runtime: 'LOCAL' }), { localRuntime: true });
assert.deepEqual(inheritedWorkerEngine({ executor: 'codex' }), {});
assert.deepEqual(inheritedWorkerEngine({ localRuntime: false }), {});

const localWorker = inheritedWorkerEngine({ localRuntime: true });
assert.equal(configuredExecutable({ ...localWorker }), LOCAL_RUNTIME_PATH);
const frontierWorker = {};
assert.equal(configuredExecutable({ ...frontierWorker }), CODEX_RUNTIME_PATH);
console.log('Autonomous workers inherit the orchestrator local engine.');
