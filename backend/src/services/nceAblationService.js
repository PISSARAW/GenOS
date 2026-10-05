'use strict';

const { runCausalCycle } = require('./nceCausalCycleService');
const { generateSplit } = require('./nceEnvironmentFactory');
const { digest } = require('./nceProcedureProgram');

const ARMS = Object.freeze({
  baseline: { play: false, culture: false, phenotype: false, poet: false },
  withoutPlay: { play: false }, withoutCulture: { culture: false },
  withoutPhenotype: { phenotype: false }, withoutPoet: { poet: false }, full: {},
});

function validateCampaign(input) {
  if (typeof input.campaignId !== 'string' || !input.campaignId.trim()) throw new Error('Campaign identity required');
  validateSeeds(input.seeds);
  const arms = input.arms || Object.keys(ARMS);
  if (arms.some((arm) => !Object.hasOwn(ARMS, arm)) || !arms.includes('baseline')
      || !arms.includes('full') || new Set(arms).size !== arms.length) throw new Error('Invalid ablation arms');
  return arms;
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || !seeds.length || seeds.length > 20
      || seeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error('1..20 integer seeds required');
  if (new Set(seeds).size !== seeds.length) throw new Error('Ablation seeds must be unique');
}

async function runAblationCampaign(input) {
  const arms = validateCampaign(input);
  const outcomes = [];
  for (const seed of input.seeds) {
    const split = await generateSplit({ ...input, seed });
    const order = [...arms].sort((a, b) => digest([seed, a]).localeCompare(digest([seed, b])));
    for (const arm of order) {
      const subject = `nce-ablation:${digest([input.campaignId, seed, arm])}`;
      const receipt = await runCausalCycle({ runId: `${input.campaignId}:${seed}:${arm}`,
        agentId: subject, split, artifacts: input.artifacts, features: ARMS[arm],
        timeoutMs: input.timeoutMs }, input.db);
      outcomes.push({ seed, arm, receipt });
    }
  }
  return reportCampaign(input, outcomes);
}

function reportCampaign(input, outcomes) {
  const pairs = input.seeds.map((seed) => {
    const rows = outcomes.filter((item) => item.seed === seed);
    const baseline = rows.find((item) => item.arm === 'baseline').receipt;
    const full = rows.find((item) => item.arm === 'full').receipt;
    return { seed, measured: baseline.measured && full.measured,
      delta: baseline.measured && full.measured
        ? full.after.heldOut.successRate - baseline.after.heldOut.successRate : null };
  });
  const deltas = pairs.filter((pair) => pair.measured).map((pair) => pair.delta);
  const mean = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null;
  const report = { schema: 'genos.nce.ablation.v1', evidenceClass: 'executed-task-benchmark',
    campaignId: input.campaignId, family: input.family, seeds: input.seeds,
    outcomes, pairs, meanDelta: mean, measuredPairs: deltas.length,
    standardError: standardError(deltas, mean),
    limitations: ['bounded numeric task families', 'no claim of general creativity',
      'standard error is descriptive; no significance claim', 'four core mechanisms only'],
  };
  report.evidenceRef = digest(report);
  return report;
}

function standardError(values, mean) {
  if (values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

module.exports = { ARMS, runAblationCampaign };
