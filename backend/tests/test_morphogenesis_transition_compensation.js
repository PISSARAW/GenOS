'use strict';

const assert = require('node:assert/strict');
const { executeTransition } = require('../src/services/morphogenesis/transitionEngineService');
const { getState } = require('../src/services/collectiveStateService');

async function main() {
  const state = getState();
  const externalWorkers = new Set();
  const db = healthyClinicalDatabase();
  const receipt = await executeTransition({
    plan: {
      id: 'compensated-transition',
      actions: [
        { type: 'spawn', agentId: 'temporary-worker', role: 'critic' },
        { type: 'rebind', agentId: 'missing-worker', targetRole: 'reviewer' },
      ],
    },
    collectiveState: state,
    db,
    parent: { id: 'healthy-parent' },
    spawnAgent: async () => {
      externalWorkers.add('temporary-worker');
      return { started: true, agentId: 'temporary-worker', role: 'critic' };
    },
    rollbackSpawnAgent: async (_action, context) => externalWorkers.delete(context.actionResult.detail.agentId),
  });

  assert.equal(receipt.committed, false);
  assert.equal(receipt.code, 'MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE');
  assert.deepEqual(receipt.actionsTaken, [], 'no worker action starts before authority preflight');
  assert.equal(receipt.rollbackReceipt, null, 'no rollback is claimed when nothing ran');
  assert.equal(externalWorkers.has('temporary-worker'), false);
  assert.equal(getState(), state);
  assert.equal(state.agents.has('temporary-worker'), false);
  console.log('morphogenesis refuses before external worker effects: PASS');
}

function healthyClinicalDatabase() {
  const row = {
    id: 'clinical_parent', agent_id: 'healthy-parent',
    vitals_json: JSON.stringify({ cognitiveIntegrity: 1, stress: 0, energy: 1, budgetRatio: 1, dissonance: 0, apoptosisRisk: 0 }),
    immune_titer: 1, inflammatory_index: 0, cell_cycle_state: 'G0',
    plasmid_load: 0, pathogen_burden: 0, iatrogenic_load: 0, wellness_score: 1,
  };
  return {
    get: async (sql) => sql.includes('clinical_states') ? row : null,
    run: async () => ({}),
    all: async () => [],
  };
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
