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
    assert.deepEqual(result.cognitiveSeen.plan.obligations.map((item) => item.kind),
      ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK']);
    assert.deepEqual(result.cognitiveSeen.plan.residual, ['residual_inference', 'candidate_check']);
    assert.match(result.cognitive.digest, /^sha256:[a-f0-9]{64}$/);
    await assert.rejects(router.generate({ model: 'test://omega', prompt: '' }), /Cognitive compilation blocked/);
    console.log('G-CIR Omega router gateway checks passed.');
  } finally {
    routeRunner.runFallback = original;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
