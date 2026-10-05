'use strict';

const crypto = require('node:crypto');
const ignition = require('./ignitionService');
const experiment = require('./controlledCausalExperimentService');
const { createReceipt } = require('./versionedContractService');

const CANDIDATES = Object.freeze([
  { id: 'candidate-a', drives: { urgency: 0.9, novelty: 0.4 } },
  { id: 'candidate-b', drives: { urgency: 0.5, novelty: 0.8 } }
]);

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function runArm(config, state) {
  const result = ignition.competeWinners(state.candidates, config);
  return { winners: result.winners, activations: result.activations, rounds: result.rounds };
}

function causalPayload(receipt) {
  const baseline = receipt.baselineOutcome;
  const candidate = receipt.candidateOutcome;
  const changed = JSON.stringify(baseline) !== JSON.stringify(candidate);
  return {
    experimentId: 'concept-ignition-ablation-v1', snapshotId: `local-${hash(receipt).slice(0, 16)}`,
    control: { label: 'normal competitive inhibition', metrics: { changed: false, winners: baseline.winners } },
    intervention: { label: 'increased competitive inhibition', metrics: { changed, winners: candidate.winners } },
    seeds: [0, 1], replicates: 2, metricsBefore: { winners: baseline.winners },
    metricsAfter: { winners: candidate.winners }, pairedEffects: { winnerSetChanged: changed },
    verdict: changed ? 'inconclusive' : 'refuted', evidenceRefs: ['concept:GENOS-IGNITION', 'probe:competitive-ablation']
  };
}

function runLocalCausalCampaign() {
  const raw = experiment.runControlledExperiment({
    name: 'concept-ignition-ablation-v1',
    control: { inhibition: 0.2, rounds: 3 },
    intervention: { inhibition: 0.95, rounds: 3 },
    initialState: { candidates: CANDIDATES },
    runner: runArm,
    trajectoryExtractor: (result) => result.winners
  });
  const payload = causalPayload(raw);
  const receipt = createReceipt('CausalInterventionReceipt', payload, {
    runId: 'concept-causal-campaign-v1', sourceRefs: ['backend/src/services/conceptCausalCampaignService.js']
  });
  return {
    status: 'inconclusive', receipt, rawEvidence: raw,
    limitation: 'Probe causale locale contrôlée ; elle ne valide ni la conscience ni la généralisation externe.'
  };
}

module.exports = { runLocalCausalCampaign, CANDIDATES };
