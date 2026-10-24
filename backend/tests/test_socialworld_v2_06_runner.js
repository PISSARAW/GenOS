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

test('V2-06 runner records its package runtime version', () => {
  assert.match(runner.runtimeVersion(), /^\d+\.\d+\.\d+/);
});

test('V2-06 runner preserves safe model failure categories', () => {
  const error = Object.assign(new Error('schema mismatch'), { code: 'MODEL_OUTPUT_SCHEMA_INVALID' });
  assert.equal(runner.safeFailure(error), 'MODEL_OUTPUT_SCHEMA_INVALID');
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
  assert.equal(prompt.includes('supportingMemoryIds'), true);
  assert.equal(prompt.includes('contradictingMemoryIds'), true);
  assert.equal(prompt.includes('proposition'), true);
  assert.equal(prompt.includes('unknowns'), true);
});

test('V2-06 counterfactuals use explicit event-keyed semantic inversions', () => {
  const protocol = require('../../benchmarks/social-world/campaigns/socialworld-v2/V2-06-experiences.json');
  const memories = protocol.events.map((event, index) => ({ id: `memory-${index}`, polarity: event.polarity,
    statement: event.statement }));
  const eventKeys = new Map(memories.map((memory, index) => [memory.id, protocol.events[index].eventKey]));
  const replacements = runner.counterfactuals(memories, protocol, eventKeys);

  assert.deepEqual(replacements.map((memory) => memory.statement), protocol.events.map((event) => event.counterfactualStatement));
  assert.deepEqual(replacements.map((memory) => memory.polarity), ['contradicts', 'contradicts', 'supports', 'supports']);
  assert.deepEqual(replacements.map((memory) => memory.counterfactualOf), memories.map((memory) => memory.id));
  assert.throws(() => runner.counterfactuals(memories, protocol, new Map()), { code: 'SOCIAL_COUNTERFACTUAL_SOURCE_EVENT_MISSING' });
});
