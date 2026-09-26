'use strict';

const { ControllerRegistry } = require('../controllers/registry');

const PLUGIN_TOPOLOGIES = Object.freeze(['trinity', 'a_team', 'rhizome', 'syncytium', 'biocenose']);
const UNSUPPORTED_TOPOLOGIES = Object.freeze(['biome', 'holobionte', 'metapopulation']);

function installTopologyPlugins(runtime) {
  const registry = new ControllerRegistry(runtime);
  for (const topology of PLUGIN_TOPOLOGIES) installOne(runtime, registry, topology);
  return { installed: [...PLUGIN_TOPOLOGIES], unsupported: [...UNSUPPORTED_TOPOLOGIES], registry };
}

function installOne(runtime, registry, topology) {
  runtime.registerTopology(topology, { topology, run: runWithController(registry, topology) });
}

function runWithController(registry, topology) {
  return async function run(args, context) {
    const node = nodeFrom(args, topology, context);
    const controller = registry.getController(topology, node);
    await controller.compose({ variant: args.variant });
    return controller.execute(inputFrom(context));
  };
}

function nodeFrom(args, topology, context) {
  return {
    nodeId: context.nodeId || topology,
    topology,
    variant: args.variant || null,
    workers: args.workers || [],
    budget: context.budget || {},
    health: null,
    state: context.state || {}
  };
}

function inputFrom(context) {
  if (context.input && typeof context.input === 'object') return context.input;
  return {};
}

module.exports = { PLUGIN_TOPOLOGIES, UNSUPPORTED_TOPOLOGIES, installTopologyPlugins };
