'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const dbEntry = path.resolve(__dirname, '../../src/db/index.js');
const originalLoad = Module._load;
let dbImportAttempts = 0;

Module._load = function blockDatabaseImport(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved === dbEntry) {
    dbImportAttempts += 1;
    throw new Error('Natural Search phase imports must not initialize the backend DB');
  }
  return originalLoad.apply(this, arguments);
};

async function main() {
  try {
    const { ActuatorModules } = require('../../src/services/search/actuatorModules');
    const { NaturalSearchActuator } = require('../../src/services/search/naturalSearchActuatorService');
    const modules = new ActuatorModules({ emit: () => {} });
    const actuator = new NaturalSearchActuator({ modules, ledger: modules.ledger });
    const receipt = await actuator.replayCausal({ agentId: 'isolated', events: [
      { action: 'inspect' }, { action: 'checkpoint', isCheckpoint: true }, { action: 'test' },
    ] });
    assert.equal(receipt.status, 'success');
    assert.equal(receipt.result.stateRestored, false);
    assert.equal(dbImportAttempts, 0, 'phase module import/replay must not load backend DB');
  } finally {
    Module._load = originalLoad;
  }
}

main().then(() => console.log('Natural Search phase imports and replay stay isolated from backend DB.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
