'use strict';
const { PROPAGULE_TYPES } = require('../constants');

const adapters = new Map();

function registerAdapter(type, adapter) {
  if (!PROPAGULE_TYPES.includes(type) || !adapter || typeof adapter.validate !== 'function' || typeof adapter.assimilate !== 'function') {
    throw Object.assign(new Error('A supported propagule type and validate/assimilate adapter are required.'), { code: 'METAPOPULATION_ADAPTER_INVALID' });
  }
  if (adapters.has(type)) throw Object.assign(new Error('An adapter is already registered for this propagule type.'), { code: 'METAPOPULATION_ADAPTER_CONFLICT' });
  adapters.set(type, adapter);
  return { type, registered: true };
}

function resolveAdapter(type) {
  return adapters.get(type) || null;
}

function clearAdapter(type) {
  return adapters.delete(type);
}

module.exports = { registerAdapter, resolveAdapter, clearAdapter };
