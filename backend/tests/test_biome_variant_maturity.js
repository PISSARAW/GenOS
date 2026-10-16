'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const policy = require('../src/services/biome/variants/variantPolicyService');
const runtime = require('../src/services/biome/variants/variantRuntimeService');
const operations = require('../src/services/biome/variants/variantSessionOperations');
const adversarial = require('../src/services/biome/variants/adversarialEcologyController');
const catalog = require('../src/services/morphogenesis/registry/variantCatalog');
const { rankAdaptiveTopologies } = require('../src/services/morphogenesis/adaptiveTopologyRanking');

function checkCatalog() {
  const entries = catalog.topologyVariants('biome');
  assert.equal(entries.length, 11);
  assert.deepEqual(entries.map((entry) => entry.variantId).sort(), policy.list().sort());
  for (const entry of entries) {
    assert.equal(entry.maturity, 'implemented', entry.variantId);
    assert.match(entry.source, /biome\/variants/);
  }
}

function checkRuntimeWiring() {
  assert.deepEqual([...runtime.SUPPORTED].sort(), policy.list().sort());
  for (const variant of policy.list()) {
    assert.equal(runtime.supports(variant), true, variant);
  }
  assert.equal(runtime.supports('unknown_variant'), false);
}

function checkRankingEligibility() {
  const candidates = policy.list().map((variant) => ({ candidateId: `biome:${variant}`,
    kind: 'VARIANT', topology: 'biome', variant, maturity: 'implemented',
    validation: { valid: true }, estimatedProblemFit: 0.9, confidence: 0.9,
    calibrationStatus: 'calibrated', estimatedTokens: 10, operationalFit: 0.8,
    requiredCapabilities: [], workerKinds: [] }));
  const ranking = rankAdaptiveTopologies({ budget: { tokens: 100 }, candidates });
  for (const variant of policy.list()) {
    const scored = ranking.candidates.find((item) => item.id === `biome:${variant}`);
    assert.ok(scored, variant);
    assert.equal(scored.proposalEligible, true, variant);
    assert.equal(scored.eligible, true, variant);
  }
}

function checkAllocationBudgets() {
  const session = { variantPolicy: { minimumAllocationRatio: 0.05, recoveryReserveRatio: 0.15, computeAware: true } };
  const populations = [
    { id: 'alpha', demand: 3, priority: 2, computeAvailability: 1 },
    { id: 'beta', demand: 1, priority: 1, computeAvailability: 0.5 }
  ];
  const settings = operations.allocationOptions(session, { totalBudget: 1000 }, populations.length);
  assert.equal(settings.requestedBudget, 1000);
  assert.equal(settings.recoveryReserveBudget, 150);
  assert.equal(settings.totalBudget, 850);
  assert.equal(settings.computeAware, true);
  assert.ok(settings.minimumPerPopulation > 0);
  const allocation = operations.allocateResources(populations, settings);
  assert.equal(allocation.conserved, true);
  assert.equal(allocation.totalBudget, 850);
  assert.ok(allocation.allocations.every((entry) => entry.budget >= settings.minimumPerPopulation));
  assert.throws(() => operations.allocateResources(populations,
    { totalBudget: 10, minimumPerPopulation: 6 }), { code: 'BIOME_ALLOCATION_INVALID' });
}

function checkHealthScales() {
  const session = { variantPolicy: { diversityTarget: 0.7, levels: ['individual', 'population', 'ecosystem'] } };
  session.ecology = { populations: [{ individuals: [{}, {}] }], niches: [{}, {}], resourcePool: { tokens: 5 } };
  const assessed = operations.healthAssessment(session, ['forage', 'allocate', 'forage']);
  assert.equal(assessed.qualityDiversity.target, 0.7);
  assert.equal(typeof assessed.qualityDiversity.met, 'boolean');
  assert.deepEqual(Object.keys(assessed.ecologicalScales).sort(), ['ecosystem', 'individual', 'population']);
  assert.equal(assessed.ecologicalScales.individual.count, 2);
}

function checkAdversarialBoundary() {
  assert.throws(() => adversarial.advance({}, {}, { attackerPopulationId: 'a',
    defenderPopulationId: 'b', payload: 'exploit-bytes' }), { code: 'BIOME_ADVERSARIAL_BOUNDARY' });
}

async function checkSimulatedHasNoEffect() {
  const session = await biome.composeBiome('maturity simulated check', { organization: 'energy_huddle' });
  const before = await biome.sessionSnapshot(session.sessionId);
  const receipt = await require('../src/services/biome/biomeMissionLoop').runBiomeMission(session.sessionId, {
    budget: 100, adapter: 'simulated', proposal: { patchHistory: [], cost: 10 },
    action: { populations: [{ id: 'alpha', demand: 1, priority: 1 }] }, observations: []
  }, {});
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.simulated, true);
  const after = await biome.sessionSnapshot(session.sessionId);
  assert.equal(after.revision, before.revision);
}

async function run() {
  checkCatalog();
  checkRuntimeWiring();
  checkRankingEligibility();
  checkAllocationBudgets();
  checkHealthScales();
  checkAdversarialBoundary();
  await checkSimulatedHasNoEffect();
  console.log('Biome variants maturity, ranking eligibility, budgets, health and simulation boundary: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
