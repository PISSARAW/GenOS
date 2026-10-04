'use strict';

const assert = require('node:assert/strict');
const { runProviderMetapopulation } = require('../src/services/epistemic/epistemicProviderMetapopulation');

async function main() {
  let calls = 0;
  const antigen = { id: 'claim-1', claim: 'bounded claim', epitopes: { evidence: { digest: 'sha256:evidence' } } };
  const profiles = [
    { provider: 'provider-a', model: 'model-a' }, { provider: 'provider-b', model: 'model-b' },
  ];
  const reviewed = (verdict) => ({ runner: async (populations) => {
    calls = populations.length;
    return populations.map((population) => ({ provider: population.provider, model: population.model,
      text: JSON.stringify({ claimId: antigen.id, evidenceDigest: 'sha256:evidence', verdict, rationale: 'checked independently' }) }));
  } });
  const result = await runProviderMetapopulation(antigen, profiles, reviewed('supports'));
  assert.equal(calls, 2);
  assert.equal(result.status, 'complete');
  assert.equal(result.verdict, 'supports');
  assert.equal(result.distinctProviders, 2);
  assert.equal(result.advisoryOnly, true);
  assert.ok(result.reviews.every((review) => review.responseDigest && !review.receipt));
  assert.equal(result.metapopulation.nativeResults, 2);
  assert.equal(result.metapopulation.convergence.convergenceCount, 1);

  const disputed = await runProviderMetapopulation(antigen, profiles, { runner: async (populations) =>
    populations.map((population, index) => ({ provider: population.provider, model: population.model,
      text: JSON.stringify({ claimId: antigen.id, evidenceDigest: 'sha256:evidence',
        verdict: index ? 'refutes' : 'supports', rationale: 'different assessment' }) })) });
  assert.equal(disputed.status, 'disputed');
  const unbound = await runProviderMetapopulation(antigen, profiles, { runner: async (populations) =>
    populations.map((population) => ({ provider: population.provider, text: 'unstructured notes' })) });
  assert.equal(unbound.status, 'incomplete');

  const unavailable = await runProviderMetapopulation({ id: 'claim-2' }, [{ provider: 'same', model: 'm1' }, { provider: 'same', model: 'm2' }]);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.advisoryOnly, true);
}

main().then(() => console.log('AEIS runtime integration checks passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
