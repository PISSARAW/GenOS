'use strict';

const states = new Map();

function get(options) {
  return states.get(options?.agentId) || { bindings: [], posterior: [], lastFrameId: null, cycle: 0 };
}

function save(options) {
  const { agentId, state } = options || {};
  if (!agentId || !state) return { saved: false };
  states.set(agentId, state);
  return { saved: true, state };
}

function clear(options) {
  if (options?.agentId) states.delete(options.agentId);
  else states.clear();
}

module.exports = { get, save, clear };
