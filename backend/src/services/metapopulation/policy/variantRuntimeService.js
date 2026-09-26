'use strict';

const lifecycle = require('./variantLifecycleActions');
const search = require('./variantSearchActions');
const flow = require('./variantFlowActions');

const VARIANT_RUNTIME_ACTIONS = Object.freeze([
  'classic_patch', 'island_search', 'heterogeneous_islands', 'source_sink', 'rescue_network',
  'stepping_stone', 'anti_synchrony', 'federated', 'ephemeral_patch', 'persistent', 'evolutionary', 'cultural'
]);

const VARIANT_PLANNERS = Object.freeze({
  classic_patch: lifecycle.classicPatchActions,
  island_search: search.islandSearchActions,
  heterogeneous_islands: flow.heterogeneousIslandsActions,
  source_sink: flow.sourceSinkActions,
  rescue_network: lifecycle.rescueNetworkActions,
  stepping_stone: flow.steppingStoneActions,
  anti_synchrony: flow.antiSynchronyActions,
  federated: flow.federatedActions,
  ephemeral_patch: lifecycle.ephemeralPatchActions,
  persistent: lifecycle.persistentActions,
  evolutionary: search.evolutionaryActions,
  cultural: flow.culturalActions
});

async function executeVariantActions(context) {
  const { variant, observed, input, options } = context;
  const planner = VARIANT_PLANNERS[variant];
  if (typeof planner !== 'function') return [];
  return planner(observed, input, options);
}

module.exports = { executeVariantActions, VARIANT_RUNTIME_ACTIONS };
