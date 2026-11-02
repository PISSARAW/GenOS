'use strict';

const assert = require('node:assert/strict');
const Ajv = require('../../../backend/node_modules/ajv');
const { actionResponseFormat, actionInstructions, applyModelAction } = require('../adapters/actionResponse');
const { createLedger } = require('../adapters/localModel');
const { createCampaignBudgetGuard, reserveForCall } = require('../adapters/campaignBudgetGuard');
const { SCENARIO_IDS, LEVELS, createWorld } = require('../scenarios/runtime');

function publicAction(observation) {
  const next = observation.nextAction;
  const values = { candidate: observation.candidates[0].id, text: 'A falsifiable test on public evidence',
    number: 0, probability: 0.5, boolean: false,
    number_vector: [0, 0, 0], boolean_vector: [false, false, false, false, false] };
  const fields = next?.requiredFields || { answerId: 'candidate' };
  return { type: next?.type || 'submit_answer',
    ...Object.fromEntries(Object.entries(fields).map(([key, kind]) => [key, values[kind]])) };
}

function testAllPublicProtocols() {
  const ajv = new Ajv({ strict: false });
  for (const scenarioId of SCENARIO_IDS) {
    for (const level of LEVELS) {
      const world = createWorld(scenarioId, level, 1001);
      let turns = 0;
      while (!world.terminal && turns < world.observation.actionBudget) {
        const observation = world.observation;
        const envelope = { action: publicAction(observation) };
        const format = actionResponseFormat(observation);
        assert.equal(ajv.validate(format.schema, envelope), true, JSON.stringify(ajv.errors));
        assert.equal(ajv.validate(format.schema, { action: { ...envelope.action, requiredFields: {} } }), false);
        assert.match(actionInstructions(observation), /directly inside action/);
        const response = applyModelAction(world, turns % 2 ? envelope.action : envelope);
        assert.notEqual(response.status, 'rejected', `${scenarioId}/${level}: ${response.reason}`);
        turns += 1;
      }
      assert.equal(world.terminal, true, `${scenarioId}/${level} must submit within the budget`);
    }
  }
}

function testInvalidActionsConsumeBudget() {
  const world = createWorld('ETT-01', 'simple', 1001);
  const initial = world.remaining;
  assert.equal(applyModelAction(world, {}).reason, 'malformed');
  assert.equal(world.remaining, initial - 1);
  const capturedResponse = { type: 'inspect_sensor_stream',
    requiredFields: { candidateId: 'candidate-0' } };
  assert.equal(applyModelAction(world, capturedResponse).reason, 'invalid_field:candidateId');
  assert.equal(world.remaining, initial - 2);
  assert.equal(world.observation.completedSteps, 0);
  assert.equal(applyModelAction(world, { answerId: 'candidate-0' }).reason, 'protocol_incomplete');
  assert.equal(world.observation.completedSteps, 0);
}

async function testProviderFormatAndBudget() {
  const observation = createWorld('ETT-01', 'simple', 1001).observation;
  const responseFormat = actionResponseFormat(observation);
  const request = { prompt: actionInstructions(observation), maxTokens: 128, responseFormat };
  const base = reserveForCall({ ...request, responseFormat: undefined });
  assert.equal(reserveForCall(request) - base, Buffer.byteLength(JSON.stringify(responseFormat), 'utf8'));
  let dispatched = false;
  const blocked = createLedger({ budgetGuard: createCampaignBudgetGuard({ tokenBudget: base }),
    generate: async () => { dispatched = true; } });
  await assert.rejects(() => blocked.generateJson(request), /exceeds remaining campaign budget/);
  assert.equal(dispatched, false);
  const ledger = createLedger({ generate: async (received) => {
    assert.deepEqual(received.responseFormat, responseFormat);
    return { text: JSON.stringify({ action: publicAction(observation) }), provider: 'fixture',
      inputTokens: 20, outputTokens: 10, tokenUsageMeasured: true };
  } });
  const generated = await ledger.generateJson(request);
  assert.equal(generated.value.action.type, 'inspect_sensor_stream');
  assert.equal(ledger.summary().tokens, 30);
}

async function main() {
  testAllPublicProtocols();
  testInvalidActionsConsumeBudget();
  await testProviderFormatAndBudget();
  process.stdout.write('ETT action envelopes, public schemas and budget accounting passed.\n');
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { main };
