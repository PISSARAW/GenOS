'use strict';

const { createVariant } = require('./variantSchema');
const { createTransferBundle } = require('../transitions/morphologyTransferBundle');

const TOPOLOGY_FIELDS = Object.freeze([
  'id', 'variants', 'compose', 'controller', 'observables',
  'constraints', 'exportBundle', 'importBundle',
  'transitionCapabilities', 'costModel', 'healthModel'
]);

function createTopologyDefinition(input = {}) {
  const topology = buildTopologyBase(input);
  addVariants(topology, input.variants);
  return topology;
}

function buildTopologyBase(input) {
  return {
    id: input.id,
    variants: new Map(),
    compose: input.compose || defaultCompose,
    controller: input.controller || defaultController,
    observables: input.observables || [],
    constraints: input.constraints || {},
    exportBundle: input.exportBundle || defaultExportBundle,
    importBundle: input.importBundle || defaultImportBundle,
    transitionCapabilities: input.transitionCapabilities || defaultTransitionCapabilities,
    costModel: input.costModel || defaultCostModel,
    healthModel: input.healthModel || defaultHealthModel
  };
}

function addVariants(topology, variants) {
  if (!variants) return;
  for (const [key, v] of Object.entries(variants)) topology.variants.set(key, createVariant({ ...v, variantId: key }));
}

function defaultCompose(config) { return { topology: this.id, variant: config.variant || 'default' }; }
function defaultController(node, runtime) { return { execute: async (input) => ({ output: input, state: {} }) }; }
function defaultExportBundle(node, context) { return createTransferBundle({ mission: context.missionId, scope: node.scope || 'mission', topologyId: this.id, variant: node.variant }); }
function defaultImportBundle(bundle, targetNode, context) { return { context, output: null, imported: true }; }
function defaultTransitionCapabilities() { return { variantChange: true, topologyChange: false, stateMigration: true, workerMigration: true }; }
function defaultCostModel() { return { baseTokens: 1000, perWorker: 500, variantMultiplier: 1.0 }; }
function defaultHealthModel() { return { checkInterval: 5000, thresholds: { cpu: 0.8, memory: 0.8, errorRate: 0.1 } }; }

module.exports = { TOPOLOGY_FIELDS, createTopologyDefinition };