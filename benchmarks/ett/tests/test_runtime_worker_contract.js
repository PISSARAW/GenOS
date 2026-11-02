'use strict';

const assert = require('node:assert/strict');
const modelProvider = require('../../../backend/src/services/modelProvider');
const executor = require('../../../backend/src/services/endogenousThoughtCampaignExecutor');
const { createRuntimeAdapter } = require('../adapters/genosRuntime');
const { buildCase, createWorld } = require('../scenarios/runtime');

function actionFor(observation) {
  const step = observation.nextAction;
  const values = { candidate: observation.candidates[0].id,
    text: 'Why do sensor readings depart from baseline? Compare the repeated anomaly.' };
  const fields = step?.requiredFields || { answerId: 'candidate' };
  return { type: step?.type || 'submit_answer',
    ...Object.fromEntries(Object.entries(fields).map(([field, kind]) => [field, values[kind]])) };
}

function fixtureResponse(world, request) {
  const question = { text: 'Why does this sensor stream depart from its baseline?',
    hypothesis: 'Repeated readings show a persistent sensor calibration drift',
    method: 'Compare repeated sensor readings with the baseline',
    falsifier: 'Repeated readings match the calibrated baseline' };
  const value = request.responseFormat ? { action: actionFor(world.observation) } : question;
  return { text: JSON.stringify(value), provider: 'fixture', servedModel: 'fixture',
    inputTokens: 20, outputTokens: 10, tokenUsageMeasured: true };
}

async function main() {
  const original = modelProvider.generate;
  const world = createWorld('ETT-01', 'simple', 1001);
  const testCase = buildCase('ETT-01', 'simple', 1001);
  modelProvider.generate = async (request) => fixtureResponse(world, request);
  try {
    const adapter = createRuntimeAdapter({ model: 'ollama://fixture', world,
      observation: world.observation,
      oracle: { ...testCase.oracle, requireInspection: true, requireInteraction: true } });
    const result = await executor.execute({ condition: 'full', caseId: testCase.caseId,
      input: { seed: 1001, scenarioClass: 'ETT-01', publicObservation: world.observation,
        problem: { problemId: testCase.caseId, statement: world.observation.objective } },
      runtimeAdapter: adapter });
    assert.equal(result.success, true, JSON.stringify(result.failure));
    assert.equal(world.terminal, true);
    assert.equal(result.terminalState, 'STOPPED');
    assert.equal(result.continued, false);
    assert.equal(adapter.usageSummary().calls, 5);
    assert.equal(result.scientificEvidence, true);
    assert.match(result.ettTrace.runReceiptRef, /^rcpt_/);
    assert.match(result.ettTrace.verificationReceiptRef, /^rcpt_/);
    assert.equal(adapter.verificationSummary().domainMetrics.questionWellFormed, true);
    assert.equal(adapter.verificationSummary().domainMetrics.testTargetsAnswer, true);
    assert.equal(result.measuredTokens, adapter.usageSummary().tokens);
    assert.equal(result.modelOutputIsEvidence, false);
  } finally {
    modelProvider.generate = original;
  }
  process.stdout.write('ETT worker run contract and host action trace verification passed.\n');
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { main };
