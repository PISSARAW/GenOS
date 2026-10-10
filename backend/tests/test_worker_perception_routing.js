'use strict';

const assert = require('node:assert/strict');
const { isInProcessWorker } = require('../src/services/agentRuntimeAdapter/missionLease');
const { LOCAL_RUNTIME_PATH } = require('../src/services/agentRuntimeExecutable');

const worker = { execution_mode: 'worker' };
const localMission = { executor: 'local', localRuntime: true, localModel: 'ollama://example' };

assert.equal(isInProcessWorker(worker, localMission, LOCAL_RUNTIME_PATH), true);
assert.equal(isInProcessWorker(worker, { ...localMission, continuousExecution: { mode: 'off' } }, LOCAL_RUNTIME_PATH), true);
for (const mode of ['observe', 'control']) {
  assert.equal(isInProcessWorker(worker, { ...localMission, continuousExecution: { mode } }, LOCAL_RUNTIME_PATH), false);
}

console.log('Worker continuous observation routing: PASS');
