'use strict';

const { computeNovelty, computeDiversity, computePerformance, seededRandom } = require('./nceMetrics');

function loadEngines(config) {
  const engines = {};
  if (config.curiosity) engines.curiosity = require('../src/services/curiosityService');
  if (config.reprMutation) engines.reprMutation = require('../src/services/representationalMutationEngine');
  if (config.exaptation) engines.exaptation = require('../src/services/exaptationEngine');
  if (config.play) engines.play = require('../src/services/playService');
  if (config.phenotype) engines.phenotype = require('../src/services/phenotypicDevelopmentService');
  if (config.envCoev) engines.envCoev = require('../src/services/environmentGeneratorService');
  if (config.culture) {
    engines.culture = require('../src/services/culturalTransmissionService');
    engines.cultureSelection = require('../src/services/culturalSelectionService');
  }
  return engines;
}

function countSignals(engines, config) {
  let count = 0;
  if (engines.curiosity && config.curiosityDomains?.length > 0) {
    const result = engines.curiosity.computeCuriosity(config.curiosityDomains[0], {});
    if (result > 0.3) count++;
  }
  if (engines.reprMutation && config.knownConcepts?.length >= 2) count++;
  if (engines.exaptation && config.existingCapabilities?.length > 0) count++;
  return count;
}

async function runAblationExperiment(config, repetitions = 5) {
  const engines = loadEngines(config);
  const results = [];

  for (let i = 0; i < repetitions; i++) {
    const result = await simulateExperiment(engines, config, i);
    results.push(result);
  }

  return {
    config,
    engines: Object.keys(engines),
    results,
    metrics: {
      performance: computePerformance(results),
      novelty: computeNovelty(results[results.length - 1]?.solution || {}, 'baseline'),
      diversity: computeDiversity(results.map((r) => r.solution || {})),
    },
  };
}

async function simulateExperiment(engines, config, seed) {
  const random = seededRandom(seed);
  const signalCount = countSignals(engines, config);
  const noise = (random() - 0.5) * 0.1;
  const success = random() < 0.3 + signalCount * 0.05 + noise;

  return {
    success,
    quality: success ? 0.5 + signalCount * 0.1 : 0,
    engines: Object.keys(engines),
    domains: [config.domain || 'optimization'],
    solution: {
      description: success ? `Solution avec ${signalCount} signaux actifs` : 'Pas de solution',
      domains: [config.domain || 'optimization'],
    },
  };
}

module.exports = {
  loadEngines,
  countSignals,
  runAblationExperiment,
  simulateExperiment,
};
