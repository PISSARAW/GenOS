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
    explorationDomains: getField(request, 'explorationDomains', 'exploration_domains') || [],
    knownConcepts: getField(request, 'knownConcepts', 'known_concepts') || [],
    existingCapabilities: getField(request, 'existingCapabilities', 'existing_capabilities') || [],
    culturalTraits: getField(request, 'culturalTraits', 'cultural_traits') || [],
    nceOptions: getField(request, 'nceOptions', 'nce_options'),
    workspacePath: resolveWorkspacePath(request, context),
    workspaceId: resolveWorkspaceId(request, context),
    agentId: resolveAgentId(request, context),
  };
}

async function computeNCEForTopology(task, options) {
  options = options || {};
  let enhancements = {};
  try {
    enhancements = await nceIntegration.enhanceMissionWithNCE({
      prompt: task,
      domain: options.domain,
      keywords: options.keywords,
      budget: options.budget,
      explorationDomains: options.explorationDomains,
      knownConcepts: options.knownConcepts,
      existingCapabilities: options.existingCapabilities,
      culturalTraits: options.culturalTraits,
      nceOptions: options.nceOptions,
      workspacePath: options.workspacePath,
      workspaceId: options.workspaceId,
      agentId: options.agentId,
    }, options.db);
  } catch (nceError) {
    enhancements = { error: nceError.message };
  }

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
