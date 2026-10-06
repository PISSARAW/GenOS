'use strict';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const policy = require('../src/services/biome/variants/variantPolicyService');

const environment = { opportunities: ['search', 'verify'].map(id => ({
  id, descriptor: id, evidenceRefs: ['test:' + id], opportunityScore: 0.8,
  requiredCapabilities: [id], resourceProfile: { tokens: { minimum: 1, preferred: 10, maximum: 100 } }
})) };
const special = {
  quality_diversity: { descriptor: [0.3, 0.8], quality: 0.8, strategy: 'diverse-search' },
  successional: { transition: true, productivity: 0.8, stability: 0.9 },
  adversarial: { attackerPopulationId: 'population:niche-search', defenderPopulationId: 'population:niche-verify',
    challenge: true, scenario: 'abstract evidence challenge' },
  knowledge: { sourceId: 'source-1', topic: 'research', provenance: ['source:one'], credibility: 0.9, freshness: 1 },
  compute: { providers: [{ id: 'cpu', location: 'local', resources: { tokens: 10 }, costUsd: 0.1 }],
    demand: { tokens: 1 } },
  open_ended: { allowGeneration: true, generatedEnvironments: [{ id: 'new',
    descriptor: 'new challenge', novelty: 0.8, utility: 0.7, cost: 0.1, evidenceRefs: ['test:challenge'] }] }
};

async function run() {
  for (const variant of policy.list()) {
    const runtime = await biome.BiomeRuntime.create('Cycle ' + variant, { variant, environment, maxTicks: 3 });
    const input = { individuals: [{ individualId: 'searcher', capabilities: ['search'] },
      { individualId: 'verifier', capabilities: ['verify'] }], evidenceRefs: ['test:variant'],
      resources: { tokens: 100 }, totalBudget: 100, ...special[variant] };
    const cycles = await runtime.run(input, 3);
    assert.equal(cycles.length, 3, variant);
    assert.equal(cycles.at(-1).stopCondition, 'max_ticks_reached', variant);
    const snapshot = await biome.sessionSnapshot(runtime.sessionId);
    assert.equal(snapshot.revision, 3, variant);
    assert.equal(snapshot.ecologicalState.runtime.history.length, 3, variant);
    assert.equal(snapshot.ecologicalState.runtime.budgetUsed, 0, variant);
    const balances = cycles.at(-1).measurements.resources;
    assert.equal(balances.balances.tokens + balances.recoveryReserve.tokens, 100, variant);
    if (variant === 'compute') assert.equal(cycles[0].action.status, 'requested');
  }
  console.log('All eleven Biome variants execute through persisted multi-tick cycles: PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
