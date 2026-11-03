'use strict';
const assert = require('node:assert/strict');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const { createInvoker } = require('../src/services/qualityElevation/qualityBudget');
const { validatedCall } = require('../src/services/qualityElevation/qualityProtocol');
const { meteredReply } = require('../src/services/qualityElevation/qualityRuntimeModelAdapter');

async function main() {
  const contract = compileQualityContract({ mission: 'Review the actual artifact.', policy: 'fast',
    domain: 'generic', maxProtocolRepairs: 1, maxOutputTokens: 100, budgetMaxTokens: 10000 });
  const { qualityMissionFields } = require('../src/services/qualityElevation/qualityMissionContract');
  const fields = qualityMissionFields({ qualityElevation: contract,
    qualityRuntime: { reviewers: [{ id: 'reader', model: 'glm', reasoningEffort: 'low' }] } });
  assert.equal(fields.qualityRuntime.reviewers[0].reasoningEffort, 'low');
  assert.throws(() => qualityMissionFields({ qualityElevation: contract,
    qualityRuntime: { reviewers: [{ id: 'reader', model: 'glm', reasoningEffort: 'invalid' }] } }),
  { code: 'GQEL_INVALID_CONTRACT' });
  const session = { calls: [], budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
  const invoke = createInvoker(contract, session);
  let calls = 0;
  const callback = async () => {
    calls++;
    const text = calls === 1 ? '{"wrong":true}' : '{"checks":[]}';
    return meteredReply({ model: 'reader', tokenUsageMeasured: true, inputTokens: 20, outputTokens: 10,
      finishReason: 'stop', ...(calls === 1 ? { schemaViolation: { violations: ['checks required'] } } : {}) }, text);
  };
  const result = await validatedCall({ contract, session, invoke, callback },
    { operation: 'review:test', expectedModel: 'reader', prompt: 'Review only this data.\n{"artifact":"actual text"}' }, JSON.parse);
  assert.deepEqual(result, { checks: [] });
  assert.equal(calls, 2);
  assert.equal(session.budget.tokens, 60);
  assert.equal(session.budget.usageComplete, true);
  assert.equal(session.protocolAttempts[0].code, 'GQEL_REVIEW_INVALID');
  assert.equal(session.calls[0].status, 'failed');
  assert.equal(session.calls[0].usage.outputTokens, 10);
  const exhausted = { calls: [], budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
  await assert.rejects(validatedCall({ contract, session: exhausted, invoke: createInvoker(contract, exhausted),
    callback: async () => meteredReply({ model: 'reader', tokenUsageMeasured: true, inputTokens: 20, outputTokens: 10,
      finishReason: 'stop', schemaViolation: { violations: ['checks required'] } }, '{"wrong":true}') },
  { operation: 'review:test', prompt: 'Review only this data.\n{"artifact":"actual text"}' }, JSON.parse),
  { code: 'GQEL_REVIEW_INVALID' });
  assert.equal(exhausted.budget.calls, 2);
  assert.equal(exhausted.budget.tokens, 60);
  const truncated = { calls: [], budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
  await assert.rejects(validatedCall({ contract, session: truncated, invoke: createInvoker(contract, truncated),
    callback: async () => meteredReply({ model: 'reader', tokenUsageMeasured: true, inputTokens: 20, outputTokens: 10,
      finishReason: 'length', schemaViolation: { violations: ['truncated JSON'] } }, '{') },
  { operation: 'review:test', prompt: 'Review only this data.\n{"artifact":"actual text"}' }, JSON.parse),
  { code: 'GQEL_TRUNCATED_OUTPUT' });
  assert.equal(truncated.budget.calls, 1);
  console.log('Native invalid-schema replies retain measured usage, retry within the protocol budget and cannot accept truncation: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
