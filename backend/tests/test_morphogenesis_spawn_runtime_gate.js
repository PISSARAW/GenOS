'use strict';

const assert = require('node:assert/strict');
const { executeTransition } = require('../src/services/morphogenesis/transitionEngineService');
const { getState } = require('../src/services/collectiveStateService');

async function main() {
  const state = getState();
  const before = new Set(state.agents.keys());
  const receipt = await executeTransition({
    plan: { id: 'spawn-without-runtime', actions: [{ type: 'spawn', agentId: 'unstarted-worker', role: 'worker' }] },
    collectiveState: state,
  });

  assert.equal(receipt.committed, false, 'a descriptor-only spawn cannot be committed');
  assert.equal(state.agents.has('unstarted-worker'), false, 'failed spawn cannot enter the active collective');
  assert.deepEqual(new Set(state.agents.keys()), before, 'failed spawn leaves collective membership unchanged');
  console.log('morphogenesis spawn requires a gated runtime adapter: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
