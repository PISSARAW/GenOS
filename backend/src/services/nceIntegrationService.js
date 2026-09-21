'use strict';

/**
 * @file nceIntegrationService.js
 * @description Intégration des 6 moteurs Natural Creative Ecology (NCE) dans l'orchestrateur GenOS natif.
 */

const { selectCuriousDomain } = require('./curiosityExplorerService');
const { generateContextualRepresentations } = require('./representationalMutationEngine');
const { generateExaptations } = require('./exaptationEngine');
const { createPlaySession, runPlaySession, generateCombinatorialInputs } = require('./playService');
const { createPhenotypeState, developFromEnvironment } = require('./phenotypicDevelopmentService');
const { createEnvironmentPopulation, coevolveGeneration, generateCurriculum } = require('./environmentGeneratorService');
const { createCulturalArtifact, simulateTransmission } = require('./culturalTransmissionService');
const { selectCulturalTraits } = require('./culturalSelectionService');

function createNCEConfig(options) {
  options = options || {};
  return {
    curiosity: { enabled: options.curiosity !== false, weights: options.curiosityWeights || {} },
    representationalMutation: { enabled: options.reprMutation !== false },
    exaptation: { enabled: options.exaptation !== false },
    playSandbox: { enabled: options.play !== false, budget: options.playBudget || 5 },
    phenotypicDevelopment: { enabled: options.phenotype !== false },
    environmentCoevolution: { enabled: options.envCoev !== false, populationSize: options.envPopulation || 8 },
    culturalTransmission: { enabled: options.culture !== false },
  };
}

async function enhanceMissionWithNCE(mission, db) {
  const config = createNCEConfig(mission.nceOptions);
  const enhancements = {
    curiousDomains: [],
    representations: [],
    exaptations: [],
    phenotypeState: null,
    environmentPopulation: [],
    culturalTraits: [],
  };

  try {
    enhancements.curiousDomains = await applyCuriosity(mission, config);
    enhancements.representations = await applyRepresentationalMutation(mission, config, db);
    enhancements.exaptations = await applyExaptation(mission, config, db);
    enhancements.phenotypeState = await applyPhenotypicDevelopment(mission, config);
    enhancements.environmentPopulation = await applyEnvironmentCoevolution(mission, config);
    enhancements.culturalTraits = await applyCulturalSelection(mission, config);
  } catch (err) {
    enhancements.error = err.message;
  }

  return enhancements;
}

async function applyCuriosity(mission, config) {
  if (!config.curiosity.enabled || !mission.explorationDomains) return [];
  return selectCuriousDomain(
    mission.explorationDomains,
    { availableTokens: mission.budget?.tokens || 1000 },
    { weights: config.curiosity.weights }
  );
}

async function applyRepresentationalMutation(mission, config, db) {
  if (!config.representationalMutation.enabled) return [];
  if ((mission.knownConcepts || []).length < 2) return [];
  const result = await generateContextualRepresentations(
    { db },
    { problem: mission.prompt, domain: mission.domain, keywords: mission.keywords },
    { k: 1, representationTypes: ['hybrid', 'ecosystem'] }
  );
  return result.representations || [];
}

async function applyExaptation(mission, config, db) {
  if (!config.exaptation.enabled) return [];
  const all = [];
  for (const cap of (mission.existingCapabilities || []).slice(0, 3)) {
    const result = await generateExaptations(cap, { db }, { limit: 3 });
    all.push(...(result.propositions || []));
  }
  return all;
}

async function applyPhenotypicDevelopment(mission, config) {
  if (!config.phenotypicDevelopment.enabled || !mission.genome) return null;
  const state = createPhenotypeState(mission.genome);
  if (mission.environment) developFromEnvironment(state, mission.environment);
  return state;
}

async function applyEnvironmentCoevolution(mission, config) {
  if (!config.environmentCoevolution.enabled) return [];
  return createEnvironmentPopulation(
    config.environmentCoevolution.populationSize,
    ['creative_exploration', 'coordination_challenge']
  );
}

async function applyCulturalSelection(mission, config) {
  if (!config.culturalTransmission.enabled || !mission.culturalTraits) return [];
  return selectCulturalTraits(mission.culturalTraits, { keywords: mission.keywords }, 5);
}

async function createPlaySessionForMission(opts) {
  opts = opts || {};
  const inputs = opts.mission?.playInputs || generateCombinatorialInputs(
    opts.mission?.availableTools || ['inspect', 'patch', 'test'],
    opts.mission?.availableContexts || ['src/', 'tests/', 'docs/'],
    'explore'
  );

  return runPlaySession(opts.agentId, {
    workspacePath: opts.workspacePath,
    inputs: inputs.slice(0, opts.budget || 5),
    options: { requireSandbox: true, timeoutMs: opts.timeoutMs || 30000 },
  });
}

module.exports = {
  createNCEConfig,
  enhanceMissionWithNCE,
  createPlaySessionForMission,
};
