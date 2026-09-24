'use strict';

const { createStateController } = require('./stateController');
const { createRepairController } = require('./repairController');
const { createMaterializationController } = require('./materializationController');
const { createSyncytiumTick } = require('./syncytiumTick');

function createSyncytiumRuntime(syncytium, options = {}) {
  const stateController = createStateController(syncytium);
  const repairController = createRepairController(syncytium);
  const materializationController = createMaterializationController(syncytium);
  const tick = createSyncytiumTick({
    syncytium, stateController, repairController, materializationController, options
  });
  return {
    mode: 'EVENT_DRIVEN',
    receive: (sessionId, event) => tick.processEvent(sessionId, event),
    inspect: (sessionId, inspectOptions) => repairController.inspect(sessionId, inspectOptions || {}),
    repair: (sessionId, request) => repairController.repair(sessionId, request || {}),
    materialize: (sessionId, materializeOptions) => materializationController.materialize(sessionId, materializeOptions || {}),
    compact: (sessionId, compactOptions) => materializationController.compact(sessionId, compactOptions || {})
  };
}

module.exports = { createSyncytiumRuntime };
