'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/modelRouter');
const routeRunner = require('../src/services/modelRouteRunner');

const original = routeRunner.runFallback;
routeRunner.runFallback = async (candidates, context) => ({
  text: context.prompt, provider: 'test', model: candidates[0], cognitiveSeen: context.cognitiveContract
});

(async () => {
  try {
    const result = await router.generate({ model: 'test://omega', prompt: 'review residual', stream: false });
    assert.equal(result.text, 'review residual');
    assert.equal(result.cognitive.mode, 'portable_compatibility');
    assert.equal(result.cognitiveSeen.plan.status, 'ready');
    assert.equal(result.cognitive.execution.status, 'emitted');
    assert.equal(result.cognitive.execution.economy.source, 'omega_cognitive_economy_v1');
    assert.deepEqual(result.cognitive.execution.operations.map((item) => item.kind),
      ['READ', 'SELECT', 'INFER']);
    assert.equal(result.cognitive.execution.operations[2].status, 'ready');
    assert.deepEqual(result.cognitiveSeen.plan.obligations.map((item) => item.kind),
      ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK']);
    assert.deepEqual(result.cognitiveSeen.plan.residual, ['residual_inference', 'candidate_check']);
    assert.match(result.cognitive.digest, /^sha256:[a-f0-9]{64}$/);
    const native = await router.generate({
      model: 'test://omega', prompt: 'run native trinity graph', stream: false,
      cognitiveDomain: 'trinity', cognitiveObjects: { mission: 'm1', experiment: 'e1' },
      cognitiveEffects: ['promote'], cognitiveLevel: 'L3', cognitiveNativeExecution: true,
      cognitiveNativeHandlers: {
        tools: { 'trinity/experiment': async ({ arguments: input }) => ({ ...input, prepared: true }) },
        emitters: { 'trinity.promote': async ({ value }) => ({ promoted: value }) }
      },
      cognitiveAllowEmit: true,
      cognitiveVerifierRegistry: { get: () => async () => ({ status: 'verified', valid: true }) }
    });
    assert.equal(native.text, 'run native trinity graph');
    assert.deepEqual(native.cognitive.execution.operations.map((item) => item.kind),
      ['READ', 'READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'EMIT']);
    assert.equal(native.cognitive.execution.operations.find((item) => item.kind === 'CALL').status, 'ready');
    assert.equal(native.cognitive.execution.operations.find((item) => item.kind === 'CHECK').status, 'verified');
    assert.equal(native.cognitive.execution.operations.find((item) => item.kind === 'EMIT').status, 'emitted');
    await assert.rejects(router.generate({ model: 'test://omega', prompt: 'native handlers required',
      stream: false, cognitiveDomain: 'trinity', cognitiveObjects: { mission: 'm2' } }),
      (error) => error.code === 'OMEGA_NATIVE_GRAPH_BLOCKED'
        && error.omegaExecution.operations.some((item) => item.reason === 'tool_missing'));
    await assert.rejects(router.generate({ model: 'test://omega', prompt: '' }), /Cognitive compilation blocked/);
    console.log('G-CIR Omega router gateway checks passed.');
  } finally {
    routeRunner.runFallback = original;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
