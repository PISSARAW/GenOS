'use strict';

const assert = require('node:assert/strict');
const { selectMembers } = require('../bin/topologyHandlers.cjs');
const parentEnsurer = require('../src/services/topology/parentEnsurer.cjs');
const orchestratorManager = require('../src/services/topology/orchestratorManager.cjs');

const members = [
  { role: 'host_orchestrator', executionMode: 'orchestrator', workerKind: null },
  { role: 'specialist_symbiont', executionMode: 'worker', workerKind: 'symbiotic_worker' },
  { role: 'immune_symbiont', executionMode: 'worker', workerKind: 'red_worker' },
  { role: 'memory_symbiont', executionMode: 'worker', workerKind: 'synthesis_worker' }
];

async function main() {
  assert.deepEqual(selectMembers(members, 3), members.slice(1));
  assert.throws(() => selectMembers(members, 2), { code: 'WORKER_GARAGE_FULL' });
  assert.deepEqual(selectMembers(members, 2, 2), members.slice(1, 3));
  assert.deepEqual(selectMembers([members[0]], 0), []);
  assert.equal(orchestratorManager.ensureParent, parentEnsurer.ensureParent);
  await assertRequestedWorkspaceBinding();
  await assert.rejects(parentEnsurer.replaceParent({
    run: async () => ({}), get: async () => null
  }, { task: 'test' }), /could not be persisted/);
  console.log('Topology orchestrator dispatch selection: PASS');
}

async function assertRequestedWorkspaceBinding() {
  const contracts = require('../src/services/strategyContractService.js');
  const binding = require('../src/services/orchestratorWorkspaceBindingService');
  const originalGet = contracts.getLatestContract, originalBind = binding.bind;
  const bound = [];
  contracts.getLatestContract = async () => ({});
  binding.bind = async input => bound.push(input);
  const parent = { id: 'parent', status: 'idle', workspace_id: 'old' };
  const db = { get: async () => parent };
  try {
    await orchestratorManager.ensureParent({ db, context: {
      orchestratorId: 'parent', task: 'test', action: 'orchestrate', request: { workspaceId: 'requested' }
    } });
    assert.equal(bound.length, 1);
    assert.equal(bound[0].workspaceId, 'requested');
  } finally {
    contracts.getLatestContract = originalGet;
    binding.bind = originalBind;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
