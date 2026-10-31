'use strict';
const assert = require('node:assert/strict');
const { assertContextBudget } = require('../src/services/modelContextBudget');
const { workerPolicy } = require('../bin/directWorkerPolicy.cjs');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const router = require('../src/services/modelRouter');
const provider = require('../src/services/modelProvider');
const discovery = require('../src/services/localModelDiscovery');

assert.doesNotThrow(() => assertContextBudget({ prompt: 'x'.repeat(20000), maxTokens: 1000 }));
assert.doesNotThrow(() => assertContextBudget({ contextTokens: 256, prompt: 'x'.repeat(400), maxTokens: 156 }));
assert.throws(() => assertContextBudget({ contextTokens: 256, prompt: 'x'.repeat(400), maxTokens: 157 }), { code: 'MODEL_CONTEXT_LIMIT_EXCEEDED' });
assert.throws(() => assertContextBudget({ contextTokens: 255, prompt: 'test', maxTokens: 1 }), { code: 'MODEL_CONTEXT_LIMIT_EXCEEDED' });
const mission = buildWorkerMission({ agentId: 'worker-context', workerKind: 'bounded_worker',
  prompt: 'Read fixture.', localContextTokens: 16384, executionPolicy: workerPolicy() });
assert.equal(mission.localContextTokens, 16384);
const originals = { generate: provider.generate, modelConfiguration: provider.modelConfiguration, discover: discovery.discoverLocalModels };
discovery.discoverLocalModels = async () => [{ uri: 'ollama://fixture', chatCapable: true }];
let calls = 0;
provider.modelConfiguration = () => ({ provider: 'ollama', modelName: 'fixture',
  endpoint: 'http://127.0.0.1:11434/api/chat', configured: true });
provider.generate = async options => {
  calls += 1; assert.equal(options.contextTokens, 16384);
  return { text: 'ok', inputTokens: 1, outputTokens: 1, tokenUsageMeasured: true };
};
(async () => {
  await router.generate({ model: 'ollama://fixture', prompt: 'Read fixture.', maxTokens: 10, contextTokens: 16384 });
  assert.equal(calls, 1, 'context limit reaches the provider through the router');
  await assert.rejects(router.generate({ model: 'ollama://fixture', prompt: 'x'.repeat(2000), maxTokens: 10, contextTokens: 256 }), /explicit context/);
  assert.equal(calls, 1, 'oversized estimated request is refused before provider invocation');
  const originalRoute = router.generate;
  try {
    router.generate = async options => { assert.equal(options.contextTokens, 16384); return { text: 'ok' }; };
    await require('../src/services/workerEvidenceBarrierLocal').generateWorkerResult({
      mission: { agentId: 'worker-context', localContextTokens: 16384 }, executionRun: { id: 'context-run' },
      workerModel: 'ollama://fixture', maxTokens: 10, promptText: 'Read fixture.',
      responseFormatOverride: 'json_object', stageTimings: {} });
  } finally { router.generate = originalRoute; }

  console.log('Explicit worker context forwarding and pre-provider refusal: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  provider.generate = originals.generate; provider.modelConfiguration = originals.modelConfiguration;
  discovery.discoverLocalModels = originals.discover;
});
