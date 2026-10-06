'use strict';

const assert = require('node:assert/strict');
const { verifyAcrossProviders } = require('../src/services/epistemic/crossProviderVerificationService');

async function main() {
  const providers = [{ provider: 'openai', model: 'openai://a' }, { provider: 'anthropic', model: 'anthropic://b' }, { provider: 'openai', model: 'openai://c' }];
  const result = await verifyAcrossProviders({
    providers,
    claim: 'claim',
    runProvider: async ({ provider }) => ({ assessment: `checked by ${provider.provider}`, verdict: 'supports' }),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.results.length, 2);
  assert.equal(result.verdict, 'supports');
  const unavailable = await verifyAcrossProviders({ providers: providers.slice(0, 1), runProvider: async () => ({ assessment: 'ok' }) });
  assert.equal(unavailable.independent, false);
  const partial = await verifyAcrossProviders({
    providers: providers.slice(0, 2),
    runProvider: async ({ provider }) => provider.provider === 'openai' ? ({ assessment: 'ok' }) : Promise.reject(new Error('offline')),
  });
  assert.equal(partial.independent, false);
  console.log('AEIS cross-provider verification enforces distinct providers and quorum.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
