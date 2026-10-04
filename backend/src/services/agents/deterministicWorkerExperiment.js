'use strict';

const { runProcedure } = require('./deterministicWorkerProcedures');

function assertExperimentInput(methodContract) {
  const parameters = methodContract?.parameters;
  if (methodContract?.version !== 1 || methodContract.methodId !== 'measure_lpt'
    || !parameters || !Number.isSafeInteger(parameters.threshold) || parameters.threshold < 0) {
    throw Object.assign(new Error('LPT experiment requires a nonnegative integer threshold.'), {
      code: 'WORKER_EXPERIMENT_INPUT_INVALID'
    });
  }
  runProcedure({ version: 1, methodId: 'lpt', parameters: {
    jobs: parameters.jobs, machines: parameters.machines
  } });
  return true;
}

function runExperiment(methodContract) {
  assertExperimentInput(methodContract);
  const { jobs, machines, threshold } = methodContract.parameters;
  const computed = runProcedure({ version: 1, methodId: 'lpt', parameters: { jobs, machines } });
  const makespan = computed.output.makespan;
  return {
    hypothesis: `LPT makespan is at most ${threshold} duration units.`,
    protocol: ['Validate the declared jobs and machine count.',
      'Execute the deterministic LPT scheduler.',
      'Compare the measured makespan with the declared threshold.'],
    measurements: [{ metric: 'makespan', value: makespan, unit: 'duration_units',
      evidence: [computed.receipt.id] }],
    conclusion: makespan <= threshold ? 'supported_for_this_input' : 'refuted_for_this_input',
    procedureReceipt: computed.receipt
  };
}

module.exports = { assertExperimentInput, runExperiment };
