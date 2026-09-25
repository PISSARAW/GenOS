'use strict';

const { DEFINITIONS } = require('../registry/topologyRegistry');
const { createTopologyAdapterRegistry, topologyKey } = require('./topologyAdapterRegistry');
const { adaptTrinityToATeam } = require('./topologyOutputAdapter');

const registry = createTopologyAdapterRegistry();
registry.register({
  id: 'trinity-to-a-team-verified-claims',
  version: '1.0.0',
  fromTopology: 'trinity',
  toTopology: 'a_team',
  evidenceStatus: 'tested',
  adapt: adaptTrinityToATeam
});

function invalidEndpoints(from, to) {
  return !DEFINITIONS[from] || !DEFINITIONS[to];
}

function adaptTopologyTransition(input = {}) {
  const fromTopology = topologyKey(input.fromTopology);
  const toTopology = topologyKey(input.toTopology);
  if (invalidEndpoints(fromTopology, toTopology)) {
    return { supported: false, reason: 'unknown_topology', fromTopology, toTopology };
  }
  if (fromTopology === toTopology) return { supported: true, adapted: false, payload: input.payload || null };
  const adapter = registry.get(fromTopology, toTopology);
  if (!adapter) return { supported: false, reason: 'adapter_required', fromTopology, toTopology };
  const payload = adapter.adapt(input.payload || {});
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { supported: false, reason: 'adapter_output_invalid', fromTopology, toTopology };
  }
  return {
    supported: true,
    adapted: true,
    payload,
    receipt: {
      adapterId: adapter.id,
      adapterVersion: adapter.version,
      evidenceStatus: adapter.evidenceStatus,
      fromTopology,
      toTopology
    }
  };
}

module.exports = { adaptTopologyTransition, registry };
