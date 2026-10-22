'use strict';

const { createMorphogeneticController, DEFAULT_CONFIG, DEFAULT_TIMESCALE_CONFIG } = require('./morphogeneticController');
const { createTopologyAdapter, DEFAULT_FIDELITY_THRESHOLD, DEFAULT_LATENCY_BUDGET_MS } = require('./topologyAdapter');
const { createMorphologyMemory, DEFAULT_MEMORY_RETENTION_DAYS, DEFAULT_HALF_LIFE_MS, DEFAULT_MAX_ENTRIES } = require('./morphologyMemory');
const { createErrorEpidemiologist } = require('./errorEpidemiologist');
const firewallManager = require('./informationFirewallManager');

module.exports = {
  createMorphogeneticController,
  createTopologyAdapter,
  createMorphologyMemory,
  createErrorEpidemiologist,
  ...firewallManager,
  DEFAULT_CONFIG,
  DEFAULT_TIMESCALE_CONFIG,
  DEFAULT_FIDELITY_THRESHOLD,
  DEFAULT_LATENCY_BUDGET_MS,
  DEFAULT_MEMORY_RETENTION_DAYS,
  DEFAULT_HALF_LIFE_MS,
  DEFAULT_MAX_ENTRIES
};
