'use strict';

function topologyKey(value) {
  return String(value || '').toLowerCase().replace(/[- ]/g, '_');
}

function adapterKey(fromTopology, toTopology) {
  return `${topologyKey(fromTopology)}::${topologyKey(toTopology)}`;
}

function validateRegistration(input) {
  if (!input.id || !input.version || !input.fromTopology || !input.toTopology) {
    throw new Error('adapter id, version and topology endpoints are required');
  }
  if (typeof input.adapt !== 'function') throw new TypeError('adapter must provide an adapt function');
}

function createTopologyAdapterRegistry() {
  const adapters = new Map();
  return {
    register(input) {
      validateRegistration(input);
      const key = adapterKey(input.fromTopology, input.toTopology);
      if (adapters.has(key)) throw new Error(`adapter already registered for ${key}`);
      const entry = Object.freeze({
        id: input.id,
        version: input.version,
        fromTopology: topologyKey(input.fromTopology),
        toTopology: topologyKey(input.toTopology),
        evidenceStatus: input.evidenceStatus || 'conceptual',
        adapt: input.adapt
      });
      adapters.set(key, entry);
      return { ...entry };
    },
    get(fromTopology, toTopology) {
      return adapters.get(adapterKey(fromTopology, toTopology)) || null;
    },
    list() {
      return [...adapters.values()].map(({ adapt, ...descriptor }) => descriptor);
    }
  };
}

module.exports = { adapterKey, createTopologyAdapterRegistry, topologyKey };
