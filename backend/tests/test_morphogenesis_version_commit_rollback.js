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
  const receipt = await executeTransition({
    plan: { id: 'git-failure', actions: [{ type: 'rebind', agentId: 'worker', targetRole: 'new' }] },
    collectiveState: custom,
    persistCommit: async () => { throw new Error('AgentGit unavailable'); },
  });
  assert.equal(receipt.committed, false);
  assert.equal(receipt.rollbackReceipt.memoryRestored, true);
  assert.equal(custom.agents.get('worker').role, 'old');
  assert.match(receipt.rollbackReceipt.triggeredBy, /AgentGit unavailable/);

  const missingIdentity = await executeVersionedTransition({ plan: { id: 'no-agent', actions: [] } });
  assert.equal(missingIdentity.receipt.committed, false);
  assert.match(missingIdentity.receipt.errors.join(' '), /agentId/);
  console.log('failed AgentGit persistence rolls back the transition: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
