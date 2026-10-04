'use strict';

const assert = require('node:assert/strict');
const { executeTransition, verifyTransition } = require('../src/services/morphogenesis/transitionEngineService');
const { getState } = require('../src/services/collectiveStateService');

async function main() {
  const unsafe = await executeTransition({
    plan: { id: 'unsafe-partial-spawn', actions: [{ type: 'spawn', continueOnFailure: true }] },
    spawnAgent: async () => { throw new Error('unreachable'); },
    rollbackSpawnAgent: async () => {},
  });
  assert.equal(unsafe.committed, false);
  assert.match(unsafe.errors.join(' '), /continueOnFailure/);

  const failed = await executeTransition({
    plan: { id: 'failed-spawn', actions: [{ type: 'spawn' }] },
    spawnAgent: async () => { throw new Error('unreachable'); },
    rollbackSpawnAgent: async () => {},
  });
  assert.equal(failed.committed, false);
  assert.equal(failed.actionsTaken[0].status, 'failed');

  const state = getState();
  const verification = verifyTransition({
    plan: { actions: [{ type: 'spawn' }] }, postState: state,
    actionsTaken: [{ status: 'success', detail: { agentId: 'missing-worker' } }],
  });
  assert.equal(verification.verified, false);
  assert.match(verification.failures.join(' '), /missing-worker/);
  console.log('failed morphogenesis actions cannot commit: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
