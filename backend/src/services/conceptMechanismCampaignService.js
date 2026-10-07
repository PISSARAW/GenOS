'use strict';

const fs = require('node:fs');
const experiment = require('./replicatedCausalValidationService');
const binding = require('./perceptiveBindingService');
const predictive = require('./generativePerceptualService');
const report = require('./deterministicFinalReportService');

const SOURCES = Object.freeze({
  recurrence: './perceptiveBindingService',
  descending_prior: './generativePerceptualService',
  report_access: './deterministicFinalReportService'
});

function recurrence(enabled, state, seed) {
  const item = { id: 'object', features: { marker: seed } };
  const initial = binding.recurrentUpdate([], { items: [item] });
  const maintained = binding.recurrentUpdate(enabled ? initial.bindings : [], state);
  return { metric: maintained.graph.entities.length, trajectory: [initial, maintained], steps: 2 };
}

function descendingPrior(enabled, state, seed) {
  const output = predictive.predictHierarchy({ observation: state.observation, precision: 0.5,
    priors: { mission: [enabled ? 0.5 + (Math.abs(seed) % 7) / 100 : 0] } });
  return { metric: output.posterior[0], trajectory: [output], steps: 1 };
}

function reportAccess(enabled, state, seed) {
  const source = { workerId: 'worker', events: [{ evidenceReport: { outcome: 'success',
    claims: [{ statement: `Synthetic claim ${seed}`, evidence: [`fixture:${seed}`] }] } }] };
  if (!enabled) source.events = [];
  const output = report.compile({ synthesisOnly: true, completedWorkerIds: state.workers,
    completedWorkerDossiers: [source] });
  return { metric: output.claims.length, trajectory: [output], steps: 1 };
}

const RUNNERS = Object.freeze({ recurrence, descending_prior: descendingPrior, report_access: reportAccess });

function environment(probe) {
  if (!Object.hasOwn(RUNNERS, probe)) throw TypeError('Unknown bounded mechanism probe');
  const source = SOURCES[probe];
  return { probe, node: process.version,
    sourceHash: experiment.digest(fs.readFileSync(require.resolve(source), 'utf8')),
    runnerHash: experiment.digest(fs.readFileSync(__filename, 'utf8')) };
}

async function run(probe, options = {}) {
  const environmentManifest = environment(probe);
  const environmentHash = experiment.digest(environmentManifest);
  if (options.expectedEnvironmentHash && options.expectedEnvironmentHash !== environmentHash) {
    throw Object.assign(Error('Preregistered environment changed'), { code: 'CAUSAL_ENV_DRIFT' });
  }
  const seeds = options.seeds || [11, 23, 37, 41, 53];
  const result = await experiment.runReplicatedExperiment({
    experimentId: `concept-${probe}-v1`, snapshotId: `concept-${probe}-snapshot-v1`,
    environmentManifest, environmentHash, seeds,
    control: { enabled: false }, intervention: { enabled: true },
    initialState: { items: [], observation: [0], workers: ['worker'] },
    budget: { maxRuns: seeds.length * 2, maxSteps: 2 },
    runner: (arm, state, context) => ({ ...RUNNERS[probe](arm.enabled, state, context.seed),
      seed: context.seed, environmentHash: context.environmentHash }),
    evidenceRefs: [`mechanism:${probe}`, `source:${SOURCES[probe]}`]
  });
  return { ...result, status: result.receipt.payload.verdict, promotionAllowed: false,
    limitation: 'Paired synthetic software intervention only, not independent replication or whole-runtime causality.' };
}

module.exports = { run, environment, probes: Object.freeze(Object.keys(RUNNERS)) };
