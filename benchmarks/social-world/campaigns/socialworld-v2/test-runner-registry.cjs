'use strict';

const assert = require('node:assert/strict');
const { SCENARIO_RUNNERS, loadRunner } = require('./runner-registry.cjs');

function verifyScenario(scenarioId, descriptor) {
  const runner = loadRunner(scenarioId);
  assert.deepEqual(runner.REGISTERED_ARMS, descriptor.arms, `${scenarioId} registered-arm mismatch`);
  assert.deepEqual(runner.EXECUTABLE_ARMS, descriptor.executableArms, `${scenarioId} executable-arm mismatch`);
  assert.equal(typeof runner.runScenario, 'function', `${scenarioId} runner entry is missing`);
}

for (const [scenarioId, descriptor] of Object.entries(SCENARIO_RUNNERS)) verifyScenario(scenarioId, descriptor);
process.stdout.write('SocialWorld V2 runner registry matches every module declaration.\n');
