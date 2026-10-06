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
  if (populations.length < 2) {
    const result = unavailable(populations, 'two configured providers are required');
    await persistReviews(options, antigen, [{ provider: 'none', status: 'unavailable' }]);
    return result;
  }
  const reviews = await collectProviderReviews(antigen, { distinct, populations }, options);
  await persistReviews(options, antigen, reviews);
  const successful = reviews.filter((review) => review.status === 'completed');
  const verdicts = new Set(successful.map((review) => review.verdict));
  const complete = successful.length === distinct.length && verdicts.size === 1;
  const verdict = complete ? successful[0].verdict : 'uncertain';
  return {
    status: complete ? 'complete' : (verdicts.size > 1 ? 'disputed' : 'incomplete'),
    verdict,
    advisoryOnly: true,
    distinctProviders: new Set(successful.map((review) => review.provider)).size,
    reviews,
    metapopulation: populationService.metapopulationReport(populations),
  };
}

async function collectProviderReviews(antigen, profiles, options) {
  const { distinct, populations } = profiles;
  const inputs = distinct.map((profile) => ({ ...profile, prompt: reviewPrompt(antigen),
    timeoutMs: options.timeoutMs || 30000, maxTokens: options.maxTokens || 400 }));
  const runner = options.runner || processRunner.runIsolatedPopulations;
  const outputs = await runner(inputs).catch((error) => inputs.map((profile) => ({ provider: profile.provider, error: error.message })));
  return distinct.map((profile, index) => reviewProviderOutput(profile, {
    output: Array.isArray(outputs) ? outputs[index] : null, population: populations[index], antigen,
  }));
}

function reviewProviderOutput(profile, input) {
  const { output, population, antigen } = input;
  if (output?.provider !== profile.provider || (output.model && output.model !== profile.model)) {
    return { provider: profile.provider, model: profile.model, status: 'error', error: 'provider identity mismatch' };
  }
  return recordProviderOutput(population, output, antigen);
}

function distinctProfiles(profiles) {
  const seen = new Set();
  return (Array.isArray(profiles) ? profiles : []).filter((profile) => {
    if (!profile || typeof profile.provider !== 'string' || typeof profile.model !== 'string') return false;
    const provider = profile.provider.trim().toLowerCase();
    if (!provider || !profile.model.trim() || seen.has(provider)) return false;
    seen.add(provider);
    return true;
  }).slice(0, 3).map((profile) => ({ ...profile, provider: profile.provider.trim().toLowerCase() }));
}

function reviewPrompt(antigen) {
  const claim = (typeof antigen.claim === 'string' ? antigen.claim : antigen.claim?.text || '').slice(0, 4000);
  const evidence = antigen.epitopes?.evidence?.digest || antigen.epitopes?.evidence?.kind || 'unspecified';
  return `Independently challenge this claim. Claim ID: ${antigen.id}. Evidence digest: ${evidence}.\nClaim: ${claim}\nReturn only JSON with claimId, evidenceDigest, verdict (supports, refutes, uncertain), and one concise rationale. Do not infer proof from another model's opinion.`;
}

async function persistReviews(options, antigen, reviews) {
  if (!options.db || !options.scopeId || !options.runId) return;
  for (const review of reviews) {
    await options.db.run(
      `INSERT INTO aeis_provider_reviews
       (id, scope_id, run_id, antigen_id, provider, model, status, verdict, response_digest, process_id, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), options.scopeId, options.runId, antigen.id,
      review.provider, review.model || null, review.status, review.verdict || null,
      review.responseDigest || null, review.processId || null, review.durationMs || null,
    );
  }
}

function structuredReview(output, antigen) {
  let parsed;
  try { parsed = JSON.parse(output.text); } catch (_) { return null; }
  const evidenceDigest = antigen.epitopes?.evidence?.digest || antigen.epitopes?.evidence?.kind || 'unspecified';
  if (parsed.claimId !== antigen.id || parsed.evidenceDigest !== evidenceDigest) return null;
  if (!['supports', 'refutes', 'uncertain'].includes(parsed.verdict)) return null;
  if (typeof parsed.rationale !== 'string' || !parsed.rationale.trim()) return null;
  return parsed;
}

function recordProviderOutput(population, output, antigen) {
  if (!output || output.error || typeof output.text !== 'string' || !output.text.trim()) {
    return { provider: population.provider, status: 'error', error: output?.error || 'empty provider response' };
  }
  const review = structuredReview(output, antigen);
  if (!review) return { provider: population.provider, status: 'error', error: 'unbound or unstructured provider review' };
  const digest = crypto.createHash('sha256').update(output.text).digest('hex');
  populationService.addResult(population, { claim: review.verdict, evidence: { digest }, confidence: 0.5 });
  return { provider: population.provider, model: output.model, status: 'completed',
    responseDigest: digest, verdict: review.verdict, rationale: review.rationale.slice(0, 500),
    processId: output.processId || null, durationMs: output.durationMs || null };
}

function unavailable(populations, reason) {
  return { status: 'unavailable', advisoryOnly: true, distinctProviders: 0, reviews: [], reason,
    metapopulation: populationService.metapopulationReport(populations) };
}

module.exports = { runProviderMetapopulation, distinctProfiles, reviewPrompt };
