'use strict';

/**
 * @file topologyNCEService.js
 * @description Injection NCE transversale aux topologies.
 */

const nceIntegration = require('./nceIntegrationService');
const { enhancePromptWithNCE } = require('./ncePromptService');

const TOPOLOGY_SIGNALS = {
  worker: { curiosity: true, exaptation: true, representationalMutation: false, culture: false, phenotype: false, play: false },
  team: { curiosity: true, exaptation: true, representationalMutation: true, culture: true, phenotype: false, play: false },
  trinity: { curiosity: true, exaptation: true, representationalMutation: true, culture: true, phenotype: true, play: false },
  biological: { curiosity: true, exaptation: true, representationalMutation: false, culture: true, phenotype: true, play: false },
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

function resolveWorkspacePath(request, context) {
  return getField(request, 'workspacePath', 'workspace_path') || context?.workspacePath;
}

function resolveWorkspaceId(request, context) {
  return getField(request, 'workspaceId', 'workspace_id') || context?.workspaceId;
}

function resolveAgentId(request, context) {
  return request.agentId || context?.agentId;
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
    ...buildExplorationOptions(request),
    ...buildPhenotypeOptions(request),
    workspacePath: resolveWorkspacePath(request, context),
    workspaceId: resolveWorkspaceId(request, context),
    agentId: resolveAgentId(request, context),
  };
}

function buildExplorationOptions(request) {
  return {
    explorationDomains: getField(request, 'explorationDomains', 'exploration_domains') || [],
    knownConcepts: getField(request, 'knownConcepts', 'known_concepts') || [],
    existingCapabilities: getField(request, 'existingCapabilities', 'existing_capabilities') || [],
    culturalTraits: getField(request, 'culturalTraits', 'cultural_traits') || [],
    culturalTransfer: request.culturalTransfer || request.cultural_transfer,
    nceOptions: getField(request, 'nceOptions', 'nce_options'),
  };
}

function buildPhenotypeOptions(request) {
  return {
    requiredTools: getField(request, 'requiredTools', 'required_tools') || [],
    requiredCapabilities: getField(request, 'requiredCapabilities', 'required_capabilities') || [],
    phenotypeState: request.phenotypeState || request.phenotype_state,
    initialPhenotype: request.initialPhenotype || request.initial_phenotype,
    genomeId: getField(request, 'genomeId', 'genome_id'),
    poet: getField(request, 'poet', 'poet'),
  };
}

async function computeNCEForTopology(task, options) {
  options = options || {};
  const topology = options.topology || 'worker';
  const keywords = options.keywords || [];
  const signals = getSignals(topology);
  const nceOptions = { ...options.nceOptions };
  for (const [key, enabled] of Object.entries(signals)) {
    if (enabled === false) nceOptions[key === 'representationalMutation' ? 'reprMutation' : key] = false;
  }
  try {
    const enhancements = await nceIntegration.enhanceMissionWithNCE({
      ...options, prompt: task, nceOptions,
    }, options.db);
    return { topology, domain: options.domain, keywords, ...enhancements };
  } catch (nceError) {
    return { topology, domain: options.domain, keywords,
      errors: { integration: nceError.message } };
  }
}

module.exports = {
  TOPOLOGY_SIGNALS,
  getSignals,
  enrichWorkerPromptSync,
  computeNCEForTopology,
  buildTopologyOptions,
};
