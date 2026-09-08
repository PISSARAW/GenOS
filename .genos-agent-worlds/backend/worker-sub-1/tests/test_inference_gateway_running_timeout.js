const assert = require('node:assert/strict');
const gateway = require('../src/services/inferenceGatewayService');

gateway.reset();
process.env.GENOS_INFERENCE_MAX_CONCURRENT = '1';
process.env.GENOS_INFERENCE_QUEUE_TIMEOUT_MS = '20';

let releaseFirst;
let releaseSecond;
const first = gateway.schedule(() => new Promise((resolve) => {
  releaseFirst = () => resolve('first');
}), { provider: 'ollama' });
const second = gateway.schedule(() => new Promise((resolve) => {
  releaseSecond = () => resolve('second');
}), { provider: 'ollama' });

setTimeout(() => releaseFirst(), 5);
setTimeout(() => releaseSecond(), 60);
Promise.all([first, second])
  .then((results) => assert.deepStrictEqual(results, ['first', 'second']))
  .then(() => console.log('Inference running-task timeout checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    gateway.reset();
    delete process.env.GENOS_INFERENCE_MAX_CONCURRENT;
    delete process.env.GENOS_INFERENCE_QUEUE_TIMEOUT_MS;
  });