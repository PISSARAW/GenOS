'use strict';

const crypto = require('node:crypto');
const populationService = require('./epistemicMetapopulationService');
const processRunner = require('./processIsolatedMetapopulationRunner');

async function runProviderMetapopulation(antigen, profiles, options = {}) {
  const distinct = distinctProfiles(profiles);
  const populations = distinct.map((profile) => populationService.createPopulation({
    id: `aeis:${antigen.id}:${profile.provider}`, provider: profile.provider,
    niche: 'independent-review', strategy: ['independent-claim-review'], isolation: true
  }));
  if (populations.length < 2) return unavailable(populations, 'two configured providers are required');
  const inputs = distinct.map((profile) => ({ ...profile, prompt: reviewPrompt(antigen),
    timeoutMs: options.timeoutMs || 30000, maxTokens: options.maxTokens || 400 }));
  const runner = options.runner || processRunner.runIsolatedPopulations;
  const outputs = await runner(inputs);
  const reviews = outputs.map((output, index) => recordProviderOutput(populations[index], output));
  const successful = reviews.filter((review) => review.status === 'completed');
  return {
    status: successful.length >= 2 ? 'complete' : 'incomplete',
    advisoryOnly: true,
    distinctProviders: new Set(successful.map((review) => review.provider)).size,
    reviews,
    metapopulation: populationService.metapopulationReport(populations),
  };
}

function distinctProfiles(profiles) {
  const seen = new Set();
  return (Array.isArray(profiles) ? profiles : []).filter((profile) => {
    if (!profile || typeof profile.provider !== 'string' || typeof profile.model !== 'string' || seen.has(profile.provider)) return false;
    seen.add(profile.provider);
    return true;
  }).slice(0, 3);
}

function reviewPrompt(antigen) {
  const claim = typeof antigen.claim === 'string' ? antigen.claim : antigen.claim?.text || '';
  const evidence = antigen.epitopes?.evidence?.digest || antigen.epitopes?.evidence?.kind || 'unspecified';
  return `Independently review this claim. Do not assume it is true. Identify a falsifying check or limitation.\nClaim: ${claim}\nEvidence reference: ${evidence}\nReturn concise review notes.`;
}

function recordProviderOutput(population, output) {
  if (!output || output.error || typeof output.text !== 'string' || !output.text.trim()) {
    return { provider: population.provider, status: 'error', error: output?.error || 'empty provider response' };
  }
  const digest = crypto.createHash('sha256').update(output.text).digest('hex');
  populationService.addResult(population, { claim: digest, evidence: { digest }, confidence: 0.5 });
  return { provider: population.provider, model: output.model, status: 'completed', responseDigest: digest };
}

function unavailable(populations, reason) {
  return { status: 'unavailable', advisoryOnly: true, distinctProviders: 0, reviews: [], reason,
    metapopulation: populationService.metapopulationReport(populations) };
}

module.exports = { runProviderMetapopulation, distinctProfiles, reviewPrompt };
