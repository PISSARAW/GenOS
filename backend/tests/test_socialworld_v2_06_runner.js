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
  const revisionTwo = await runner.runV206({ seed: 'socialworld-v2-01', revision: '2', readinessOnly: true }, fakeProvider);
  assert.equal(revisionTwo.readiness.configured, true);
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
  assert.match(prompt, /include every visible memory ID exactly once/);
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

test('V2-06 decision prompt uses only the supplied model, not raw memories', () => {
  const prompt = runner.decisionPrompt({ model: { relationHypotheses: [{ relationType: 'unknown' }],
    sourceMemoryIds: [] }, memories: [{ id: 'hidden-memory', statement: 'raw memory must not be copied' }],
    delayedContext: 'new request', permissionPolicy: [], decisionPolicy: { version: 'test-policy' } });
  assert.match(prompt, /only the supplied social model/);
  assert.match(prompt, /Persisted social model read back from the runtime/);
  assert.equal(prompt.includes('raw memory must not be copied'), false);
  assert.equal(prompt.includes('hidden-memory'), false);
  assert.match(prompt, /pre-registered evidence-to-action policy/);
  assert.match(prompt, /test-policy/);
});

test('V2-06 source extraction is anchored to a quote from the peer dialogue', () => {
  const peerText = 'I completed the review and cited the source used.';
  const prompt = runner.sourceExtractionPrompt({ question: 'Did the peer complete the review?',
    turns: [{ speaker: 'peer', utterance: peerText }] });
  assert.match(prompt, /only the persisted dialogue turns/);
  assert.equal(prompt.includes('supports'), false);
  assert.deepEqual(runner.validateSocialExtraction({ answer: 'yes', evidenceQuote: 'completed the review' }, peerText),
    { answer: 'yes', evidenceQuote: 'completed the review' });
  assert.equal(runner.polarityFromAnswer('yes', 'supports'), 'supports');
  assert.equal(runner.polarityFromAnswer('no', 'supports'), 'contradicts');
  assert.throws(() => runner.validateSocialExtraction({ answer: 'yes', evidenceQuote: 'invented quote' }, peerText),
    { code: 'SOCIAL_DIALOGUE_EXTRACTION_INVALID' });
});

test('V2-06 extracted source memory uses the peer quote, not the protocol summary', async () => {
  const quote = 'I completed the review and cited its source.'; let prompt = '';
  const observation = await runner.extractSocialObservation({
    provider: { generate: async (input) => {
      prompt = input.prompt;
      return { text: JSON.stringify({ answer: 'yes', evidenceQuote: quote }), provider: 'ollama', servedModel: 'qwen2.5:14b' };
    } },
    providerInput: { model: 'ollama://qwen2.5:14b' }, seed: 12, peerAgentId: 'peer',
    event: { relationType: 'collaborator', question: 'Did the peer complete the review?',
      statement: 'Harness supplied a source summary.', polarity: 'supports', polarityWhenAnswerYes: 'supports' },
    turns: [{ speaker: 'subject', utterance: 'Are you done?' }, { speaker: 'peer', utterance: quote }], evidenceRefs: ['dialogue:session:turn:2'],
  });
  assert.equal(observation.statement, quote);
  assert.equal(observation.polarity, 'supports');
  assert.equal(prompt.includes('Harness supplied a source summary.'), false);
  assert.equal(observation.socialExtraction.receipt.provenance, 'genos-modelProvider-local-invocation');
});
