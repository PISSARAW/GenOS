const assert = require('node:assert/strict');
const provider = require('../src/services/modelProvider');

assert.doesNotThrow(() => provider.assertSafeProviderEndpoint('http://127.0.0.1:11434/v1/chat/completions'));
assert.doesNotThrow(() => provider.assertSafeProviderEndpoint('https://api.example.test/v1/chat/completions'));
for (const endpoint of [
  'http://169.254.169.254/latest/meta-data',
  'http://metadata.google.internal/computeMetadata/v1',
  'http://100.100.100.200/latest/meta-data'
]) {
  assert.throws(() => provider.assertSafeProviderEndpoint(endpoint), /blocked metadata|link-local/);
}

console.log('Model provider endpoint safety checks passed.');