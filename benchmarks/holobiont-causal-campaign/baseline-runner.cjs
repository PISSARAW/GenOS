'use strict';

const RUNNER_ID = 'isolated-direct-baseline/v1';

function calculate(values) {
  let value = 0;
  for (const item of values) value += item;
  return value;
}

async function execute(testCase) {
  const started = process.hrtime.bigint();
  const output = { value: calculate(testCase.values) };
  const elapsedNs = Number(process.hrtime.bigint() - started);
  return {
    runnerId: RUNNER_ID,
    output,
    metrics: {
      durationMs: elapsedNs / 1e6,
      tokenUsage: null,
      admissionCount: null,
      sessionClosed: null
    },
    evidenceRefs: [`baseline:${testCase.id}:${output.value}`]
  };
}

module.exports = { RUNNER_ID, execute };
