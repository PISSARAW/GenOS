'use strict';

const assert = require('node:assert/strict');
// Le rollback mémoire est testé sans déclencher les sinks externes de télémétrie.
const events = [];
require('../src/services/telemetryObserver').emitEvent = event => { events.push(event); return event; };
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
  assert.equal(receipt.code, 'MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE');
  assert.equal(receipt.rollbackReceipt, null);
  assert.equal(custom.agents.get('worker').role, 'old');
  assert.equal(shared.agents.has('worker'), false);
  assert.ok(!events.some(event => event.eventType === 'MORPHOGENESIS_TRANSITION_ROLLBACK'));
  console.log('custom collective state remains unchanged after refused transition: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
