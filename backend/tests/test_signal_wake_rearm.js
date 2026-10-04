'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const registrations = [];
const originalLoad = Module._load;
Module._load = function loadWithWakeProbe(request, parent, isMain) {
  if (request === './signalPlaneSubscriber' && parent?.filename.endsWith('workerGarageService.js')) {
    return {
      registerWakeHandler: (agentId, handler, poll) => registrations.push({ agentId, handler, poll }),
      unregisterWakeHandler: () => {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const garage = require('../src/services/workerGarageService');
Module._load = originalLoad;

async function main() {
  const db = {
    all: async (sql) => {
      assert.match(sql, /status = 'idle'/);
      return [{ id: 'idle-1' }, { id: 'idle-2' }];
    }
  };
  assert.equal(await garage.rearmIdleWorkers(db), 2);
  assert.deepEqual(registrations.map((item) => item.agentId), ['idle-1', 'idle-2']);
  assert.ok(registrations.every((item) => item.poll === false));
  console.log('signal wake rearm passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
