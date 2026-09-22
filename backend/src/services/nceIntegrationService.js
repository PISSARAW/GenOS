'use strict';

/**
 * @file nceIntegrationService.js
 * @description Intégration des 6 moteurs Natural Creative Ecology.
 * Signature simplifiée : enhanceMissionWithNCE(mission, db)
 */

const { applyCuriosity, applyRepresentationalMutation, applyExaptation, applyEnvCoev, applyCulture, applyPlay, applyPhenotype } = require('./nceEngines');

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

  const enhancements = {
    curiosity: null,
    representations: [],
    exaptations: [],
    environments: [],
    culturalTraits: [],
    play: null,
    phenotype: null,
  };

  const engines = [
    { fn: () => applyCuriosity(mission, config), key: 'curiosity' },
    { fn: () => applyRepresentationalMutation(mission, config, db), key: 'representations' },
    { fn: () => applyExaptation(mission, config, db), key: 'exaptations' },
    { fn: () => applyEnvCoev(mission, config), key: 'environments' },
    { fn: () => applyCulture(mission, config), key: 'culturalTraits' },
    { fn: () => applyPlay(mission, config, db), key: 'play' },
    { fn: () => applyPhenotype(mission, config, db), key: 'phenotype' },
  ];

  for (const engine of engines) {
    const result = await safeExecute(engine.fn);
    if (hasResult(result)) {
      enhancements[engine.key] = result;
    }
  }

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
