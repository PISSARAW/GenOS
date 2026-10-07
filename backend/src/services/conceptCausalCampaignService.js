'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const ignition = require('./ignitionService');
const experiment = require('./replicatedCausalValidationService');

function sourceHash() {
  return crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./ignitionService'))).digest('hex');
}

function runArm(config, state, context) {
  const offset = (Math.abs(context.seed) % 7) / 100;
  const candidates = state.candidates.map((item) => ({
    ...item, drives: { urgency: item.drives.urgency + offset }
  }));
  const result = ignition.competeWinners(candidates, config);
  return { seed: context.seed, environmentHash: context.environmentHash,
    steps: result.rounds, metric: result.winners.length,
    trajectory: [{ candidates, winners: result.winners, activations: result.activations }] };
}

async function runLocalCausalCampaign(options = {}) {
  const environmentManifest = { mechanism: 'ignitionService.competeWinners',
    sourceHash: sourceHash(), node: process.version,
    runnerHash: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex') };
  const evidence = await experiment.runReplicatedExperiment({
    experimentId: 'concept-ignition-ablation-v2', snapshotId: 'competition-initial-state-v2',
    runId: 'concept-causal-campaign-v2', seeds: options.seeds || [11, 23, 37, 41, 53],
    environmentManifest, environmentHash: experiment.digest(environmentManifest),
    budget: { maxRuns: (options.seeds || [11, 23, 37, 41, 53]).length * 2, maxSteps: 3 },
    control: { inhibition: 0, rounds: 3, margin: 0.15 },
    intervention: { inhibition: 0.95, rounds: 3, margin: 0.15 },
    initialState: { candidates: [
      { id: 'candidate-a', drives: { urgency: 0.9 } },
      { id: 'candidate-b', drives: { urgency: 0.88 } }
    ] }, runner: runArm,
    evidenceRefs: ['backend/src/services/ignitionService.js', 'intervention:lateral-inhibition']
  });
  return { status: evidence.receipt.payload.verdict, ...evidence, promotionAllowed: false,
    limitation: 'Local paired intervention on a software mechanism; no external generalization or consciousness claim.' };
}

module.exports = { runLocalCausalCampaign };
