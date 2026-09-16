const assert = require('node:assert/strict');
const { configuredExecutable, LOCAL_RUNTIME_PATH, CODEX_RUNTIME_PATH } = require('../src/services/agentRuntimeExecutable');
const holobionte = require('../src/services/holobionteCoordinationService');

assert.equal(configuredExecutable({ localRuntime: true }), LOCAL_RUNTIME_PATH);
assert.equal(configuredExecutable({ executor: 'genos-local-runtime' }), LOCAL_RUNTIME_PATH);
assert.equal(configuredExecutable({ execution_mode: 'local' }), LOCAL_RUNTIME_PATH);
assert.equal(configuredExecutable({ localRuntime: false }), CODEX_RUNTIME_PATH);

const composition = holobionte.composeHolobiont('Integrate symbiotic capabilities under a host authority.');
assert.equal(composition.engines.host_orchestrator, 'cloud');
assert.equal(composition.engines.specialist_symbiont, 'local');
assert.equal(composition.engines.immune_symbiont, 'local');
assert.equal(composition.engines.memory_symbiont, 'local');

const { workerLaunchPayload } = require('../bin/orchestratorActions.cjs');
const context = { orchestratorId: 'orch', request: {} };
const parent = { workspace_root: '/tmp/ws' };
const symbiote = workerLaunchPayload({ context, member: { mission: 'm', role: 'specialist_symbiont', modelTier: 'frontier', engine: 'local' }, workerId: 'w1', parent });
assert.equal(symbiote.localRuntime, true);
const host = workerLaunchPayload({ context, member: { mission: 'm', role: 'host_orchestrator', modelTier: 'frontier', engine: 'cloud' }, workerId: 'w0', parent });
assert.equal(host.localRuntime, undefined);

console.log('Holobionte local engine checks: PASS');
