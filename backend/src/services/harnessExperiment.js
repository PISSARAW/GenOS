/**
 * Expérience de migration HCL : snapshot S → fork A/B → diff → evidence.
 * GenOS garde l'autorité : les résultats bruts ne sont jamais des preuves,
 * seul `buildEvidence` produit un verdict typé et traçable.
 */
const METRICS = ['success', 'toolErrors', 'latencyMs', 'tokens', 'cost', 'humanInterventions', 'retries', 'proofCoverage'];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function planExperiment(spec) {
  const source = spec || {};
  if (!source.snapshotId) throw Object.assign(new Error('snapshotId is required.'), { code: 'HARNESS_EXPERIMENT_SNAPSHOT_REQUIRED' });
  if (!source.harnessA) throw Object.assign(new Error('harnessA is required.'), { code: 'HARNESS_EXPERIMENT_HARNESS_REQUIRED' });
  if (!source.harnessB) throw Object.assign(new Error('harnessB is required.'), { code: 'HARNESS_EXPERIMENT_HARNESS_REQUIRED' });
  return {
    snapshotId: String(source.snapshotId),
    harnessA: String(source.harnessA),
    harnessB: String(source.harnessB),
    mission: source.mission || '',
    metrics: METRICS.slice(),
    createdAt: new Date().toISOString(),
  };
}

function diffResults(resultA, resultB) {
  const left = resultA || {};
  const right = resultB || {};
  const deltas = {};
  for (const metric of METRICS) {
    if (metric === 'success' || metric === 'proofCoverage') {
      deltas[metric] = toNumber(right[metric]) - toNumber(left[metric]);
    } else {
      deltas[metric] = toNumber(left[metric]) - toNumber(right[metric]);
    }
  }
  return { deltas, base: left, candidate: right };
}

function buildEvidence(plan, diff) {
  const source = diff || {};
  const deltas = source.deltas || {};
  const successGain = toNumber(deltas.success);
  const proofGain = toNumber(deltas.proofCoverage);
  const verdict = successGain > 0 && proofGain >= 0 ? 'candidate-better' : 'inconclusive';
  return {
    kind: 'harness-comparison',
    snapshotId: plan && plan.snapshotId,
    harnessA: plan && plan.harnessA,
    harnessB: plan && plan.harnessB,
    deltas,
    verdict,
    createdAt: new Date().toISOString(),
  };
}

async function runComparison(plan, runner) {
  const input = plan || {};
  if (typeof runner !== 'function') throw Object.assign(new Error('runner is required.'), { code: 'HARNESS_EXPERIMENT_RUNNER_REQUIRED' });
  const resultA = await runner({ harness: input.harnessA, mission: input.mission, snapshotId: input.snapshotId });
  const resultB = await runner({ harness: input.harnessB, mission: input.mission, snapshotId: input.snapshotId });
  const diff = diffResults(resultA, resultB);
  const evidence = buildEvidence(input, diff);
  return { resultA, resultB, diff, evidence };
}

module.exports = { METRICS, planExperiment, diffResults, buildEvidence, runComparison };
