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
  if (!mission.explorationDomains || mission.explorationDomains.length === 0) return null;
  const result = await selectCuriousDomain(
    mission.explorationDomains,
    { availableTokens: mission.budget?.tokens || 1000 },
    { weights: config.curiosity.weights }
  );
  return {
    selectedDomainId: result?.selectedDomainId || null,
    score: result?.curiosityScore || 0,
    ranking: result?.ranking || [],
  };
}

async function applyRepresentationalMutation(mission, config, db) {
  if ((mission.knownConcepts || []).length < 2) return [];
  const result = await generateContextualRepresentations(
    { db },
    { problem: mission.prompt, domain: mission.domain, keywords: mission.keywords },
    { k: 1, representationTypes: ['hybrid', 'ecosystem'] }
  );
  return result.representations || [];
}

async function applyExaptation(mission, config, db) {
  const all = [];
  for (const cap of (mission.existingCapabilities || []).slice(0, 3)) {
    const result = await generateExaptations(cap, { db }, { limit: 3 });
    all.push(...(result.propositions || []));
  }
  return all;
}

async function applyEnvCoev(mission) {
  return createEnvironmentPopulation(3, ['creative_exploration', 'coordination_challenge']);
}

async function applyCulture(mission, config) {
  return selectCulturalTraits(mission.culturalTraits || [], {}, 3);
}

module.exports = {
  applyCuriosity,
  applyRepresentationalMutation,
  applyExaptation,
  applyEnvCoev,
  applyCulture,
};
