'use strict';

/**
 * @file nceEngines.js
 * @description Moteurs NCE (curiosité, représentation, exaptation, environnement, culture).
 * Extrait de nceIntegrationService.js pour respecter la quality gate (complexité ≤10).
 */

const { selectCuriousDomain } = require('./curiosityExplorerService');
const { generateContextualRepresentations } = require('./representationalMutationEngine');
const { generateExaptations } = require('./exaptationEngine');
const { selectCulturalTraits } = require('./culturalSelectionService');
const { createEnvironmentPopulation } = require('./environmentGeneratorService');

async function applyCuriosity(mission, config) {
  if (!config.curiosity.enabled) return null;
  if (!mission.explorationDomains || mission.explorationDomains.length === 0) return null;
  const result = await selectCuriousDomain(
    mission.explorationDomains,
    { availableTokens: mission.budget?.tokens || 1000 },
    { weights: config.curiosity.weights }
  );
  // Pont NCE → Rust : écrit le signal dans le fichier bridge
  // pour que drives.rs puisse piloter Goal::Explore
  if (result?.curiosityScore > 0) {
    const { writeCuriosityHint } = require('./curiosityBridgeService');
    writeCuriosityHint(mission.explorationDomains, { weights: config.curiosity.weights })
      .catch(() => {}); // bridge non critique
  }
  return {
    selectedDomainId: result?.selectedDomainId || null,
    score: result?.curiosityScore || 0,
    ranking: result?.ranking || [],
  };
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

async function applyEnvCoev(mission, config) {
  if (!config.envCoev.enabled) return [];
  return createEnvironmentPopulation(3, ['creative_exploration', 'coordination_challenge']);
}

async function applyCulture(mission, config) {
  if (!config.culture.enabled) return [];
  return selectCulturalTraits(mission.culturalTraits || [], {}, 3);
}

async function applyPlay(mission, config, db) {
  if (!config.playSandbox.enabled) return null;
  if (!mission.workspacePath) return null;
  const { runPlaySession, generateCombinatorialInputs, DEFAULT_PLAY_BUDGET } = require('./playService');
  const tools = mission.existingCapabilities || [];
  const contexts = mission.explorationDomains || ['creative_exploration'];
  const inputs = generateCombinatorialInputs(
    tools.length ? tools : ['explore'],
    contexts.slice(0, 2)
  );
  const session = await runPlaySession(mission.agentId || 'agent', {
    db,
    workspacePath: mission.workspacePath,
    inputs: inputs.slice(0, Math.max(1, config.playSandbox.budget || DEFAULT_PLAY_BUDGET)),
    options: { budget: Math.max(1, config.playSandbox.budget || DEFAULT_PLAY_BUDGET) },
  });
  return {
    discoveries: session.dedupedDiscoveries || [],
    iterations: session.iterations.length,
  };
}

async function applyPhenotype(mission, config, db) {
  if (!config.phenotype.enabled) return null;
  const { developFromEnvironment } = require('./phenotypicDevelopmentService');
  const state = (mission.phenotypeState && typeof mission.phenotypeState === 'object')
    ? mission.phenotypeState
    : { branches: [], atrophies: [], history: [] };
  const environment = {
    requiredTools: mission.requiredTools || [],
    requiredCapabilities: mission.requiredCapabilities || [],
  };
  const actions = developFromEnvironment(state, environment);
  return {
    actions: actions.map((a) => ({ action: a.action, branchType: a.need })),
    branchCount: state.branches.length,
    atrophiedCount: state.atrophies.length,
  };
}

module.exports = {
  applyCuriosity,
  applyRepresentationalMutation,
  applyExaptation,
  applyEnvCoev,
  applyCulture,
  applyPlay,
  applyPhenotype,
};
