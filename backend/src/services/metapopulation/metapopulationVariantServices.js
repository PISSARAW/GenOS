'use strict';

/**
 * @file metapopulationVariantServices.js
 * @description Aggregates the twelve documented Metapopulation variant runtime
 * services (classic_patch, island_search, heterogeneous_islands, source_sink,
 * rescue_network, stepping_stone, anti_synchrony, federated, ephemeral_patch,
 * persistent, evolutionary, cultural) behind a single spreadable surface so
 * the coordination facade stays within size budgets.
 */
const classicPatchRuntimeService = require('./runtime/classicPatchRuntimeService');
const rescueNetworkRuntimeService = require('./runtime/rescueNetworkRuntimeService');
const ephemeralPatchRuntimeService = require('./runtime/ephemeralPatchRuntimeService');
const persistentRuntimeService = require('./runtime/persistentRuntimeService');
const heterogeneousIslandsRuntimeService = require('./migration/heterogeneousIslandsRuntimeService');
const steppingStoneRuntimeService = require('./migration/steppingStoneRuntimeService');
const sourceSinkRuntimeService = require('./migration/sourceSinkRuntimeService');
const culturalRuntimeService = require('./migration/culturalRuntimeService');
const islandSearchRuntimeService = require('./evolution/islandSearchRuntimeService');
const evolutionaryRuntimeService = require('./evolution/evolutionaryRuntimeService');
const antiSynchronyRuntimeService = require('./observability/antiSynchronyRuntimeService');
const federatedRuntimeService = require('./policy/federatedRuntimeService');

module.exports = {
  ...classicPatchRuntimeService,
  ...rescueNetworkRuntimeService,
  ...ephemeralPatchRuntimeService,
  ...persistentRuntimeService,
  ...heterogeneousIslandsRuntimeService,
  ...steppingStoneRuntimeService,
  ...sourceSinkRuntimeService,
  ...culturalRuntimeService,
  ...islandSearchRuntimeService,
  ...evolutionaryRuntimeService,
  ...antiSynchronyRuntimeService,
  ...federatedRuntimeService,
};
