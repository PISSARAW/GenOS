'use strict';

const assert = require('node:assert/strict');
const { runProviderMetapopulation } = require('../src/services/epistemic/epistemicProviderMetapopulation');

async function main() {
  let calls = 0;
  const result = await runProviderMetapopulation({ id: 'claim-1', claim: 'bounded claim' }, [
    { provider: 'provider-a', model: 'model-a' }, { provider: 'provider-b', model: 'model-b' },
  ], { runner: async (populations) => {
    calls = populations.length;
    return populations.map((population) => ({ provider: population.provider, model: population.model, text: `review:${population.provider}` }));
  } });
  assert.equal(calls, 2);
  assert.equal(result.status, 'complete');
  assert.equal(result.distinctProviders, 2);
  assert.equal(result.advisoryOnly, true);
  assert.ok(result.reviews.every((review) => review.responseDigest && !review.receipt));
  assert.equal(result.metapopulation.nativeResults, 2);

  const unavailable = await runProviderMetapopulation({ id: 'claim-2' }, [{ provider: 'same', model: 'm1' }, { provider: 'same', model: 'm2' }]);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.advisoryOnly, true);
}

main().then(() => console.log('AEIS runtime integration checks passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
