'use strict';

/**
 * @file nceAblationTests.js
 * @description Harcèlement expérimental NCE — PROTOTYPE.
 *
 * ⚠️ Ce fichier est un prototype de harnais expérimental.
 * Il ne produit PAS de résultats scientifiquement valides.
 *
 * Pour des ablations valides, il faudrait :
 * - Exécuter GenOS sur de vrais problèmes (TSP, etc.)
 * - Comparer les sorties réelles avec un vérificateur indépendant
 * - Utiliser le même seed, modèle, budget, permissions
 * - Répéter avec intervalles de confiance
 * - Tester les interactions (plan factoriel 2^6 = 64 configurations)
 *
 * Ce que fait actuellement ce prototype :
 * - Charge les vrais moteurs NCE
 * - Leur sortie influence un score simulé
 * - Permet de détecter des régressions majeures
 * - Ne permet PAS de conclure que NCE améliore la créativité
 *
 * @see docs/01-concepts/natural-creative-ecology.md (section 12)
 */

// ─── Métriques ──────────────────────────────────────────────────────

function computeNovelty(solution, baseline) {
  const solStr = typeof solution === 'string' ? solution : JSON.stringify(solution);
  const baseStr = typeof baseline === 'string' ? baseline : JSON.stringify(baseline);
  const distance = levenshteinDistance(solStr, baseStr);
  const maxLen = Math.max(solStr.length, baseStr.length, 1);
  return Math.min(1, distance / maxLen);
}

function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function computeDiversity(solutions) {
  const unique = new Set(solutions.map((s) => JSON.stringify(s))).size;
  return solutions.length > 0 ? unique / solutions.length : 0;
}

function computePerformance(results) {
  const successes = results.filter((r) => r.success);
  const qualitySum = successes.reduce((sum, r) => sum + (r.quality ?? 0.5), 0);
  return results.length > 0 ? qualitySum / results.length : 0;
}

// ─── Chargement des moteurs ─────────────────────────────────────────

function loadEngines(config) {
  const engines = {};
  if (config.curiosity) {
    engines.curiosity = require('../src/services/curiosityService');
  }
  if (config.reprMutation) {
    engines.reprMutation = require('../src/services/representationalMutationEngine');
  }
  if (config.exaptation) {
    engines.exaptation = require('../src/services/exaptationEngine');
  }
  if (config.play) {
    engines.play = require('../src/services/playService');
  }
  if (config.phenotype) {
    engines.phenotype = require('../src/services/phenotypicDevelopmentService');
  }
  if (config.envCoev) {
    engines.envCoev = require('../src/services/environmentGeneratorService');
  }
  if (config.culture) {
    engines.culture = require('../src/services/culturalTransmissionService');
    engines.cultureSelection = require('../src/services/culturalSelectionService');
  }
  return engines;
}

// ─── Prototype d'ablation (simulation, pas expérience réelle) ───────

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

/**
 * Simulation : les vrais moteurs sont chargés et leur sortie influence
 * le résultat, mais c'est une PAS une expérience réelle.
 */
async function simulateExperiment(engines, config, seed) {
  const random = seededRandom(seed);
  let signalCount = 0;

  // Curiosité
  if (engines.curiosity && config.curiosityDomains && config.curiosityDomains.length > 0) {
    const result = engines.curiosity.computeCuriosity(config.curiosityDomains[0], {});
    if (result > 0.3) signalCount++;
  }

  // Représentation
  if (engines.reprMutation && config.knownConcepts && config.knownConcepts.length >= 2) {
    const result = await engines.reprMutation.generateRepresentations(
      { problem: config.mission, keywords: config.keywords || [] },
      config.knownConcepts,
      { k: 1 }
    );
    if (result.representations && result.representations.length > 0) signalCount++;
  }

  // Exaptation
  if (engines.exaptation && config.existingCapabilities) {
    const result = await engines.exaptation.generateExaptations(
      config.existingCapabilities[0],
      {},
      { limit: 3 }
    );
    if (result.propositions && result.propositions.length > 0) signalCount++;
  }

  // Les autres moteurs (play, phenotype, envCoev, culture) sont chargés
  // mais n'influencent pas encore le score dans ce prototype

  const noise = (random() - 0.5) * 0.1;
  const success = random() < 0.3 + signalCount * 0.05 + noise;

  return {
    success,
    quality: success ? 0.5 + signalCount * 0.1 : 0,
    engines: Object.keys(engines),
    domains: [config.domain || 'optimization'],
    solution: {
      description: success
        ? `Solution avec ${signalCount} signaux actifs`
        : 'Pas de solution',
      domains: [config.domain || 'optimization'],
    },
  };
}

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

const BASELINE = {
  mission: 'Résoudre le puzzle du voyageur de commerce pour 8 villes',
  domain: 'optimization',
};

