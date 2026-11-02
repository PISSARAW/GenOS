'use strict';
const assert = require('node:assert/strict');
const provider = require('../src/services/modelProviderRequest');
const { meteredReply } = require('../src/services/qualityElevation/qualityRuntimeModelAdapter');
const native = require('../src/services/qualityElevation/qualityNativeGeneration');

function response(payload) {
  return provider.buildFinalResponse({ provider: 'ollama', payload,
    modelName: 'model:8b', text: 'Texte produit.', prompt: 'Brief' });
}
async function main() {
  const finished = response({ done: true, done_reason: 'stop', prompt_eval_count: 10, eval_count: 20 });
  assert.equal(finished.finishReason, 'stop');
  assert.equal(finished.tokenUsageMeasured, true);
  assert.equal(meteredReply(finished, finished.text).usage.outputTokens, 20);
  const truncated = response({ done: true, done_reason: 'length', prompt_eval_count: 10, eval_count: 20 });
  assert.equal(meteredReply(truncated, truncated.text).finishReason, 'length');
  assert.throws(() => meteredReply(response({ done_reason: 'stop' }), 'Texte'), { code: 'GQEL_USAGE_UNVERIFIED' });
  assert.throws(() => meteredReply(response({ prompt_eval_count: 10, eval_count: 20 }), 'Texte'), { code: 'GQEL_COMPLETION_UNVERIFIED' });
  const ctx = { mission: { workerContract: { qualityElevation: { maxOutputTokens: 200 } } },
    maxTokens: 60000, promptText: 'Brief' };
  const bounded = native.boundGeneration(ctx);
  assert.equal(bounded.maxTokens, 200); assert.equal(bounded.requestTokenBudget, 205);
  let calls = 0;
  const result = await native.generate(ctx, async () => { calls++; return { schemaViolation: true }; });
  assert.equal(result.schemaViolation, true); assert.equal(calls, 1);
  console.log('PASS native GQEL provider: measured usage, completion, truncation, bounded reservations and counted schema calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
