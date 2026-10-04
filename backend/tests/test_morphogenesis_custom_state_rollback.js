'use strict';

const assert = require('node:assert/strict');
const { executeTransition } = require('../src/services/morphogenesis/transitionEngineService');
const { getState } = require('../src/services/collectiveStateService');

async function main() {
  const shared = getState();
  const custom = {
    ...shared,
    agents: new Map([['worker', { id: 'worker', role: 'old', capabilities: [], parent: null }]]),
    topologyState: { ...shared.topologyState },
    relationGraph: new Map(),
  };
  const receipt = await executeTransition({
    plan: { id: 'custom-state-rollback', actions: [
      { type: 'rebind', agentId: 'worker', targetRole: 'new' },
      { type: 'rebind', agentId: 'missing', targetRole: 'reviewer' },
    ] },
    collectiveState: custom,
  });
  assert.equal(receipt.committed, false);
  assert.equal(receipt.rollbackReceipt.memoryRestored, true);
  assert.equal(custom.agents.get('worker').role, 'old');
  assert.equal(shared.agents.has('worker'), false);
  console.log('custom collective state is restored after a failed transition: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
