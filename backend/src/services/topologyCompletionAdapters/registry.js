'use strict';

const pendingAdapter = require('./pendingAdapter');
const { closureInput } = require('./dossier');

const KNOWN_TOPOLOGIES = Object.freeze([
  'biocenose', 'trinity', 'a_team', 'rhizome', 'biome', 'holobionte', 'metapopulation'
]);

function validAdapter(adapter) {
  return adapter && typeof adapter.build === 'function';
}

function assertRegistration(topology, adapter) {
  if (typeof topology !== 'string' || !topology.trim()) {
    throw Object.assign(new Error('Topology completion adapter requires a topology.'), {
      code: 'TOPOLOGY_COMPLETION_ID_REQUIRED' });
  }
  if (!validAdapter(adapter)) {
    throw Object.assign(new Error(`Topology completion adapter '${topology}' requires build().`), {
      code: 'TOPOLOGY_COMPLETION_ADAPTER_INVALID' });
  }
}

function createRegistry(initial = {}) {
  const adapters = new Map(KNOWN_TOPOLOGIES.map((topology) =>
    [topology, pendingAdapter.create(topology)]));

  function register(topology, adapter) {
    assertRegistration(topology, adapter);
    adapters.set(topology, adapter);
    return adapter;
  }

  function resolve(topology) {
    return adapters.get(topology)
      || pendingAdapter.create(topology || 'unknown', 'topology_completion_adapter_unknown');
  }

  async function build(input = {}) {
    const dossier = await resolve(input.context?.mode).build(input);
    return closureInput(dossier);
  }

  for (const [topology, adapter] of Object.entries(initial)) register(topology, adapter);
  return Object.freeze({ build, register, resolve });
}

module.exports = { KNOWN_TOPOLOGIES, createRegistry };
