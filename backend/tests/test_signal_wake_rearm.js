'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const registrations = [];
const unregistrations = [];
const consumed = [];
const originalLoad = Module._load;
Module._load = function loadWithWakeProbe(request, parent, isMain) {
  if (request === './signalPlaneSubscriber' && parent?.filename.endsWith('workerGarageService.js')) {
    return {
      registerWakeHandler: (agentId, handler, poll) => registrations.push({ agentId, handler, poll }),
      unregisterWakeHandler: (agentId) => unregistrations.push(agentId)
    };
  }
  if (request === './workerSignalConsumptionService' && parent?.filename.endsWith('workerGarageService.js')) {
    return { consume: async (workerId, signal) => {
      consumed.push({ workerId, signal });
      return { acted: true, action: 'signal_observed' };
    } };
  }
  if (request === './garageQueueDispatcher' && parent?.filename.endsWith('workerGarageService.js')) {
    return { drainOne: async () => null };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const garage = require('../src/services/workerGarageService');

async function main() {
  const db = {
    all: async (sql) => {
      assert.match(sql, /status = 'idle'/);
      return [{ id: 'idle-1' }, { id: 'idle-2' }];
    },
    run: async () => ({ changes: 1 })
  };
  assert.equal(await garage.rearmIdleWorkers(db), 2);
  assert.deepEqual(registrations.map((item) => item.agentId), ['idle-1', 'idle-2']);
  assert.ok(registrations.every((item) => item.poll === false));
  const released = await garage.releaseSlot(db, {
    orchestratorId: 'orchestrator-1', workerId: 'idle-3'
  });
  assert.equal(released, true);
  assert.ok(registrations.some((item) => item.agentId === 'idle-3'));
  assert.ok(!unregistrations.includes('idle-3'), 'release must preserve the idle wake handler');
  const registration = registrations.find((item) => item.agentId === 'idle-3');
  const outcome = await registration.handler({ signalId: 'sig-1', signalType: 'ligand',
    signalData: { semanticType: 'READY' }, llmRequired: false });
  assert.equal(outcome.acted, true);
  assert.equal(consumed.length, 1);
  assert.equal(unregistrations.at(-1), 'idle-3');
  console.log('signal wake rearm passed');
}

main().then(() => {
  Module._load = originalLoad;
}).catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