async function testBaseline() {
  console.log('\n=== BASELINE (sans NCE) ===');
  const config = { domain: 'optimization', mission: BASELINE.mission };
  const result = await runAblationExperiment(config);
  console.log('Performance:', result.metrics.performance.toFixed(3));
  console.log('Nouveauté:', result.metrics.novelty.toFixed(3));
  console.log('Diversité:', result.metrics.diversity.toFixed(3));
  return result;
}

async function testCuriosityOnly() {
  console.log('\n=== + CURIOSITÉ ===');
  const config = {
    curiosity: true,
    domain: 'optimization',
    mission: BASELINE.mission,
    curiosityDomains: [
      { domainId: 'learnable-puzzle', seenCount: 3, errorHistory: [0.9, 0.7, 0.5, 0.4, 0.3] },
      { domainId: 'noisy-tv', seenCount: 2, errorHistory: [0.9, 0.95, 0.9, 0.98, 0.92] },
    ],
  };
  const result = await runAblationExperiment(config);
  console.log('Performance:', result.metrics.performance.toFixed(3));
  console.log('Nouveauté:', result.metrics.novelty.toFixed(3));
  console.log('Diversité:', result.metrics.diversity.toFixed(3));
  return result;
}

async function testFullNCE() {
  console.log('\n=== FULL NCE (6 moteurs) ===');
  const config = {
    curiosity: true,
    reprMutation: true,
    exaptation: true,
    play: true,
    phenotype: true,
    envCoev: true,
    culture: true,
    domain: 'optimization',
    mission: BASELINE.mission,
    curiosityDomains: [
      { domainId: 'learnable-puzzle', seenCount: 3, errorHistory: [0.9, 0.7, 0.5, 0.4, 0.3] },
    ],
    knownConcepts: [
      { id: 'ant-colony', name: 'Stigmergie', metadata: { category: 'coordination' } },
      { id: 'market-mechanism', name: 'Marché', metadata: { category: 'economics' } },
    ],
    existingCapabilities: [
      { id: 'stigmergy-protocol', origin_context: 'optimisation de colonies artificielles', tools: ['pheromone_deposit'] },
    ],
  };
  const result = await runAblationExperiment(config);
  console.log('Performance:', result.metrics.performance.toFixed(3));
  console.log('Nouveauté:', result.metrics.novelty.toFixed(3));
  console.log('Diversité:', result.metrics.diversity.toFixed(3));
  return result;
}

async function testAblationMatrix() {
  console.log('\n=== MATRICE D\'ABLATION (prototype) ===');
  const experiments = [
    { name: 'Baseline', config: { domain: 'optimization', mission: BASELINE.mission } },
    { name: '+Curiosity', config: { curiosity: true, domain: 'optimization', mission: BASELINE.mission, curiosityDomains: [{ domainId: 'test', seenCount: 3, errorHistory: [0.9, 0.7, 0.5] }] } },
    { name: '+Repr', config: { reprMutation: true, domain: 'optimization', mission: BASELINE.mission, knownConcepts: [{ id: 'a' }, { id: 'b' }] } },
    { name: '+Expat', config: { exaptation: true, domain: 'optimization', mission: BASELINE.mission, existingCapabilities: [{ id: 'cap1' }] } },
    { name: 'FULL NCE', config: { curiosity: true, reprMutation: true, exaptation: true, play: true, phenotype: true, envCoev: true, culture: true, domain: 'optimization', mission: BASELINE.mission, curiosityDomains: [{ domainId: 'test' }], knownConcepts: [{ id: 'a' }, { id: 'b' }], existingCapabilities: [{ id: 'cap1' }] } },
  ];

  const results = [];
  for (const exp of experiments) {
    const result = await runAblationExperiment(exp.config);
    results.push({ name: exp.name, ...result.metrics, engineCount: result.engines.length });
  }

  console.log('\nConfiguration | Engines | Performance | Nouveauté | Diversité');
  console.log('--------------|---------|-------------|-----------|----------');
  for (const r of results) {
    console.log(
      `${r.name.padEnd(13)} | ${String(r.engineCount).padEnd(7)} | ${r.performance.toFixed(3).padEnd(11)} | ${r.novelty.toFixed(3).padEnd(9)} | ${r.diversity.toFixed(3)}`
    );
  }

  return results;
}

async function main() {
  console.log('=== TESTS D\'ABLATION NCE (PROTOTYPE) ===');
  console.log('⚠️  Ce fichier est un prototype de harnais expérimental.');
  console.log('   Il ne produit PAS de résultats scientifiquement valides.');
  console.log('   Pour des ablations valides, exécuter GenOS sur de vrais problèmes.\n');

  await testBaseline();
  await testCuriosityOnly();
  await testFullNCE();
  await testAblationMatrix();

  console.log('\n=== TESTS TERMINÉS ===');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runAblationExperiment,
  testAblationMatrix,
  computeNovelty,
  computeDiversity,
  computePerformance,
  seededRandom,
};
