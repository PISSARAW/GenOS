'use strict';

/**
 * @file topologyNCEService.js
 * @description Injection NCE transversale aux topologies.
 */

const nceIntegration = require('./nceIntegrationService');
const { enhancePromptWithNCE } = require('./ncePromptService');

const TOPOLOGY_SIGNALS = {
  worker: { curiosity: true, exaptation: true },
  team: { curiosity: true, exaptation: true, representationalMutation: true, culture: true },
  trinity: { curiosity: true, exaptation: true, representationalMutation: true, culture: true, phenotype: true },
  biological: { curiosity: true, exaptation: true, phenotype: true, culture: true },
};

function getSignals(topology) {
  return TOPOLOGY_SIGNALS[topology] || TOPOLOGY_SIGNALS.worker;
}

function enrichWorkerPromptSync(prompt, options) {
  options = options || {};
  const signals = getSignals(options.topology || 'worker');
  const result = enhancePromptWithNCE(prompt, { ...options, signals });
  if (typeof result !== 'object' || result === null) {
    return prompt;
  }
  return typeof result.enhancedPrompt === 'string'
    ? result.enhancedPrompt
    : prompt;
}

function getField(request, camel, snake) {
  return request?.[camel] ?? request?.[snake];
}

function buildTopologyOptions(context, topology) {
  const request = context?.request || {};
  return {
    topology,
    role: topology + '_agent',
    db: context?.db,
    domain: getField(request, 'domain', 'problem_domain'),
    keywords: request.keywords || [],
    budget: request.execution_budget || request.executionBudget || {},
    explorationDomains: getField(request, 'explorationDomains', 'exploration_domains') || [],
    knownConcepts: getField(request, 'knownConcepts', 'known_concepts') || [],
    existingCapabilities: getField(request, 'existingCapabilities', 'existing_capabilities') || [],
    culturalTraits: getField(request, 'culturalTraits', 'cultural_traits') || [],
    nceOptions: getField(request, 'nceOptions', 'nce_options'),
  };
}

async function computeNCEForTopology(task, options) {
  options = options || {};
  const enhancements = await nceIntegration.enhanceMissionWithNCE({
    prompt: task,
    domain: options.domain,
    keywords: options.keywords,
    budget: options.budget,
    explorationDomains: options.explorationDomains,
    knownConcepts: options.knownConcepts,
    existingCapabilities: options.existingCapabilities,
    culturalTraits: options.culturalTraits,
    nceOptions: options.nceOptions,
  }, options.db);

  return {
    topology: options.topology || 'worker',
    domain: enhancements.domain,
    keywords: enhancements.keywords || [],
    curiosity: enhancements.curiosity,
    representations: enhancements.representations || [],
    exaptations: enhancements.exaptations || [],
    culturalTraits: enhancements.culturalTraits || [],
    environments: enhancements.environments || [],
  };
}

module.exports = {
  TOPOLOGY_SIGNALS,
  getSignals,
  enrichWorkerPromptSync,
  computeNCEForTopology,
  buildTopologyOptions,
};
