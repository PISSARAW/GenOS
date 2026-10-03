const assert = require('node:assert/strict');
const { configuredExecutable, LOCAL_RUNTIME_PATH, CODEX_RUNTIME_PATH } = require('../src/services/agentRuntimeExecutable');
assert.equal(configuredExecutable({ localRuntime: true }), LOCAL_RUNTIME_PATH);
assert.equal(configuredExecutable({ executor: 'genos-local-runtime' }), LOCAL_RUNTIME_PATH);
assert.equal(configuredExecutable({ execution_mode: 'local' }), LOCAL_RUNTIME_PATH);
assert.equal(configuredExecutable({ executor: 'codex' }), CODEX_RUNTIME_PATH);

async function main() {
  const mission = 'Integrate symbiotic capabilities under a host authority.';
  const composition = await require('../src/services/biologicalTopologyService').composeMode({
    mode: 'holobionte', mission
  });
  assert.equal(composition.engines.host_orchestrator, 'cloud');
  assert.equal(composition.engines.specialist_symbiont, 'local');
  assert.equal(composition.engines.immune_symbiont, 'local');
  assert.equal(composition.engines.memory_symbiont, 'local');

  const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');
  const context = { orchestratorId: 'orch', request: {} };
  const parent = { workspace_root: '/tmp/ws' };
  const symbioteMember = composition.members.find((member) => member.role === 'specialist_symbiont');
  assert.equal(symbioteMember.workerKind, 'symbiotic_worker');
  const symbiote = workerLaunchPayload({ context, member: symbioteMember, workerId: 'w1', parent });
  assert.equal(symbiote.localRuntime, true);

  const host = composition.members.find((member) => member.role === 'host_orchestrator');
  assert.equal(host.executionMode, 'orchestrator');
  assert.equal(host.localRuntime, undefined);
}

main().then(() => console.log('Holobionte local engine checks: PASS'));
