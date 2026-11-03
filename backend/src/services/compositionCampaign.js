'use strict';

const { digest } = require('./qualityElevation/qualityContract');

function validate(input) {
  validateComponents(input.components);
  validateSeeds(input.seeds);
  validateBudget(input.budget);
  if (typeof input.execute !== 'function' || typeof input.verify !== 'function') invalid();
}

function validateComponents(components) {
  if (!Array.isArray(components) || components.length < 1 || components.length > 8) invalid();
  if (components.some(item => typeof item !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(item))) invalid();
  if (new Set(components).size !== components.length) invalid();
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || !seeds.length || seeds.length > 20) invalid();
  if (!seeds.every(Number.isSafeInteger) || new Set(seeds).size !== seeds.length) invalid();
}

function validateBudget(budget) {
  if (!budget || Object.keys(budget).sort().join(',') !== 'calls,tokens') invalid();
  if (!Number.isSafeInteger(budget.calls) || budget.calls < 1 || budget.calls > 1000) invalid();
  if (!Number.isSafeInteger(budget.tokens) || budget.tokens < 1 || budget.tokens > 10000000) invalid();
}

function invalid() { throw new Error('COMPOSITION_CAMPAIGN_INVALID'); }

function arms(components) {
  return [{ id: 'baseline', components: [] }, { id: 'full', components },
    ...components.map(removed => ({ id: `without_${removed}`, components: components.filter(item => item !== removed) }))];
}

function usageWithin(usage, budget) {
  if (!usage || !Number.isSafeInteger(usage.calls) || !Number.isSafeInteger(usage.tokens)) return false;
  return usage.calls >= 0 && usage.tokens >= 0 && usage.calls <= budget.calls && usage.tokens <= budget.tokens;
}

async function runArm(input, request) {
  try { return await executeArm(input, request); }
  catch (error) {
    return { ...request, usage: null, artifactDigest: null, withinBudget: false,
      verified: false, evidenceRefs: [], error: error.code || 'COMPOSITION_EXECUTION_FAILED' };
  }
}

async function executeArm(input, request) {
  const result = await input.execute(structuredClone(request));
  const withinBudget = usageWithin(result?.usage, input.budget);
  const verification = withinBudget ? await input.verify({ request: structuredClone(request),
    artifact: result.artifact, artifactDigest: digest(result.artifact) }) : null;
  const verified = verification?.passed === true && verification.artifactDigest === digest(result.artifact)
    && Array.isArray(verification.evidenceRefs) && verification.evidenceRefs.length > 0;
  return { ...request, usage: result?.usage || null, artifactDigest: digest(result?.artifact ?? null),
    withinBudget, verified, evidenceRefs: verified ? verification.evidenceRefs : [] };
}

function comparisons(results, components) {
  const full = results.filter(item => item.arm === 'full');
  return ['baseline', ...components.map(item => `without_${item}`)].map(arm => {
    const pairs = full.map(item => ({ full: item, control: results.find(other => other.arm === arm && other.seed === item.seed) }))
      .filter(pair => pair.full.withinBudget && pair.control.withinBudget);
    return { arm, pairs: pairs.length, verifiedSuccessDelta: pairs.length ? pairs.reduce((total, pair) =>
      total + Number(pair.full.verified) - Number(pair.control.verified), 0) / pairs.length : null };
  });
}

async function run(input) {
  validate(input);
  const results = [];
  for (const seed of input.seeds) {
    const variants = arms([...input.components]);
    if (seed % 2) variants.reverse();
    for (const arm of variants) results.push(await runArm(input,
      { arm: arm.id, components: arm.components, seed, budget: { ...input.budget } }));
  }
  return { schema: 'genos.composition-campaign/v1', results,
    comparisons: comparisons(results, input.components),
    scope: 'supplied-executors-and-seeds', budgetPolicy: 'post-execution-admission', promotionEligible: false };
}

module.exports = { run };
