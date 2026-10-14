'use strict';

const preferredByOrchestrator = new Map();

function clear(orchestratorId) {
  preferredByOrchestrator.delete(orchestratorId);
}

function get(orchestratorId) {
  return preferredByOrchestrator.get(orchestratorId) || [];
}

function set(orchestratorId, preferred) {
  preferredByOrchestrator.set(orchestratorId, preferred);
}

module.exports = { clear, get, set };
