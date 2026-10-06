'use strict';

function providerKey(item) { return String(item.provider || item.model || '').split('://')[0].toLowerCase(); }

function distinctConfiguredProviders(providers) {
  const seen = new Set();
  return (providers || []).filter((item) => {
    const key = providerKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function verifyAcrossProviders(input) {
  const providers = distinctConfiguredProviders(input.providers);
  const minimum = Math.max(2, Number(input.minimumProviders) || 2);
  if (providers.length < minimum) return { status: 'unavailable', independent: false, results: [], required: minimum };
  if (typeof input.runProvider !== 'function') return { status: 'unavailable', independent: false, results: [], required: minimum };
  const results = await Promise.all(providers.map((provider) => runProvider(input, provider)));
  const successful = results.filter((result) => result.status === 'completed');
  const independent = successful.length >= minimum && new Set(successful.map((r) => r.provider)).size >= minimum;
  const verdicts = new Set(successful.map((result) => result.verdict));
  const verdict = independent && successful.length === providers.length && verdicts.size === 1
    ? successful[0].verdict : 'uncertain';
  return { status: independent ? 'completed' : 'incomplete', independent, verdict, results, required: minimum };
}

async function runProvider(input, provider) {
  try {
    const response = await input.runProvider({ provider, claim: input.claim, evidence: input.evidence });
    if (!response || typeof response.assessment !== 'string') throw new Error('provider assessment missing');
    const verdict = ['supports', 'refutes', 'uncertain'].includes(response.verdict) ? response.verdict : 'uncertain';
    return { provider: providerKey(provider), model: provider.model || null, status: 'completed',
      verdict, assessment: response.assessment, counterexamples: response.counterexamples || [] };
  } catch (error) {
    return { provider: providerKey(provider), status: 'error', error: error.message };
  }
}

module.exports = { verifyAcrossProviders, distinctConfiguredProviders };
