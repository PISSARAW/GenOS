'use strict';

const assert = require('node:assert/strict');
const modelProvider = require('../../../backend/src/services/modelProvider');
const executor = require('../../../backend/src/services/endogenousThoughtCampaignExecutor');
const { createRuntimeAdapter } = require('../adapters/genosRuntime');
const { buildCase, createWorld } = require('../scenarios/runtime');
const { executePair, scenarioModules } = require('../run_runtime_campaign');
const { createCampaignBudgetGuard } = require('../adapters/campaignBudgetGuard');

function fixtureResponse(request) {
  const question = { text: 'Why does this sensor stream depart from its baseline?',
    hypothesis: 'Repeated readings show a persistent sensor calibration drift',
    method: 'Compare repeated sensor readings with the baseline',
    falsifier: 'Repeated readings match the calibrated baseline' };
  const properties = request.responseFormat?.schema.properties.action.properties;
  const value = properties ? { action: Object.fromEntries(Object.entries(properties)
    .map(([field, schema]) => [field, schema.const ?? schema.enum?.[0]
      ?? 'Why do sensor readings depart from baseline? Compare the repeated anomaly.'])) } : question;
  return { text: JSON.stringify(value), provider: 'fixture', servedModel: 'fixture',
    inputTokens: 20, outputTokens: 10, tokenUsageMeasured: true };
}

async function testFullArmBudget() {
  const dispatches = [];
  const responses = [];
  const budgetGuard = createCampaignBudgetGuard({ tokenBudget: 12000,
    onDispatch: (call) => dispatches.push(call), onResponse: (call) => responses.push(call) });
  const scenario = scenarioModules('priority').find((item) => item.id === 'ETT-01');
  const record = await executePair({ scenario, difficulty: 'simple', seed: 1001,
    condition: 'full', model: 'ollama://fixture', budgetGuard });
  assert.equal(record.outcome.success, true, JSON.stringify(record.outcome.failure));
  assert.equal(dispatches.length, record.outcome.providerCalls);
  assert.equal(responses.length, record.outcome.providerCalls);
  assert.equal(budgetGuard.usedTokens, record.outcome.measuredTokens);
  assert.equal(budgetGuard.usedTokens, responses.reduce((sum, call) => sum + call.tokens, 0));
  assert.equal(budgetGuard.pendingCall, null);
  const blocked = createCampaignBudgetGuard({ tokenBudget: 1 });
  const rejected = await executePair({ scenario, difficulty: 'simple', seed: 1002,
    condition: 'full', model: 'ollama://fixture', budgetGuard: blocked });
  assert.equal(rejected.outcome.success, false);
  assert.equal(rejected.outcome.providerCalls, 0);
  assert.equal(blocked.usedTokens, 0);
  assert.equal(blocked.stopReason, 'token_budget_reserve_reached');
}

async function main() {
  const original = modelProvider.generate;
  const world = createWorld('ETT-01', 'simple', 1001);
  const testCase = buildCase('ETT-01', 'simple', 1001);
  modelProvider.generate = async (request) => fixtureResponse(request);
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
    await testFullArmBudget();
  } finally {
    modelProvider.generate = original;
  }
  process.stdout.write('ETT worker contract, host trace and full-arm global budget passed.\n');
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { main };
