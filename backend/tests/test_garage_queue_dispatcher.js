'use strict';

const assert = require('assert');
const dispatcher = require('../src/services/garageQueueDispatcher');

async function run() {
  const updates = [];
  const db = {
    get: async () => ({ request_id: 'queued-1', orchestrator_id: 'orch-1', worker_id: 'worker-1', request_json: JSON.stringify({ mission: 'resume mission', role: 'implementation' }) }),
    run: async () => ({ changes: 1 })
  };
  const fabric = require('../src/services/garageFabricService');
  const originalClaim = fabric.claimNextPersistent;
  const originalUpdate = fabric.updatePersistent;
  fabric.claimNextPersistent = async () => ({ request_id: 'queued-1', orchestrator_id: 'orch-1', worker_id: 'worker-1', leaseId: 'lease-1', request_json: JSON.stringify({ mission: 'resume mission', role: 'implementation' }) });
  fabric.updatePersistent = async (_db, input) => { updates.push(input); return true; };
  try {
    const result = await dispatcher.drainOne({
      db,
      orchestratorId: 'orch-1',
      reserveSlot: async () => ({ reserved: true }),
      startMission: async (mission) => ({ started: true, agentId: mission.agentId })
    });
    assert.equal(result.started, true);
    assert.equal(result.workerId, 'worker-1');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(updates[0].status, 'running');
    assert.equal(updates[1].status, 'completed');
  } finally {
    fabric.claimNextPersistent = originalClaim;
    fabric.updatePersistent = originalUpdate;
  }
  console.log('Garage queue dispatcher checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
