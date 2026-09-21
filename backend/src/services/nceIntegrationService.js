'use strict';

/**
 * @file nceIntegrationService.js
 * @description Intégration des 6 moteurs Natural Creative Ecology.
 * Signature simplifiée : enhanceMissionWithNCE(mission, db)
 */

const { applyCuriosity, applyRepresentationalMutation, applyExaptation, applyEnvCoev, applyCulture } = require('./nceEngines');

function createNCEConfig(options) {
  options = options || {};
  return {
    curiosity: { enabled: options.curiosity !== false, weights: options.curiosityWeights || {} },
    representationalMutation: { enabled: options.reprMutation !== false },
    exaptation: { enabled: options.exaptation !== false },
    playSandbox: { enabled: options.play !== false, budget: options.playBudget || 5 },
    phenotype: { enabled: options.phenotype !== false },
    envCoev: { enabled: options.envCoev !== false },
    culture: { enabled: options.culture !== false },
  };
}

async function safeExecute(fn) {
  try { return await fn(); } catch (e) { return null; }
}

async function enhanceMissionWithNCE(mission, db) {
  if (!mission) return {};
  const config = createNCEConfig(mission.nceOptions);

  const enhancements = { curiosity: null, representations: [], exaptations: [], environments: [], culturalTraits: [] };

  const c1 = await safeExecute(() => applyCuriosity(mission, config));
  if (c1) enhancements.curiosity = c1;

  const c2 = await safeExecute(() => applyRepresentationalMutation(mission, config, db));
  if (c2) enhancements.representations = c2;

  const c3 = await safeExecute(() => applyExaptation(mission, config, db));
  if (c3) enhancements.exaptations = c3;

  const c4 = await safeExecute(() => applyEnvCoev(mission));
  if (c4) enhancements.environments = c4;

  const c5 = await safeExecute(() => applyCulture(mission, config));
  if (c5) enhancements.culturalTraits = c5;

  return enhancements;
}

function hasResult(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

module.exports = {
  createNCEConfig,
  enhanceMissionWithNCE,
  hasResult,
};
