'use strict';

const { createMorphogeneticController, DEFAULT_CONFIG } = require('./morphogeneticController');
const { createTopologyAdapter, DEFAULT_FIDELITY_THRESHOLD, DEFAULT_LATENCY_BUDGET_MS } = require('./topologyAdapter');
const { createMorphologyMemory } = require('./morphologyMemory');
const { createErrorEpidemiologist } = require('./errorEpidemiologist');
const firewallManager = require('./informationFirewallManager');

module.exports = {
  createMorphogeneticController,
  createTopologyAdapter,
  createMorphologyMemory,
  createErrorEpidemiologist,
  ...firewallManager,
  DEFAULT_CONFIG,
  DEFAULT_FIDELITY_THRESHOLD,
  DEFAULT_LATENCY_BUDGET_MS
};
