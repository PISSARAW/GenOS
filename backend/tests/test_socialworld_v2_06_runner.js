'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const runner = require('../../benchmarks/social-world/campaigns/socialworld-v2/run-v2-06.cjs');

test('V2-06 runner reports only safe provider readiness fields', async () => {
  const fakeProvider = {
    getModelStatus: () => ({ configured: true, apiKeyConfigured: true,
      provider: 'test-provider', modelName: 'test-model', endpoint: 'secret-endpoint', key: 'secret-key' }),
  };
  const result = await runner.runV206({ seed: 'socialworld-v2-01', readinessOnly: true }, fakeProvider);
  assert.deepEqual(result.readiness, {
    configured: true, apiKeyConfigured: true, provider: 'test-provider', model: 'test-model', reasonCode: null,
  });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('V2-06 pilot mode is separate from the registered campaign seed list', async () => {
  const fakeProvider = { getModelStatus: () => ({ configured: true, apiKeyConfigured: true,
    provider: 'test-provider', modelName: 'test-model' }) };
  const options = runner.parseArgs(['--pilot', '--work-dir', 'D:\\v2-06-work']);
  assert.equal(options.pilot, true);
  assert.equal(options.seed, undefined);
  const result = await runner.runV206({ pilot: true, readinessOnly: true }, fakeProvider);
  assert.equal(result.readiness.configured, true);
});

test('V2-06 model response parser accepts one JSON object only', () => {
  assert.deepEqual(runner.parseJsonResponse({ text: '{"action":"ask-for-update"}' }), {
    action: 'ask-for-update',
  });
  assert.throws(() => runner.parseJsonResponse({ text: 'not json' }), { code: 'MODEL_RESPONSE_INVALID' });
});

test('V2-06 model prompts do not expose intervention labels or expected actions', () => {
  const prompt = runner.sourceModelPrompt({ subjectAgentId: 'subject', otherAgentId: 'peer',
    memories: [{ id: 'm1', statement: 'The peer returned the draft.' }] });
  assert.equal(prompt.includes('supports'), false);
  assert.equal(prompt.includes('contradicts'), false);
  assert.equal(prompt.includes('propose-collaboration'), false);
  assert.equal(prompt.includes('The peer returned the draft.'), true);
});
