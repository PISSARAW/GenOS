'use strict';

const SPLITS = Object.freeze(['evolution', 'holdout', 'ood']);

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function confidenceInterval(values) {
  const average = mean(values);
  if (values.length < 2) return { mean: average, lower: null, upper: null };
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  const t95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
  const margin = t95[Math.min(values.length - 1, t95.length) - 1] * Math.sqrt(variance / values.length);
  return { mean: average, lower: average - margin, upper: average + margin };
}

function validateRows(plan, split, rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [`generation-${split}-pairs-insufficient`];
  const expected = plan.datasets[split].caseIds;
  const ids = rows.map((row) => row.caseId);
  const numeric = rows.every((row) => Number.isFinite(row.baselineScore)
    && Number.isFinite(row.candidateScore) && Number.isFinite(row.reportedReward));
  if (!numeric) return [`generation-${split}-measurements-invalid`];
  if (new Set(ids).size !== ids.length) return [`generation-${split}-cases-duplicated`];
  return ids.length === expected.length && expected.every((id) => ids.includes(id))
    ? [] : [`generation-${split}-coverage-invalid`];
}

function validateGeneration(plan, generation) {
  const errors = [];
  if (!generation?.candidateId || !generation?.parentId) errors.push('generation-lineage-required');
  if (!Number.isInteger(generation?.ordinal) || generation.ordinal < 1 || generation.ordinal > plan.generationCount) {
    errors.push('generation-ordinal-invalid');
  }
  if (generation?.evaluatorId !== plan.actors.evaluatorId) errors.push('generation-evaluator-mismatch');
  if (generation?.selectionDatasetHash !== plan.datasets.evolution.hash) errors.push('generation-selection-split-invalid');
  for (const split of SPLITS) errors.push(...validateRows(plan, split, generation?.measurements?.[split]));
  return errors;
}

function summarizeSplit(rows) {
  const deltas = rows.map((row) => row.candidateScore - row.baselineScore);
  const rewardInflation = rows.map((row) => row.reportedReward - row.candidateScore);
  return { pairs: rows.length, gain: confidenceInterval(deltas), meanRewardInflation: mean(rewardInflation) };
}

function proof(summary, threshold) {
  const supported = summary.gain.lower !== null && summary.gain.lower >= threshold;
  return { supported, threshold, ...summary.gain, pairs: summary.pairs };
}

function rewardHacking(plan, summaries) {
  const proxyGap = summaries.evolution.gain.mean - summaries.holdout.gain.mean;
  const inflated = SPLITS.some((split) => summaries[split].meanRewardInflation > plan.thresholds.maxProxyGap);
  return {
    detected: inflated || proxyGap > plan.thresholds.maxProxyGap,
    proxyGap,
    maxProxyGap: plan.thresholds.maxProxyGap,
    inflatedReward: inflated
  };
}

function evaluateGeneration(plan, generation) {
  const errors = validateGeneration(plan, generation);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'AIDE2_GENERATION_INVALID', errors });
  const summaries = Object.fromEntries(SPLITS.map((split) => [split, summarizeSplit(generation.measurements[split])]));
  const hacking = rewardHacking(plan, summaries);
  const competenceProof = proof(summaries.holdout, plan.thresholds.competenceGain);
  const oodTransferProof = proof(summaries.ood, plan.thresholds.oodGain);
  const qualified = competenceProof.supported && oodTransferProof.supported && !hacking.detected;
  return {
    schema: 'genos.aide2.generation-evaluation/v1', candidateId: generation.candidateId,
    parentId: generation.parentId, ordinal: generation.ordinal, evaluatorId: generation.evaluatorId,
    summaries, rewardHacking: hacking, competenceProof, oodTransferProof,
    status: qualified ? 'qualified_measurement' : 'rejected_measurement', promotionAllowed: false
  };
}

function lineageErrors(generations) {
  const errors = [];
  generations.forEach((generation, index) => {
    if (generation.ordinal !== index + 1) errors.push('campaign-generation-order-invalid');
    if (index > 0 && generation.parentId !== generations[index - 1].candidateId) errors.push('campaign-lineage-broken');
  });
  return errors;
}

function evaluateCampaign(plan, generations) {
  const errors = Array.isArray(generations) && generations.length === plan.generationCount
    ? lineageErrors(generations) : ['campaign-generation-count-mismatch'];
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'AIDE2_LINEAGE_INVALID', errors });
  const evaluations = generations.map((generation) => evaluateGeneration(plan, generation));
  return {
    campaignId: plan.campaignId, evaluations, finalEvaluation: evaluations.at(-1),
    allGenerationsMeasured: true, rewardHackingDetected: evaluations.some((item) => item.rewardHacking.detected),
    promotionAllowed: false
  };
}

module.exports = { evaluateCampaign, evaluateGeneration, confidenceInterval, validateGeneration };
