const assert = require('node:assert/strict');
const { candidateModels } = require('../src/services/modelRouter');

const candidates = candidateModels('openai://frontier', {
  primary: 'openai://configured-primary',
  fallbacks: ['openai://cloud-fallback', 'ollama://local-fallback'],
  parallelReview: [],
  mode: 'fallback',
  preferLocal: true
});

assert.deepEqual(candidates, [
  'openai://frontier',
  'ollama://local-fallback',
  'openai://cloud-fallback'
]);
console.log('Model router preserves primary precedence.');
