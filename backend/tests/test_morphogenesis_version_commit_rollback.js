'use strict';

const assert = require('node:assert/strict');
const { executeTransition } = require('../src/services/morphogenesis/transitionEngineService');
const { executeVersionedTransition } = require('../src/services/morphogenesis/morphogenesisGitService');
const { getState } = require('../src/services/collectiveStateService');

async function main() {
  const shared = getState();
  const custom = {
    ...shared,
    agents: new Map([['worker', { id: 'worker', role: 'old', capabilities: [], parent: null }]]),
    topologyState: { ...shared.topologyState }, relationGraph: new Map(),
  };
  let persisted = false;
  const receipt = await executeTransition({
    plan: { id: 'git-failure', actions: [{ type: 'rebind', agentId: 'worker', targetRole: 'new' }] },
    collectiveState: custom,
    persistCommit: async () => { persisted = true; throw new Error('AgentGit unavailable'); },
  });
  assert.equal(receipt.committed, false);
  assert.equal(receipt.code, 'MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE');
  assert.equal(receipt.rollbackReceipt, null);
  assert.equal(custom.agents.get('worker').role, 'old');
  assert.equal(persisted, false, 'persistence cannot be invoked before authority preflight');

  const missingIdentity = await executeVersionedTransition({ plan: { id: 'no-agent', actions: [] } });
  assert.equal(missingIdentity.receipt.committed, false);
  assert.match(missingIdentity.receipt.errors.join(' '), /agentId/);
  console.log('ungoverned morphogenesis transition refuses before persistence: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
