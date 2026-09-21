'use strict';

/**
 * @file nce_ablation_tests.js
 * @description PROTOTYPE de tests d'ablation NCE.
 *
 * ⚠️ Ce fichier est un prototype de harnais expérimental.
 * Il ne produit PAS de résultats scientifiquement valides.
 *
 * Pour des ablations valides, il faudrait exécuter GenOS sur de vrais problèmes.
 */

const { runAblationExperiment, loadEngines, simulateExperiment } = require('./nceAblationTests');

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
  return result;
}

async function testFullNCE() {
  console.log('\n=== FULL NCE (6 moteurs) ===');
  const config = {
    curiosity: true, reprMutation: true, exaptation: true,
    play: true, phenotype: true, envCoev: true, culture: true,
    domain: 'optimization', mission: BASELINE.mission,
    curiosityDomains: [{ domainId: 'learnable-puzzle', seenCount: 3, errorHistory: [0.9, 0.7, 0.5, 0.4, 0.3] }],
    knownConcepts: [{ id: 'ant-colony' }, { id: 'market-mechanism' }],
    existingCapabilities: [{ id: 'stigmergy-protocol' }],
  };
  const result = await runAblationExperiment(config);
  console.log('Performance:', result.metrics.performance.toFixed(3));
  return result;
}

async function testAblationMatrix() {
  console.log('\n=== MATRICE D\'ABLATION (prototype) ===');
  const experiments = [
    { name: 'Baseline', config: { domain: 'optimization', mission: BASELINE.mission } },
    { name: '+Curiosity', config: { curiosity: true, domain: 'optimization', mission: BASELINE.mission, curiosityDomains: [{ domainId: 'test', seenCount: 3 }] } },
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
    console.log(`${r.name.padEnd(13)} | ${String(r.engineCount).padEnd(7)} | ${r.performance.toFixed(3).padEnd(11)} | ${r.novelty.toFixed(3).padEnd(9)} | ${r.diversity.toFixed(3)}`);
  }
  return results;
}

async function main() {
  console.log('=== TESTS D\'ABLATION NCE (PROTOTYPE) ===');
  console.log('⚠️  Ce fichier est un prototype, pas un test scientifique.\n');
  await testBaseline();
  await testCuriosityOnly();
  await testFullNCE();
  await testAblationMatrix();
  console.log('\n=== TESTS TERMINÉS ===');
}

if (require.main === module) main().catch(console.error);

module.exports = { testBaseline, testCuriosityOnly, testFullNCE, testAblationMatrix };
